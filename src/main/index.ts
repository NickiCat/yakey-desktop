import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { PickerOptions } from '@shared/api'
import type { AddInput, Result, Settings } from '@shared/types'
import { copyWithAutoClear, typeText } from './clipboard'
import { checkPassword } from '@shared/password'
import { hasAutoUnlock, keyStorageBackend, keyStorageIsWeak, loadAutoUnlock, removeAutoUnlock, saveAutoUnlock } from './autounlock'
import { cancelFingerprint, fingerprintStatus, verifyFingerprint } from './fingerprint'
import { log, logHistory, onLog } from './logger'
import { decodeQrFile, decodeQrFromScreen } from './qr'
import { resourcePath } from './resources'
import * as svc from './service'
import { startSessionLockWatch, stopSessionLockWatch } from './sessionlock'
import { getSettings, loadSettings, updateSettings } from './settings'
import { destroyTray, updateTray } from './tray'

app.setName('yakey')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

interface CliArgs {
  lock: boolean
  full: boolean
  pick: boolean
  paste: boolean
  hidden: boolean
  copy: string | null
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { lock: false, full: false, pick: false, paste: false, hidden: false, copy: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--lock') args.lock = true
    else if (a === '--full') args.full = true
    else if (a === '--pick') args.pick = true
    else if (a === '--paste') args.paste = true
    else if (a === '--hidden') args.hidden = true
    else if (a === '--copy' && argv[i + 1]) args.copy = argv[++i]
  }
  return args
}

let mainWindow: BrowserWindow | null = null
let pickerWindow: BrowserWindow | null = null
let quitting = false

const PAGE_BG = '#000000'

function loadRenderer(win: BrowserWindow, hash = ''): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL + (hash ? `#${hash}` : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

/** Ошибки renderer → журнал и stderr; Ctrl+Shift+I — DevTools. */
function attachDiagnostics(win: BrowserWindow): void {
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') {
      log('error', `UI: ${e.message}`)
      console.error(`[renderer] ${e.message} (${e.sourceId}:${e.lineNumber})`)
    }
  })
  win.webContents.on('render-process-gone', (_e, details) => log('error', `Окно упало: ${details.reason}`))
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools()
    }
  })
}

const webPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false
}

function createMainWindow(show: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 760,
    minHeight: 480,
    frame: false,
    show: false,
    title: 'yakey',
    icon: resourcePath('icon.png'),
    backgroundColor: PAGE_BG,
    webPreferences
  })
  attachDiagnostics(win)
  win.once('ready-to-show', () => show && win.show())
  win.on('close', (e) => {
    if (!quitting && getSettings().runInBackground) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => (mainWindow = null))
  loadRenderer(win)
  return win
}

function showMain(): void {
  if (!mainWindow) mainWindow = createMainWindow(true)
  else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function createPickerWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 400,
    frame: false,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'yakey-pick',
    backgroundColor: PAGE_BG,
    webPreferences
  })
  attachDiagnostics(win)
  win.on('blur', () => win.hide())
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => (pickerWindow = null))
  loadRenderer(win, 'picker')
  return win
}

function showPicker(opts: PickerOptions): void {
  if (!pickerWindow) pickerWindow = createPickerWindow()
  const win = pickerWindow
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width } = win.getBounds()
  win.setPosition(
    Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    Math.round(display.workArea.y + display.workArea.height / 4)
  )
  const reveal = (): void => {
    win.webContents.send('picker:show', opts)
    win.show()
    win.focus()
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal)
  else reveal()
}

function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
  if (channel === 'vault:changed') refreshTray()
}

/* ---------- трей: пока yakey работает в фоне ---------- */

function toggleMain(): void {
  if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else showMain()
}

function refreshTray(): void {
  const unlocked = svc.vault.unlocked
  updateTray(
    getSettings().runInBackground,
    { unlocked, passwordless, accounts: unlocked ? svc.listViews() : [] },
    {
      toggleMain,
      showMain,
      showPicker: () => showPicker({ query: '', paste: false }),
      copy: (id) =>
        void copyCode(id, 'copy').catch((e: Error) => log('error', e.message)),
      lock: () => lockVault('из трея'),
      quit: () => {
        quitting = true
        app.quit()
      }
    }
  )
}

