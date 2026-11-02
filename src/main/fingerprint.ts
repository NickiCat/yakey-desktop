import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { userInfo } from 'os'
import type { FingerprintStatus } from '@shared/types'

/*
 * Проверка отпечатка через fprintd (системная служба, D-Bus). Используем её CLI по абсолютному пути:
 * fprintd-verify сам выбирает сканер и зарегистрированный палец, polkit разрешает это активной локальной сессии.
 * Отпечаток не даёт ключа — это только «да/нет», поэтому он лишь открывает ключ, уже лежащий в памяти.
 */

const BIN_DIRS = ['/usr/bin', '/bin', '/usr/local/bin']

function bin(name: string): string | null {
  for (const dir of BIN_DIRS) {
    const p = `${dir}/${name}`
    if (existsSync(p)) return p
  }
  return null
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
  })
}

let cached: FingerprintStatus | null = null

export async function fingerprintStatus(refresh = false): Promise<FingerprintStatus> {
  if (cached && !refresh) return cached
  const list = bin('fprintd-list')
  if (!list || !bin('fprintd-verify')) {
    cached = { available: false, reason: 'fprintd не установлен', fingers: [] }
    return cached
  }
  try {
    const { out } = await run(list, [userInfo().username], 5000)
    const fingers = [...out.matchAll(/ - #\d+: (\S+)/g)].map((m) => m[1])
    if (fingers.length) cached = { available: true, reason: '', fingers }
    else if (/No devices available/i.test(out)) cached = { available: false, reason: 'сканер отпечатков не найден', fingers }
    else cached = { available: false, reason: 'нет зарегистрированных пальцев (fprintd-enroll)', fingers }
  } catch (e) {
    cached = { available: false, reason: `fprintd: ${(e as Error).message}`, fingers: [] }
  }
  return cached
}

let current: ChildProcess | null = null
let cancelRequested = false

export type VerifyResult = 'match' | 'no-match' | 'retry' | 'cancelled'

export interface VerifyOutcome {
  result: VerifyResult
  /** последняя строка fprintd — для журнала (секретов в ней нет) */
  detail: string
}

/** Одна попытка: ждёт палец не дольше timeoutMs. 'retry' — сканер занят или палец лёг плохо. */
export function verifyOnce(finger: string, timeoutMs = 30_000): Promise<VerifyOutcome> {
  const verify = bin('fprintd-verify')
  if (!verify) return Promise.reject(new Error('fprintd не установлен'))
  if (current) return Promise.reject(new Error('Проверка отпечатка уже идёт'))

  return new Promise((resolve, reject) => {
    const args = finger && finger !== 'any' ? ['-f', finger] : []
    const child = spawn(verify, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    current = child
    let out = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout!.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr!.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', (e) => {
      clearTimeout(timer)
      current = null
      reject(e)
    })
    child.on('close', () => {
      clearTimeout(timer)
      current = null
      const lines = out.trim().split('\n').filter(Boolean)
      const verifying = lines.find((l) => l.startsWith('Verifying:'))
      const result = [...lines].reverse().find((l) => l.startsWith('Verify result:')) ?? lines.at(-1) ?? ''
      // «Verifying: <палец>» показывает, какой палец fprintd на самом деле ждал
      const detail = verifying ? `${verifying} → ${result}` : result
      if (/Verify result: verify-match\b/.test(out)) resolve({ result: 'match', detail })
      else if (child.killed && !timedOut) resolve({ result: 'cancelled', detail })
      else if (timedOut) resolve({ result: 'cancelled', detail: 'палец не приложен' })
      else if (/verify-no-match/.test(out)) resolve({ result: 'no-match', detail })
      else resolve({ result: 'retry', detail: detail || 'fprintd-verify завершился с ошибкой' })
    })
  })
}

/**
 * Несколько попыток подряд без участия пользователя. Каждая попытка проверяет следующий палец из fingers
 * по кругу (сенсор сравнивает только с одним названным пальцем). onAttempt вызывается перед каждой
 * повторной попыткой. Возвращает совпавший палец, null — если отменено/палец не приложили;
 * бросает после maxAttempts неудач.
 */
export async function verifyFingerprint(
  fingers: string[],
  maxAttempts: number,
  onAttempt: (attempt: number, previous: VerifyOutcome, finger: string) => void,
  log: (detail: string) => void
): Promise<string | null> {
  cancelRequested = false
  const order = fingers.length ? fingers : ['any']
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const finger = order[(attempt - 1) % order.length]
    const outcome = await verifyOnce(finger)
    log(`попытка ${attempt}: ${outcome.detail}`)
    if (outcome.result === 'match') return finger
    if (outcome.result === 'cancelled' || cancelRequested) return null
    if (attempt === maxAttempts) break
    // занятый сканер — тот же палец ещё раз, иначе следующий
    if (outcome.result === 'retry') order.splice(attempt % order.length, 0, finger)
    onAttempt(attempt + 1, outcome, order[attempt % order.length])
    // дать убрать палец (или освободить сканер другому процессу) перед новой попыткой
    await new Promise((r) => setTimeout(r, outcome.result === 'retry' ? 1000 : 400))
    if (cancelRequested) return null
  }
  throw new Error(`Отпечаток не распознан (${maxAttempts} попыток) — введите пароль или попробуйте ещё раз`)
}

export function cancelFingerprint(): void {
  cancelRequested = true
  current?.kill()
}
