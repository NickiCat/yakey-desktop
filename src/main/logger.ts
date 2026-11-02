import type { LogEntry } from '@shared/types'

const MAX = 500
const history: LogEntry[] = []
const listeners = new Set<(e: LogEntry) => void>()

export function log(level: LogEntry['level'], message: string): void {
  const entry: LogEntry = { time: Date.now(), level, message }
  history.push(entry)
  if (history.length > MAX) history.shift()
  for (const l of listeners) l(entry)
}

export function logHistory(): LogEntry[] {
  return [...history]
}

export function onLog(listener: (e: LogEntry) => void): void {
  listeners.add(listener)
}
