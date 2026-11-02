import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { Settings } from '@shared/types'

export const DEFAULT_SETTINGS: Settings = {
  clipboardClearSeconds: 30,
  autoLockMinutes: 5,
  runInBackground: true,
  lockOnSessionLock: true,
  fingerprintUnlock: false,
  fingerprintFinger: 'auto',
  fingerprintLastFinger: '',
  passwordPolicy: 'normal',
  fingerprintHours: 8,
  clipboardMethod: 'auto',
  debug: false
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

let current: Settings = { ...DEFAULT_SETTINGS }

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = JSON.parse(await fs.readFile(file(), 'utf8')) as Partial<Settings>
    current = { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    current = { ...DEFAULT_SETTINGS }
  }
  return current
}

export function getSettings(): Settings {
  return current
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  current = { ...current, ...patch }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(current, null, 2), { mode: 0o600 })
  return current
}
