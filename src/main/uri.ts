import { randomUUID } from 'crypto'
import type { Account, Algo } from '@shared/types'
import { base32Decode, base32Encode, normalizeBase32 } from './otp/base32'
import { YANDEX_DIGITS, YANDEX_PERIOD, yandexKey } from './otp/yandex'

export type ParsedUri =
  | { ok: true; account: Account; pinLength: number | null }
  | { ok: false; reason: string; name: string; issuer: string }

const ALGOS: Algo[] = ['SHA1', 'SHA256', 'SHA512']

function splitLabel(label: string): { issuer: string; name: string } {
  const idx = label.indexOf(':')
  if (idx >= 0 && label.indexOf(':', idx + 1) < 0) {
    return { issuer: label.slice(0, idx).trim(), name: label.slice(idx + 1).trim() }
  }
  return { issuer: '', name: label.trim() }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Разбор otpauth://totp|yaotp/... (yaotp — формат Яндекс Ключа и Aegis). */
export function parseOtpauth(raw: string): ParsedUri {
  const text = raw.trim()
  const m = /^otpauth:\/\/([^/?#]+)\/?([^?#]*)\??([^#]*)/i.exec(text)
  if (!m) return { ok: false, reason: 'не otpauth:// ссылка', name: text.slice(0, 40), issuer: '' }

  const kind = m[1].toLowerCase()
  const label = safeDecode(m[2])
  const params = new URLSearchParams(m[3])
  const { issuer: labelIssuer, name: labelName } = splitLabel(label)
  const issuer = labelIssuer || params.get('issuer') || ''
  const name = labelName || params.get('name') || ''

  if (kind !== 'totp' && kind !== 'yaotp') {
    return { ok: false, reason: `тип «${kind}» не поддерживается`, name, issuer }
  }

  const secretParam = params.get('secret')
  if (!secretParam) return { ok: false, reason: 'нет параметра secret', name, issuer }

  let secretBytes: Buffer
  try {
    secretBytes = base32Decode(secretParam)
  } catch (e) {
    return { ok: false, reason: (e as Error).message, name, issuer }
  }

  const id = randomUUID()

  if (kind === 'yaotp') {
    try {
      yandexKey(secretBytes)
    } catch (e) {
      return { ok: false, reason: (e as Error).message, name, issuer }
    }
    let pin: string | undefined
    const pinParam = params.get('pin')
    if (pinParam) {
      // Aegis кладёт PIN как base32 от UTF-8 строки
      try {
        pin = base32Decode(pinParam).toString('utf8')
      } catch {
        pin = pinParam
      }
    }
    const pinLengthParam = params.get('pin_length')
    const pinLength = pinLengthParam ? Number.parseInt(pinLengthParam, 10) || null : null
    secretBytes.fill(0)
    return {
      ok: true,
      pinLength,
      account: {
        id,
        name: params.get('name') || name || 'Яндекс',
        issuer: issuer || 'Yandex',
        type: 'yandex',
        secret: normalizeBase32(secretParam),
        algo: 'SHA256',
        digits: YANDEX_DIGITS,
        period: YANDEX_PERIOD,
        pin
      }
    }
  }

  const algoParam = (params.get('algorithm') || 'SHA1').toUpperCase() as Algo
  if (!ALGOS.includes(algoParam)) return { ok: false, reason: `алгоритм ${algoParam} не поддерживается`, name, issuer }
  const digits = Number.parseInt(params.get('digits') || '6', 10)
  if (!(digits >= 6 && digits <= 8)) return { ok: false, reason: `digits=${digits} вне диапазона 6–8`, name, issuer }
  const period = Number.parseInt(params.get('period') || '30', 10)
  if (!(period > 0 && period <= 300)) return { ok: false, reason: `period=${period} некорректен`, name, issuer }
  secretBytes.fill(0)

  return {
    ok: true,
    pinLength: null,
    account: { id, name: name || issuer || 'без имени', issuer, type: 'totp', secret: normalizeBase32(secretParam), algo: algoParam, digits, period }
  }
}

export function buildOtpauth(a: Account): string {
  const label = a.issuer ? `${encodeURIComponent(a.issuer)}:${encodeURIComponent(a.name)}` : encodeURIComponent(a.name)
  const params = new URLSearchParams({ secret: a.secret })
  if (a.issuer) params.set('issuer', a.issuer)
  if (a.type === 'yandex') {
    if (a.pin) params.set('pin', base32Encode(Buffer.from(a.pin, 'utf8')))
    return `otpauth://yaotp/${label}?${params.toString()}`
  }
  params.set('algorithm', a.algo)
  params.set('digits', String(a.digits))
  params.set('period', String(a.period))
  return `otpauth://totp/${label}?${params.toString()}`
}

/** Ключ для поиска дубликатов: тип + байты секрета (для Yandex — первые 16). */
export function secretFingerprint(a: Pick<Account, 'type' | 'secret'>): string {
  const bytes = base32Decode(a.secret)
  const key = a.type === 'yandex' ? bytes.subarray(0, 16) : bytes
  const fp = `${a.type}:${base32Encode(key)}`
  bytes.fill(0)
  return fp
}
