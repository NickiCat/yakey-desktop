import { randomBytes } from 'crypto'
import { promises as fs, constants as fsc } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { argon2id } from 'hash-wasm'
import type { Account } from '@shared/types'

/*
 * Формат vault.bin:
 *   magic "YAKEYV" (6) | version u8 | argon2 m KiB u32be | t u32be | p u8 | salt (16) | nonce (24) | ciphertext+tag
 * Весь заголовок до шифротекста идёт как AAD.
 */
const MAGIC = Buffer.from('YAKEYV', 'ascii')
const VERSION = 1
const SALT_LEN = 16
const NONCE_LEN = 24
const HEADER_LEN = MAGIC.length + 1 + 4 + 4 + 1 + SALT_LEN + NONCE_LEN

export interface KdfParams {
  m: number
  t: number
  p: number
}

export const DEFAULT_KDF: KdfParams = { m: 64 * 1024, t: 3, p: 1 }

export class VaultError extends Error {
  constructor(
    message: string,
    readonly code: 'bad-password' | 'locked' | 'format'
  ) {
    super(message)
  }
}

export function vaultPath(): string {
  const base =
    process.env.XDG_DATA_HOME || (process.platform === 'win32' && process.env.APPDATA) || join(homedir(), '.local', 'share')
  return join(base, 'yakey', 'vault.bin')
}

async function deriveKey(password: string, salt: Uint8Array, kdf: KdfParams): Promise<Buffer> {
  const out = await argon2id({
    password,
    salt,
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary'
  })
  return Buffer.from(out as Uint8Array)
}

function encodeHeader(kdf: KdfParams, salt: Buffer, nonce: Buffer): Buffer {
  const h = Buffer.alloc(HEADER_LEN)
  let o = MAGIC.copy(h, 0)
  h.writeUInt8(VERSION, o++)
  h.writeUInt32BE(kdf.m, o)
  o += 4
  h.writeUInt32BE(kdf.t, o)
  o += 4
  h.writeUInt8(kdf.p, o++)
  o += salt.copy(h, o)
  nonce.copy(h, o)
  return h
}

function decodeHeader(buf: Buffer): { kdf: KdfParams; salt: Buffer; nonce: Buffer; header: Buffer } {
  if (buf.length < HEADER_LEN + 16 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new VaultError('Файл хранилища повреждён или имеет неизвестный формат', 'format')
  }
  let o = MAGIC.length
  const version = buf.readUInt8(o++)
  if (version !== VERSION) throw new VaultError(`Неподдерживаемая версия хранилища: ${version}`, 'format')
  const m = buf.readUInt32BE(o)
  o += 4
  const t = buf.readUInt32BE(o)
  o += 4
  const p = buf.readUInt8(o++)
  const salt = Buffer.from(buf.subarray(o, o + SALT_LEN))
  o += SALT_LEN
  const nonce = Buffer.from(buf.subarray(o, o + NONCE_LEN))
  return { kdf: { m, t, p }, salt, nonce, header: buf.subarray(0, HEADER_LEN) }
}

