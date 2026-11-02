/*
 * Клиент к неофициальному API облачного бэкапа Яндекс Ключа.
 * Эндпоинты и поля сверены с ezhevita/YandexKeyExtractor (WebHandler.cs, Models/*).
 */
const BASE_URL = 'https://registrator.mobile.yandex.net/1/'
const USER_AGENT = 'okhttp/2.7.5'
const DEFAULT_COUNTRY = 'ru'

/** Поля, значения которых никогда не попадают в лог. */
const SENSITIVE = new Set(['track_id', 'backup', 'number', 'e164', 'phone_number', 'code'])

type Json = Record<string, unknown>
export type DebugLog = (message: string) => void

export class BackupApiError extends Error {}

function redact(body: Json): string {
  const parts = Object.entries(body).map(([k, v]) => {
    if (SENSITIVE.has(k)) return `${k}=<скрыто>`
    if (v && typeof v === 'object' && !Array.isArray(v)) return `${k}={${redact(v as Json)}}`
    return `${k}=${JSON.stringify(v)}`
  })
  return parts.join(', ')
}

function describeFailure(path: string, body: Json): string {
  const status = typeof body.status === 'string' ? body.status : 'нет поля status'
  const errors = Array.isArray(body.errors) ? body.errors.join(', ') : ''
  return `Яндекс отклонил запрос ${path}: status=${status}${errors ? `, errors=${errors}` : ''}`
}

export class BackupClient {
  constructor(private readonly debug: DebugLog = () => {}) {}

  private async request(method: 'GET' | 'POST', path: string, form?: Record<string, string>): Promise<Json> {
    const url = BASE_URL + path
    this.debug(`→ ${method} ${path}${form ? ` [${Object.keys(form).join(', ')}]` : ''}`)
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: AbortSignal.timeout(20_000)
      })
    } catch (e) {
      throw new BackupApiError(`Сетевая ошибка при запросе ${path}: ${(e as Error).message}`)
    }
    const text = await res.text()
    let body: Json
    try {
      body = JSON.parse(text) as Json
    } catch {
      throw new BackupApiError(`Неожиданный ответ ${path} (HTTP ${res.status}): ${text.slice(0, 200)}`)
    }
    this.debug(`← HTTP ${res.status} ${path}: ${redact(body)}`)
    return body
  }

  private async post(path: string, form: Record<string, string>): Promise<Json> {
    const body = await this.request('POST', path, form)
    if (body.status !== 'ok') throw new BackupApiError(describeFailure(path, body))
    return body
  }

  async getCountry(): Promise<string> {
    try {
      const body = await this.request('GET', 'suggest/country')
      const list = body.country
      if (Array.isArray(list) && typeof list[0] === 'string') return list[0]
    } catch (e) {
      this.debug(`suggest/country не сработал: ${(e as Error).message}`)
    }
    return DEFAULT_COUNTRY
  }

  /** Возвращает номер в E.164; при неудаче — «+» + ввод, как в эталоне. */
  async normalizePhone(raw: string, country: string): Promise<string> {
    const phone = raw.replace(/[\s()-]/g, '').replace(/^\++/, '')
    try {
      const body = await this.request('POST', 'bundle/validate/phone_number/', { phone_number: phone, country })
      const num = body.number as Json | undefined
      if (num && typeof num.e164 === 'string' && num.e164) return num.e164
    } catch (e) {
      this.debug(`validate/phone_number не сработал: ${(e as Error).message}`)
    }
    return `+${phone}`
  }

  async sendCode(phone: string, country: string): Promise<string> {
    const body = await this.post('bundle/yakey_backup/send_code/', { display_language: 'en', number: phone, country })
    if (typeof body.track_id !== 'string' || !body.track_id) throw new BackupApiError('Сервер не вернул track_id')
    return body.track_id
  }

  async checkCode(code: string, trackId: string): Promise<void> {
    await this.post('bundle/yakey_backup/check_code/', { code, track_id: trackId })
  }

  async backupInfo(phone: string, trackId: string, country: string): Promise<number> {
    const body = await this.post('bundle/yakey_backup/info/', { number: phone, track_id: trackId, country })
    const info = body.backup_info as Json | undefined
    const updated = info ? Number(info.updated) : NaN
    if (!Number.isFinite(updated)) throw new BackupApiError('Для этого номера не найден облачный бэкап')
    return updated
  }

  async download(phone: string, trackId: string): Promise<string> {
    const body = await this.post('bundle/yakey_backup/download', { number: phone, track_id: trackId })
    if (typeof body.backup !== 'string' || !body.backup) throw new BackupApiError('Сервер вернул пустой бэкап')
    return body.backup
  }
}
