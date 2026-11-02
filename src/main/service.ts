import { randomUUID } from 'crypto'
import type { Account, AccountView, AddInput, AddResult, BackupEntry, CodeView } from '@shared/types'
import { BackupClient } from './backup/api'
import { decryptBackup, inspectBackup } from './backup/decrypt'
import { log } from './logger'
import { base32Decode, normalizeBase32 } from './otp/base32'
import { generateCode } from './otp'
import { YANDEX_DIGITS, YANDEX_PERIOD, yandexKey } from './otp/yandex'
import { getSettings } from './settings'
import { buildOtpauth, parseOtpauth, secretFingerprint, type ParsedUri } from './uri'
import { Vault } from './vault'

export const vault = new Vault()

export function toView(a: Account): AccountView {
  return {
    id: a.id,
    name: a.name,
    issuer: a.issuer,
    type: a.type,
    algo: a.algo,
    digits: a.digits,
    period: a.period,
    hasPin: !!a.pin
  }
}

export function listViews(): AccountView[] {
  return vault.list().map(toView)
}

export function codes(): Record<string, CodeView> {
  const now = Date.now()
  const out: Record<string, CodeView> = {}
  for (const a of vault.list()) {
    try {
      out[a.id] = generateCode(a, now)
    } catch {
      out[a.id] = { code: null, remaining: 0, period: a.period }
    }
  }
  return out
}

export function findAccount(id: string): Account {
  const a = vault.list().find((x) => x.id === id)
  if (!a) throw new Error('Аккаунт не найден')
  return a
}

/** Поиск по имени для `yakey --copy <name>`: точное имя, issuer:name, затем префикс. */
export function findByName(query: string): Account | undefined {
  const q = query.toLowerCase()
  const all = vault.list()
  return (
    all.find((a) => a.name.toLowerCase() === q) ??
    all.find((a) => `${a.issuer}:${a.name}`.toLowerCase() === q) ??
    all.find((a) => a.name.toLowerCase().startsWith(q))
  )
}

export function currentCode(id: string): string {
  const a = findAccount(id)
  const { code } = generateCode(a)
  if (!code) throw new Error('Для аккаунта Яндекса нужно указать PIN')
  return code
}

function accountFromSecret(input: Extract<AddInput, { kind: 'secret' }>): Account {
  const secret = normalizeBase32(input.secret)
  const bytes = base32Decode(secret)
  try {
    if (input.type === 'yandex') {
      yandexKey(bytes)
      if (!input.pin) throw new Error('Для аккаунта Яндекса нужен PIN')
    } else if (bytes.length < 10) {
      throw new Error('Секрет слишком короткий (меньше 80 бит)')
    }
  } finally {
    bytes.fill(0)
  }
  const name = input.name.trim()
  if (!name) throw new Error('Укажите название')
  if (input.type === 'yandex') {
    return {
      id: randomUUID(),
      name,
      issuer: input.issuer.trim() || 'Yandex',
      type: 'yandex',
      secret,
      algo: 'SHA256',
      digits: YANDEX_DIGITS,
      period: YANDEX_PERIOD,
      pin: input.pin
    }
  }
  return {
    id: randomUUID(),
    name,
    issuer: input.issuer.trim(),
    type: 'totp',
    secret,
    algo: input.algo,
    digits: input.digits,
    period: input.period
  }
}

/** Добавляет аккаунты, пропуская повторы по секрету. */
export async function addAccounts(candidates: Account[]): Promise<{ added: number; skipped: number }> {
  const existing = vault.list()
  const seen = new Set(existing.map(secretFingerprint))
  const next = [...existing]
  let added = 0
  let skipped = 0
  for (const a of candidates) {
    const fp = secretFingerprint(a)
    if (seen.has(fp)) {
      skipped++
      continue
    }
    seen.add(fp)
    next.push(a)
    added++
  }
  if (added) await vault.setAccounts(next)
  return { added, skipped }
}

export async function addFromInput(input: AddInput): Promise<AddResult> {
  if (input.kind === 'uri') return addFromUriText(input.uri)
  const res = await addAccounts([accountFromSecret(input)])
  return { ...res, unsupported: 0 }
}

/** Несколько otpauth:// ссылок (по одной на строку). */
export async function addFromUriText(text: string): Promise<AddResult> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) throw new Error('Вставьте otpauth:// ссылку')
  const parsed = lines.map(parseOtpauth)
  const failed = parsed.filter((p): p is Extract<ParsedUri, { ok: false }> => !p.ok)
  if (failed.length === lines.length) throw new Error(`Ссылка не распознана: ${failed[0].reason}`)
  for (const f of failed) log('error', `Пропущено «${f.name}»: ${f.reason}`)
  const ok = parsed.filter((p): p is Extract<ParsedUri, { ok: true }> => p.ok).map((p) => p.account)
  const res = await addAccounts(ok)
  return { ...res, unsupported: failed.length }
}