async function atomicWrite(path: string, data: Buffer): Promise<void> {
  const dir = dirname(path)
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.chmod(dir, 0o700)
  const tmp = `${path}.tmp-${process.pid}`
  const fh = await fs.open(tmp, fsc.O_WRONLY | fsc.O_CREAT | fsc.O_TRUNC, 0o600)
  try {
    await fh.writeFile(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fs.rename(tmp, path)
  // на Windows fsync каталога недоступен (EPERM)
  if (process.platform === 'win32') return
  const dh = await fs.open(dir, fsc.O_RDONLY)
  try {
    await dh.sync()
  } finally {
    await dh.close()
  }
}

function decryptAccounts(buf: Buffer, key: Buffer): Account[] {
  const { nonce, header } = decodeHeader(buf)
  let plain: Uint8Array
  try {
    plain = xchacha20poly1305(key, nonce, header).decrypt(buf.subarray(HEADER_LEN))
  } catch {
    throw new VaultError('Неверный мастер-пароль', 'bad-password')
  }
  try {
    return JSON.parse(Buffer.from(plain).toString('utf8')) as Account[]
  } finally {
    plain.fill(0)
  }
}

export class Vault {
  private key: Buffer | null = null
  private salt: Buffer | null = null
  private kdf: KdfParams = DEFAULT_KDF
  private accounts: Account[] = []
  private open = false
  private passwordUnlockedAt = 0
  private quickUntil = 0
  private quickTimer: NodeJS.Timeout | null = null

  constructor(readonly path = vaultPath()) {}

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.path)
      return true
    } catch {
      return false
    }
  }

  get unlocked(): boolean {
    return this.open && this.key !== null
  }

  /** Ключ сохранён в памяти после «мягкой» блокировки — можно открыть без пароля (по отпечатку). */
  get quickUnlockAvailable(): boolean {
    return !this.open && this.key !== null && Date.now() < this.quickUntil
  }

  async create(password: string): Promise<void> {
    if (await this.exists()) throw new Error('Хранилище уже существует')
    this.forgetKey()
    this.salt = randomBytes(SALT_LEN)
    this.kdf = DEFAULT_KDF
    this.key = await deriveKey(password, this.salt, this.kdf)
    this.accounts = []
    this.open = true
    this.passwordUnlockedAt = Date.now()
    await this.save()
  }

  async unlock(password: string): Promise<void> {
    const buf = await fs.readFile(this.path)
    const { kdf, salt } = decodeHeader(buf)
    const key = await deriveKey(password, salt, kdf)
    try {
      this.accounts = decryptAccounts(buf, key)
    } catch (e) {
      key.fill(0)
      throw e
    }
    this.forgetKey()
    this.key = key
    this.salt = salt
    this.kdf = kdf
    this.open = true
    this.passwordUnlockedAt = Date.now()
  }

  /** Открыть готовым ключом (режим без пароля: ключ из системной связки ключей). */
  async unlockWithKey(key: Buffer): Promise<void> {
    const buf = await fs.readFile(this.path)
    const { kdf, salt } = decodeHeader(buf)
    const own = Buffer.from(key)
    try {
      this.accounts = decryptAccounts(buf, own)
    } catch {
      own.fill(0)
      throw new VaultError('Сохранённый ключ не подходит к хранилищу', 'bad-password')
    }
    this.forgetKey()
    this.key = own
    this.salt = salt
    this.kdf = kdf
    this.open = true
    this.passwordUnlockedAt = Date.now()
  }

  /** Копия ключа для сохранения в связке ключей. */
  exportKey(): Buffer {
    this.requireUnlocked()
    return Buffer.from(this.key!)
  }

  async verifyPassword(password: string): Promise<boolean> {
    this.requireUnlocked()
    const { kdf, salt } = decodeHeader(await fs.readFile(this.path))
    const check = await deriveKey(password, salt, kdf)
    const same = this.key!.equals(check)
    check.fill(0)
    return same
  }

  /** Открыть ключом, оставшимся в памяти после мягкой блокировки. Проверку отпечатка делает вызывающий. */
  async quickUnlock(): Promise<void> {
    if (!this.quickUnlockAvailable) {
      this.forgetKey()
      throw new VaultError('Быстрая разблокировка недоступна — введите пароль', 'locked')
    }
    const buf = await fs.readFile(this.path)
    const { salt } = decodeHeader(buf)
    if (!salt.equals(this.salt!)) {
      this.forgetKey()
      throw new VaultError('Хранилище изменилось — введите пароль', 'locked')
    }
    try {
      this.accounts = decryptAccounts(buf, this.key!)
    } catch {
      this.forgetKey()
      throw new VaultError('Не удалось открыть хранилище сохранённым ключом — введите пароль', 'locked')
    }
    this.open = true
  }

  /**
   * Блокировка. quickMs > 0 — мягкая: расшифрованные аккаунты стираются, а ключ остаётся в памяти
   * не дольше quickMs с последнего ввода пароля. quickMs = 0 — ключ стирается тоже.
   */
  lock(quickMs = 0): void {
    for (const a of this.accounts) {
      a.secret = ''
      if (a.pin) a.pin = ''
    }
    this.accounts = []
    this.open = false

    const until = this.passwordUnlockedAt + quickMs
    if (quickMs > 0 && this.key && Date.now() < until) {
      this.quickUntil = until
      if (this.quickTimer) clearTimeout(this.quickTimer)
      this.quickTimer = setTimeout(() => this.forgetKey(), until - Date.now())
    } else {
      this.forgetKey()
    }
  }

  /** Стереть ключ из памяти: дальше только пароль. */
  forgetKey(): void {
    if (this.open) return
    if (this.quickTimer) clearTimeout(this.quickTimer)
    this.quickTimer = null
    this.quickUntil = 0
    this.key?.fill(0)
    this.salt?.fill(0)
    this.key = null
    this.salt = null
  }

  list(): Account[] {
    this.requireUnlocked()
    return this.accounts
  }

  async setAccounts(accounts: Account[]): Promise<void> {
    this.requireUnlocked()
    this.accounts = accounts
    await this.save()
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!(await this.verifyPassword(oldPassword))) throw new VaultError('Неверный текущий пароль', 'bad-password')
    await this.setPassword(newPassword)
  }

  /** Перешифровать новым паролем без проверки старого — только когда хранилище уже открыто. */
  async setPassword(newPassword: string): Promise<void> {
    this.requireUnlocked()
    const newSalt = randomBytes(SALT_LEN)
    const newKey = await deriveKey(newPassword, newSalt, DEFAULT_KDF)
    this.key!.fill(0)
    this.key = newKey
    this.salt = newSalt
    this.kdf = DEFAULT_KDF
    await this.save()
  }

  private requireUnlocked(): void {
    if (!this.unlocked) throw new VaultError('Хранилище заблокировано', 'locked')
  }

  private async save(): Promise<void> {
    this.requireUnlocked()
    const nonce = randomBytes(NONCE_LEN)
    const header = encodeHeader(this.kdf, this.salt!, nonce)
    const plain = Buffer.from(JSON.stringify(this.accounts), 'utf8')
    const ct = xchacha20poly1305(this.key!, nonce, header).encrypt(plain)
    plain.fill(0)
    await atomicWrite(this.path, Buffer.concat([header, ct]))
  }
}
