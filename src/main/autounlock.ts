import { safeStorage } from 'electron'
import { promises as fs, constants as fsc } from 'fs'
import { dirname, join } from 'path'

/*
 * Режим без мастер-пароля: ключ хранилища шифруется через Electron safeStorage
 * (на Linux — gnome-keyring/libsecret или KWallet) и лежит в autounlock.bin рядом с vault.bin.
 * Если safeStorage работает в режиме basic_text, ключ лишь обфусцирован — об этом предупреждаем в UI.
 */

const fileFor = (vaultPath: string): string => join(dirname(vaultPath), 'autounlock.bin')

export function keyStorageBackend(): string {
  if (!safeStorage.isEncryptionAvailable()) return 'unavailable'
  return process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'system'
}

export function keyStorageIsWeak(): boolean {
  const b = keyStorageBackend()
  return b === 'basic_text' || b === 'unavailable' || b === 'unknown'
}

export async function hasAutoUnlock(vaultPath: string): Promise<boolean> {
  try {
    await fs.access(fileFor(vaultPath))
    return true
  } catch {
    return false
  }
}

export async function saveAutoUnlock(vaultPath: string, key: Buffer): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Системное хранилище секретов недоступно')
  const blob = safeStorage.encryptString(key.toString('base64'))
  const path = fileFor(vaultPath)
  const fh = await fs.open(path, fsc.O_WRONLY | fsc.O_CREAT | fsc.O_TRUNC, 0o600)
  try {
    await fh.writeFile(blob)
    await fh.sync()
  } finally {
    await fh.close()
  }
}

export async function loadAutoUnlock(vaultPath: string): Promise<Buffer | null> {
  let blob: Buffer
  try {
    blob = await fs.readFile(fileFor(vaultPath))
  } catch {
    return null
  }
  return Buffer.from(safeStorage.decryptString(blob), 'base64')
}

export async function removeAutoUnlock(vaultPath: string): Promise<void> {
  await fs.rm(fileFor(vaultPath), { force: true })
}
