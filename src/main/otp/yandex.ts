import { createHash, createHmac } from 'crypto'

export const YANDEX_SECRET_LENGTH = 16
export const YANDEX_SECRET_FULL_LENGTH = 26
export const YANDEX_DIGITS = 8
export const YANDEX_PERIOD = 30

const ALPHABET_SIZE = 26n

/** Из 26-байтного секрета (ключ + контрольная сумма) берём первые 16 байт. */
export function yandexKey(secret: Uint8Array): Buffer {
  if (secret.length !== YANDEX_SECRET_LENGTH && secret.length !== YANDEX_SECRET_FULL_LENGTH) {
    throw new Error(`Неверная длина секрета Yandex: ${secret.length} байт (ожидается 16 или 26)`)
  }
  return Buffer.from(secret.subarray(0, YANDEX_SECRET_LENGTH))
}

/** Yandex OTP: 8 букв a–z, схема как в Aegis (YAOTP). */
export function yandexOtp(secret: Uint8Array, pin: string, unixSeconds: number): string {
  const key16 = yandexKey(secret)
  const full = createHash('sha256').update(Buffer.from(pin, 'utf8')).update(key16).digest()
  const key = full[0] === 0 ? full.subarray(1) : full

  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / YANDEX_PERIOD)))
  const mac = createHmac('sha256', key).update(counter).digest()

  const offset = mac[mac.length - 1] & 0x0f
  mac[offset] &= 0x7f
  let value = mac.readBigUInt64BE(offset) % ALPHABET_SIZE ** BigInt(YANDEX_DIGITS)

  let code = ''
  for (let i = 0; i < YANDEX_DIGITS; i++) {
    code = String.fromCharCode(97 + Number(value % ALPHABET_SIZE)) + code
    value /= ALPHABET_SIZE
  }

  key16.fill(0)
  full.fill(0)
  mac.fill(0)
  return code
}