/* ---------- автоблокировка ---------- */

let lockTimer: NodeJS.Timeout | null = null
/** мастер-пароль отключён: хранилище открывается ключом из системной связки ключей */
let passwordless = false

function touch(): void {
  if (lockTimer) clearTimeout(lockTimer)
  lockTimer = null
  const minutes = getSettings().autoLockMinutes
  if (!svc.vault.unlocked || minutes <= 0 || passwordless) return
  lockTimer = setTimeout(() => lockVault('автоблокировка по таймеру'), minutes * 60_000)
}

let fingerprintReady = false
const FINGERPRINT_ATTEMPTS = 5

async function refreshFingerprint(): Promise<void> {
  fingerprintReady = (await fingerprintStatus(true)).available
}

/** Сколько держать ключ в памяти для разблокировки отпечатком (0 — не держать). */
function quickUnlockMs(): number {
  const s = getSettings()
  return s.fingerprintUnlock && fingerprintReady ? s.fingerprintHours * 3_600_000 : 0
}

async function autoUnlock(): Promise<void> {
  const key = await loadAutoUnlock(svc.vault.path)
  if (!key) throw new Error('Ключ в связке ключей не найден — введите пароль')
  try {
    await svc.vault.unlockWithKey(key)
  } finally {
    key.fill(0)
  }
  broadcast('vault:changed')
}

function newPasswordError(password: string): string | null {
  return checkPassword(password, getSettings().passwordPolicy)
}

function lockVault(reason: string, full = false): void {
  // без пароля блокировка по таймеру/экрану бессмысленна: хранилище тут же откроется само
  if (passwordless && !full) return
  if (!svc.vault.unlocked) {
    if (full) svc.vault.forgetKey()
    return
  }
  svc.vault.lock(full ? 0 : quickUnlockMs())
  svc.backupCancel()
  if (lockTimer) clearTimeout(lockTimer)
  lockTimer = null
  log('info', `Хранилище заблокировано (${reason})`)
  broadcast('vault:changed')
}

/* ---------- IPC ---------- */

function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (err) {
      const e = err as Error & { code?: string }
      const code = e.code
      if (code !== 'bad-password') log('error', e.message)
      return {
        ok: false,
        error: e.message,
        code: code === 'locked' || code === 'bad-password' ? code : undefined
      }
    }
  })
}

async function copyCode(id: string, mode: 'copy' | 'paste'): Promise<void> {
  const code = svc.currentCode(id)
  if (mode === 'paste') {
    pickerWindow?.hide()
    await new Promise((r) => setTimeout(r, 180))
    await typeText(code)
    return
  }
  const s = getSettings()
  await copyWithAutoClear(code, s.clipboardClearSeconds, s.clipboardMethod)
  touch()
}

