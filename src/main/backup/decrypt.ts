import { scrypt } from 'crypto'
import nacl from 'tweetnacl'

/*
 * Формат бэкапа (Decryptor.cs в YandexKeyExtractor):
 *   base64(url-safe) → nonce (24) | MAC (16) | ciphertext | salt (16)
 *   ключ = scrypt(UTF-8 пароль, salt, N=32768, r=20, p=1, 32 байта)
 *   NaCl secretbox (XSalsa20-Poly1305), MAC идёт перед шифротекстом — как ожидает secretbox.open.
 */
const SALT_LEN = 16
const NONCE_LEN = 24
const MAC_LEN = 16
const SCRYPT = { N: 32768, r: 20, p: 1, maxmem: 256 * 1024 * 1024 }

function normalizeBase64(s: string): string {
  const b = s.trim().replace(/-/g, '+').replace(/_/g, '/')
  return b + '='.repeat((4 - (b.length % 4)) % 4)
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(Buffer.from(password, 'utf8'), salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** Сведения о блобе для журнала: без содержимого, только размеры и аномалии. */
export function inspectBackup(backup: string): string {
  const normalized = normalizeBase64(backup)
  const bad = normalized.replace(/[A-Za-z0-9+/=]/g, '').length
  const bytes = Buffer.from(normalized, 'base64').length
  const box = bytes - NONCE_LEN - SALT_LEN
  return `бэкап: ${backup.length} символов base64, ${bytes} байт, secretbox ${box} байт, посторонних символов ${bad}`
}

/** Варианты пароля, которые не меняют его смысл: пробелы по краям и формы Unicode. */
function passwordVariants(password: string): string[] {
  const variants = [password, password.trim(), password.normalize('NFC'), password.normalize('NFD')]
  return [...new Set(variants)].filter(Boolean)
}

/** Возвращает расшифрованный текст или null при неверном пароле. */
export async function decryptBackup(backup: string, password: string): Promise<string | null> {
  const data = Buffer.from(normalizeBase64(backup), 'base64')
  if (data.length < NONCE_LEN + MAC_LEN + SALT_LEN) throw new Error('Бэкап слишком короткий — формат изменился?')

  const salt = Buffer.from(data.subarray(data.length - SALT_LEN))
  const nonce = data.subarray(0, NONCE_LEN)
  const box = data.subarray(NONCE_LEN, data.length - SALT_LEN)

  for (const candidate of passwordVariants(password)) {
    const key = await deriveKey(candidate, salt)
    const plain = nacl.secretbox.open(box, nonce, key)
    key.fill(0)
    if (!plain) continue

    const text = Buffer.from(plain).toString('utf8').replace(/\0+$/, '')
    plain.fill(0)
    return text
  }
  return null
}
