import { spawn, type ChildProcess } from 'child_process'
import { powerMonitor } from 'electron'
import { log } from './logger'

/*
 * Блокировка экрана на Linux Electron не сообщает, поэтому слушаем logind через gdbus (есть везде, где есть glib):
 *   - Session.Lock — `loginctl lock-session` (hypridle вызывает lock_cmd именно по нему);
 *   - LockedHint=true — локеры, которые выставляют подсказку сами.
 * Сон ловит powerMonitor (logind PrepareForSleep).
 */

let monitor: ChildProcess | null = null
let stopped = false
let restartDelay = 1000

function watchLogind(onLock: (reason: string) => void): void {
  const child = spawn('gdbus', ['monitor', '--system', '--dest', 'org.freedesktop.login1'], {
    stdio: ['ignore', 'pipe', 'ignore']
  })
  monitor = child
  let buffer = ''

  child.stdout!.on('data', (chunk: Buffer) => {
    restartDelay = 1000
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.includes('org.freedesktop.login1.Session.Lock ')) onLock('блокировка экрана')
      else if (/'LockedHint': <true>/.test(line)) onLock('блокировка экрана')
    }
  })

  child.on('error', (e) => {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      log('error', 'gdbus не найден — блокировка вместе с экраном не работает')
      stopped = true
    }
  })

  child.on('close', () => {
    monitor = null
    if (stopped) return
    setTimeout(() => !stopped && watchLogind(onLock), restartDelay)
    restartDelay = Math.min(restartDelay * 2, 60_000)
  })
}

export function startSessionLockWatch(onLock: (reason: string) => void): void {
  stopped = false
  powerMonitor.on('suspend', () => onLock('уход в сон'))
  powerMonitor.on('lock-screen', () => onLock('блокировка экрана'))
  // на Windows блокировку экрана сообщает сам powerMonitor
  if (process.platform === 'linux') watchLogind(onLock)
}

export function stopSessionLockWatch(): void {
  stopped = true
  monitor?.kill()
  monitor = null
}
