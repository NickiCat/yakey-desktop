import { spawn } from 'child_process'
import { clipboard } from 'electron'
import type { ClipboardMethod } from '@shared/types'

interface RunResult {
  code: number | null
  stdout: string
}

function run(cmd: string, args: string[], input?: string, timeoutMs = 2000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'] })
    let stdout = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout })
    })
    // процесс может завершиться раньше записи (EPIPE); без обработчика это uncaught exception в main, а результат виден по коду выхода
    child.stdin.on('error', () => undefined)
    child.stdin.end(input ?? '')
  })
}

let wlCopyAvailable: boolean | null = null

async function hasWlCopy(): Promise<boolean> {
  if (wlCopyAvailable === null) {
    try {
      await run('wl-copy', ['--version'])
      wlCopyAvailable = true
    } catch {
      wlCopyAvailable = false
    }
  }
  return wlCopyAvailable
}

async function useWlCopy(method: ClipboardMethod): Promise<boolean> {
  if (method === 'electron' || process.platform === 'win32') return false
  if (method === 'wl-copy') return true
  return !!process.env.WAYLAND_DISPLAY && (await hasWlCopy())
}

async function write(text: string, wl: boolean): Promise<void> {
  if (!wl) {
    clipboard.writeText(text)
    return
  }
  // --sensitive просит менеджеры истории (cliphist и т.п.) не сохранять код; старые wl-copy его не знают
  const res = await run('wl-copy', ['--sensitive'], text)
  if (res.code !== 0) {
    const plain = await run('wl-copy', [], text)
    if (plain.code !== 0) throw new Error('wl-copy завершился с ошибкой')
  }
}

async function read(wl: boolean): Promise<string> {
  if (!wl) return clipboard.readText()
  try {
    return (await run('wl-paste', ['--no-newline'], undefined, 1000)).stdout
  } catch {
    return ''
  }
}

async function clear(wl: boolean): Promise<void> {
  if (!wl) {
    clipboard.clear()
    return
  }
  await run('wl-copy', ['--clear']).catch(() => undefined)
}

let clearTimer: NodeJS.Timeout | null = null

/** Копирует текст и через clearSeconds очищает буфер, если там всё ещё наш текст. */
export async function copyWithAutoClear(text: string, clearSeconds: number, method: ClipboardMethod): Promise<void> {
  const wl = await useWlCopy(method)
  await write(text, wl)
  if (clearTimer) clearTimeout(clearTimer)
  if (clearSeconds <= 0) return
  clearTimer = setTimeout(async () => {
    clearTimer = null
    if ((await read(wl)) === text) await clear(wl)
  }, clearSeconds * 1000)
}

/** Вводит текст в активное окно через wtype (код передаётся через stdin, не через argv). */
export async function typeText(text: string): Promise<void> {
  try {
    const res = await run('wtype', ['-'], text)
    if (res.code !== 0) throw new Error(`wtype завершился с кодом ${res.code}`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('wtype не установлен')
    throw e
  }
}
