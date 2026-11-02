import type { PasswordPolicy } from './password'

export type OtpType = 'totp' | 'yandex'
export type Algo = 'SHA1' | 'SHA256' | 'SHA512'

/** Аккаунт в хранилище (только main-процесс, содержит секреты). */
export interface Account {
  id: string
  name: string
  issuer: string
  type: OtpType
  /** base32 без паддинга */
  secret: string
  algo: Algo
  digits: number
  period: number
  pin?: string
}

/** То, что видит renderer: без секрета и PIN. */
export interface AccountView {
  id: string
  name: string
  issuer: string
  type: OtpType
  algo: Algo
  digits: number
  period: number
  hasPin: boolean
}

export interface CodeView {
  code: string | null
  remaining: number
  period: number
}

export interface VaultStatus {
  exists: boolean
  unlocked: boolean
  path: string
  /** можно открыть отпечатком (ключ ещё в памяти и функция включена) */
  fingerprint: boolean
  /** мастер-пароль отключён: ключ в системной связке ключей, хранилище открывается само */
  passwordless: boolean
}

export interface FingerprintStatus {
  available: boolean
  reason: string
  /** зарегистрированные пальцы в нотации fprintd: right-index-finger и т.п. */
  fingers: string[]
}

export type ClipboardMethod = 'auto' | 'wl-copy' | 'electron'

export interface Settings {
  clipboardClearSeconds: number
  autoLockMinutes: number
  runInBackground: boolean
  /** блокировать хранилище при блокировке экрана и уходе в сон */
  lockOnSessionLock: boolean
  fingerprintUnlock: boolean
  /**
   * палец для fprintd-verify -f; 'auto' — по очереди, начиная с последнего удачного;
   * 'any' — на усмотрение fprintd (часто только первый зарегистрированный)
   */
  fingerprintFinger: string
  /** палец, который сработал в прошлый раз (для режима auto) */
  fingerprintLastFinger: string
  passwordPolicy: PasswordPolicy
  /** сколько часов после ввода пароля работает разблокировка отпечатком */
  fingerprintHours: number
  clipboardMethod: ClipboardMethod
  debug: boolean
}

export type AddInput =
  | { kind: 'uri'; uri: string }
  | {
      kind: 'secret'
      name: string
      issuer: string
      type: OtpType
      secret: string
      algo: Algo
      digits: number
      period: number
      pin?: string
    }

export interface AddResult {
  added: number
  skipped: number
  unsupported: number
}

export interface BackupEntry {
  index: number
  name: string
  issuer: string
  type: OtpType | 'unsupported'
  pinLength: number | null
  hasPin: boolean
  duplicate: boolean
}

export interface LogEntry {
  time: number
  level: 'info' | 'error' | 'debug'
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: 'locked' | 'bad-password' }
