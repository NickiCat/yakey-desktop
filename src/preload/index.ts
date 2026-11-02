import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { FingerprintProgress, PickerOptions, YakeyApi } from '@shared/api'
import type { LogEntry } from '@shared/types'

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: YakeyApi = {
  vault: {
    status: call('vault:status'),
    create: call('vault:create'),
    unlock: call('vault:unlock'),
    lock: call('vault:lock'),
    changePassword: call('vault:passwd'),
    fingerprint: call('vault:fingerprint'),
    onFingerprintProgress: (cb: (p: FingerprintProgress) => void) => subscribe<FingerprintProgress>('fingerprint:progress', cb),
    cancelFingerprint: call('vault:fingerprintCancel'),
    fingerprintStatus: call('fingerprint:status'),
    keyStorage: call('vault:keyStorage'),
    disablePassword: call('vault:disablePassword'),
    enablePassword: call('vault:enablePassword'),
    autoUnlock: call('vault:autoUnlock')
  } as YakeyApi['vault'],
  accounts: {
    list: call('accounts:list'),
    codes: call('accounts:codes'),
    add: call('accounts:add'),
    addQr: call('accounts:addQr'),
    update: call('accounts:update'),
    remove: call('accounts:remove'),
    copy: call('accounts:copy'),
    exportUris: call('accounts:export')
  } as YakeyApi['accounts'],
  backup: {
    start: call('backup:start'),
    verify: call('backup:verify'),
    decrypt: call('backup:decrypt'),
    commit: call('backup:commit'),
    cancel: call('backup:cancel'),
    save: call('backup:save')
  } as YakeyApi['backup'],
  settings: {
    get: call('settings:get'),
    set: call('settings:set')
  } as YakeyApi['settings'],
  log: {
    history: call('log:history') as () => Promise<LogEntry[]>,
    onEntry: (cb) => subscribe<LogEntry>('log:entry', cb)
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    close: () => ipcRenderer.send('win:close'),
    quit: () => ipcRenderer.send('app:quit'),
    activity: () => ipcRenderer.send('app:activity')
  },
  picker: {
    hide: () => ipcRenderer.send('picker:hide'),
    onShow: (cb) => subscribe<PickerOptions>('picker:show', cb)
  },
  onVaultChanged: (cb) => subscribe<void>('vault:changed', cb)
}

contextBridge.exposeInMainWorld('yakey', api)