function registerIpc(): void {
  ipcMain.handle('vault:status', async () => ({
    exists: await svc.vault.exists(),
    unlocked: svc.vault.unlocked,
    path: svc.vault.path,
    passwordless,
    fingerprint: getSettings().fingerprintUnlock && svc.vault.quickUnlockAvailable
  }))
  handle('vault:create', async (password: string) => {
    const err = newPasswordError(password)
    if (err) throw new Error(err)
    await svc.vault.create(password)
    // остатки режима без пароля от прежнего хранилища больше не подходят
    await removeAutoUnlock(svc.vault.path)
    passwordless = false
    log('info', `Создано хранилище ${svc.vault.path}`)
    touch()
    broadcast('vault:changed')
  })
  handle('vault:unlock', async (password: string) => {
    await svc.vault.unlock(password)
    cancelFingerprint()
    log('info', 'Хранилище разблокировано')
    touch()
    broadcast('vault:changed')
  })
  handle('vault:lock', () => lockVault('вручную'))
  handle('vault:fingerprint', async () => {
    if (!getSettings().fingerprintUnlock || !svc.vault.quickUnlockAvailable) {
      throw new Error('Разблокировка отпечатком недоступна — введите пароль')
    }
    const s = getSettings()
    const enrolled = (await fingerprintStatus()).fingers
    let order: string[]
    if (s.fingerprintFinger === 'auto' && enrolled.length) {
      // последний удачный палец первым: обычно хватает одного касания
      order = [...enrolled].sort((a, b) => Number(b === s.fingerprintLastFinger) - Number(a === s.fingerprintLastFinger))
    } else {
      order = [enrolled.includes(s.fingerprintFinger) ? s.fingerprintFinger : 'any']
    }
    const attempts = Math.max(FINGERPRINT_ATTEMPTS, order.length + 1)
    const finger = await verifyFingerprint(
      order,
      attempts,
      (attempt, prev, next) =>
        broadcast('fingerprint:progress', {
          attempt,
          max: attempts,
          finger: next,
          message: prev.result === 'no-match' ? 'Не совпал — приложите палец ещё раз' : 'Сканер занят — пробую снова'
        }),
      (detail) => log('debug', `fprintd: ${detail}`)
    )
    const matched = finger !== null
    if (matched && s.fingerprintFinger === 'auto' && finger !== s.fingerprintLastFinger) {
      await updateSettings({ fingerprintLastFinger: finger })
    }
    // отмена (окно потеряло фокус) или палец не приложили — молча, без ошибки
    if (!matched || svc.vault.unlocked) return false
    await svc.vault.quickUnlock()
    log('info', 'Хранилище разблокировано отпечатком')
    touch()
    broadcast('vault:changed')
    return true
  })
  handle('vault:fingerprintCancel', () => cancelFingerprint())
  handle('fingerprint:status', () => fingerprintStatus(true))
  handle('vault:passwd', async (oldPassword: string, newPassword: string) => {
    const err = newPasswordError(newPassword)
    if (err) throw new Error(err)
    await svc.vault.changePassword(oldPassword, newPassword)
    if (passwordless) {
      const key = svc.vault.exportKey()
      await saveAutoUnlock(svc.vault.path, key).finally(() => key.fill(0))
    }
    log('info', 'Мастер-пароль изменён')
  })
  handle('vault:keyStorage', () => ({ backend: keyStorageBackend(), weak: keyStorageIsWeak() }))
  handle('vault:disablePassword', async (currentPassword: string) => {
    if (!(await svc.vault.verifyPassword(currentPassword))) {
      throw Object.assign(new Error('Неверный текущий пароль'), { code: 'bad-password' })
    }
    const key = svc.vault.exportKey()
    try {
      await saveAutoUnlock(svc.vault.path, key)
    } finally {
      key.fill(0)
    }
    passwordless = true
    touch()
    log('info', `Мастер-пароль отключён (ключ в связке ключей: ${keyStorageBackend()})`)
    broadcast('vault:changed')
  })
  handle('vault:enablePassword', async (newPassword: string) => {
    const err = newPasswordError(newPassword)
    if (err) throw new Error(err)
    await svc.vault.setPassword(newPassword)
    await removeAutoUnlock(svc.vault.path)
    passwordless = false
    touch()
    log('info', 'Мастер-пароль включён')
    broadcast('vault:changed')
  })
  handle('vault:autoUnlock', async () => {
    if (!passwordless) throw new Error('Мастер-пароль включён')
    await autoUnlock()
    log('info', 'Хранилище открыто без пароля')
  })

  handle('accounts:list', () => svc.listViews())
  handle('accounts:codes', () => svc.codes())
  handle('accounts:add', async (input: AddInput) => {
    const res = await svc.addFromInput(input)
    broadcast('vault:changed')
    return res
  })
  handle('accounts:addQr', async (source: 'file' | 'screen') => {
    let data: string
    if (source === 'screen') {
      mainWindow?.hide()
      try {
        data = await decodeQrFromScreen()
      } finally {
        showMain()
      }
    } else {
      const res = await dialog.showOpenDialog(mainWindow!, {
        title: 'QR-код',
        properties: ['openFile'],
        filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'] }]
      })
      if (res.canceled || !res.filePaths[0]) return null
      data = decodeQrFile(res.filePaths[0])
    }
    const added = await svc.addFromUriText(data)
    broadcast('vault:changed')
    return added
  })
  handle('accounts:update', async (id: string, patch: { name?: string; issuer?: string; pin?: string }) => {
    await svc.updateAccount(id, patch)
    broadcast('vault:changed')
  })
  handle('accounts:remove', async (id: string) => {
    await svc.removeAccount(id)
    broadcast('vault:changed')
  })
  handle('accounts:copy', (id: string, mode: 'copy' | 'paste' = 'copy') => copyCode(id, mode))
  handle('accounts:export', () => {
    log('info', 'Экспорт otpauth:// ссылок')
    return svc.exportUris()
  })

  handle('backup:start', (phone: string) => svc.backupStart(phone))
  handle('backup:verify', (code: string) => svc.backupVerify(code))
  handle('backup:decrypt', (password: string) => svc.backupDecrypt(password))
  handle('backup:commit', async (selection: { index: number; pin?: string }[]) => {
    const res = await svc.backupCommit(selection)
    broadcast('vault:changed')
    return res
  })
  handle('backup:cancel', () => svc.backupCancel())
  handle('backup:save', async () => {
    const res = await dialog.showSaveDialog(mainWindow!, {
      title: 'Сохранить зашифрованный бэкап',
      defaultPath: 'yakey-backup.txt'
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, svc.backupBlob(), { mode: 0o600 })
    log('info', `Зашифрованный бэкап сохранён: ${res.filePath}`)
    return res.filePath
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', async (_e, patch: Partial<Settings>) => {
    const s = await updateSettings(patch)
    if (patch.runInBackground !== undefined) refreshTray()
    if (patch.fingerprintUnlock !== undefined) {
      await refreshFingerprint()
      if (!s.fingerprintUnlock) svc.vault.forgetKey()
    }
    touch()
    return s
  })

  ipcMain.handle('log:history', () => logHistory())
  onLog((entry) => broadcast('log:entry', entry))

  ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.on('picker:hide', () => pickerWindow?.hide())
  ipcMain.on('app:activity', () => touch())
  ipcMain.on('app:quit', () => {
    quitting = true
    app.quit()
  })
}

/* ---------- запуск и CLI ---------- */

async function handleArgs(args: CliArgs, firstRun: boolean): Promise<void> {
  if (args.lock) {
    lockVault('yakey --lock', args.full)
    // если yakey не был запущен, не оставляем висеть пустой экземпляр
    if (firstRun) app.quit()
    return
  }
  if (args.copy) {
    const acc = svc.vault.unlocked ? svc.findByName(args.copy) : undefined
    if (acc) {
      try {
        await copyCode(acc.id, args.paste ? 'paste' : 'copy')
        log('info', `Код «${acc.name}» скопирован`)
      } catch (e) {
        log('error', (e as Error).message)
      }
      return
    }
    showPicker({ query: args.copy, paste: args.paste })
    return
  }
  if (args.pick) {
    showPicker({ query: '', paste: args.paste })
    return
  }
  if (!(firstRun && args.hidden)) showMain()
}

app.on('second-instance', (_e, argv) => void handleArgs(parseArgs(argv), false))

app.on('before-quit', () => {
  quitting = true
  stopSessionLockWatch()
  cancelFingerprint()
  destroyTray()
  svc.vault.lock()
})

app.on('window-all-closed', () => {
  if (!getSettings().runInBackground) app.quit()
})

void app.whenReady().then(async () => {
  await loadSettings()
  registerIpc()
  void refreshFingerprint()
  passwordless = await hasAutoUnlock(svc.vault.path)
  if (passwordless) {
    try {
      await autoUnlock()
      log('info', 'Хранилище открыто без пароля')
    } catch (e) {
      log('error', `Не удалось открыть без пароля: ${(e as Error).message}`)
    }
  }
  refreshTray()

  startSessionLockWatch((reason) => {
    if (getSettings().lockOnSessionLock) lockVault(reason)
  })
  const args = parseArgs(process.argv)
  mainWindow = createMainWindow(false)
  await handleArgs(args, true)
})