export async function updateAccount(id: string, patch: { name?: string; issuer?: string; pin?: string }): Promise<void> {
  const next = vault.list().map((a) => {
    if (a.id !== id) return a
    const u = { ...a }
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new Error('Название не может быть пустым')
      u.name = patch.name.trim()
    }
    if (patch.issuer !== undefined) u.issuer = patch.issuer.trim()
    if (patch.pin !== undefined && a.type === 'yandex') u.pin = patch.pin || undefined
    return u
  })
  await vault.setAccounts(next)
}

export async function removeAccount(id: string): Promise<void> {
  findAccount(id)
  await vault.setAccounts(vault.list().filter((a) => a.id !== id))
}

export function exportUris(): string {
  return vault.list().map(buildOtpauth).join('\n')
}

/* ---------- импорт облачного бэкапа ---------- */

interface BackupSession {
  client: BackupClient
  country: string
  phone: string
  trackId?: string
  blob?: string
  parsed?: ParsedUri[]
}

let session: BackupSession | null = null

function debugLog(message: string): void {
  if (getSettings().debug) log('debug', message)
}

function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 4)}•••${phone.slice(-2)}` : phone
}

export async function backupStart(rawPhone: string): Promise<{ phone: string }> {
  if (!rawPhone.trim()) throw new Error('Укажите номер телефона')
  const client = new BackupClient(debugLog)
  const country = await client.getCountry()
  const phone = await client.normalizePhone(rawPhone, country)
  log('info', `Импорт: отправка СМС на ${maskPhone(phone)}`)
  const trackId = await client.sendCode(phone, country)
  session = { client, country, phone, trackId }
  return { phone: maskPhone(phone) }
}

export async function backupVerify(code: string): Promise<{ updated: number }> {
  if (!session?.trackId) throw new Error('Сначала запросите СМС')
  const s = session
  await s.client.checkCode(code.trim(), s.trackId!)
  const updated = await s.client.backupInfo(s.phone, s.trackId!, s.country)
  s.blob = await s.client.download(s.phone, s.trackId!)
  log('info', `Импорт: бэкап получен (обновлён ${new Date(updated * 1000).toLocaleString('ru-RU')})`)
  return { updated }
}

export async function backupDecrypt(password: string): Promise<BackupEntry[]> {
  if (!session?.blob) throw new Error('Бэкап ещё не скачан')
  const text = await decryptBackup(session.blob, password)
  if (text === null) {
    log('error', `Импорт: пароль не подошёл (${inspectBackup(session.blob)})`)
    throw Object.assign(new Error('Неверный пароль бэкапа'), { code: 'bad-password' })
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('otpauth'))
  session.parsed = lines.map(parseOtpauth)
  const existing = new Set(vault.unlocked ? vault.list().map(secretFingerprint) : [])
  log('info', `Импорт: расшифровано записей — ${lines.length}`)

  return session.parsed.map((p, index) =>
    p.ok
      ? {
          index,
          name: p.account.name,
          issuer: p.account.issuer,
          type: p.account.type,
          pinLength: p.pinLength,
          hasPin: !!p.account.pin,
          duplicate: existing.has(secretFingerprint(p.account))
        }
      : { index, name: p.name || '—', issuer: p.issuer, type: 'unsupported', pinLength: null, hasPin: false, duplicate: false }
  )
}

/** Зашифрованный бэкап как есть — для независимой проверки (scripts/decrypt-backup.py). */
export function backupBlob(): string {
  if (!session?.blob) throw new Error('Бэкап ещё не скачан')
  return session.blob
}

export async function backupCommit(selection: { index: number; pin?: string }[]): Promise<AddResult> {
  if (!session?.parsed) throw new Error('Бэкап не расшифрован')
  const parsed = session.parsed
  const accounts: Account[] = []
  for (const { index, pin } of selection) {
    const p = parsed[index]
    if (!p?.ok) continue
    const a = { ...p.account }
    if (a.type === 'yandex' && pin) a.pin = pin
    accounts.push(a)
  }
  const res = await addAccounts(accounts)
  log('info', `Импорт: добавлено ${res.added}, пропущено повторов ${res.skipped}`)
  backupCancel()
  return { ...res, unsupported: parsed.filter((p) => !p.ok).length }
}

export function backupCancel(): void {
  if (session?.parsed) {
    for (const p of session.parsed) {
      if (p.ok) {
        p.account.secret = ''
        p.account.pin = undefined
      }
    }
  }
  session = null
}
