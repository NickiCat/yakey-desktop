import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import type { AccountView } from '@shared/types'
import { resourcePath } from './resources'

export interface TrayState {
  unlocked: boolean
  passwordless: boolean
  accounts: AccountView[]
}

export interface TrayActions {
  toggleMain(): void
  showMain(): void
  showPicker(): void
  copy(id: string): void
  lock(): void
  quit(): void
}

const MAX_ACCOUNTS = 30

let tray: Tray | null = null
let lastLocked: boolean | null = null

function icon(locked: boolean): Electron.NativeImage {
  // рядом лежит tray@2x.png — Electron подхватит его на HiDPI сам
  return nativeImage.createFromPath(resourcePath(locked ? 'tray-locked.png' : 'tray.png'))
}

function buildMenu(state: TrayState, actions: TrayActions): Menu {
  const items: MenuItemConstructorOptions[] = [
    { label: state.unlocked ? 'yakey — открыто' : 'yakey — заблокировано', enabled: false },
    { type: 'separator' },
    { label: 'Открыть yakey', click: actions.showMain },
    { label: 'Быстрый выбор', click: actions.showPicker }
  ]

  if (state.unlocked && state.accounts.length) {
    const shown = state.accounts.slice(0, MAX_ACCOUNTS)
    items.push({
      label: 'Копировать код',
      submenu: [
        ...shown.map((a) => ({
          label: a.issuer ? `${a.name} · ${a.issuer}` : a.name,
          enabled: a.type !== 'yandex' || a.hasPin,
          click: () => actions.copy(a.id)
        })),
        ...(state.accounts.length > MAX_ACCOUNTS
          ? [{ type: 'separator' as const }, { label: 'Остальные — в быстром выборе', click: actions.showPicker }]
          : [])
      ]
    })
  }

  items.push({ type: 'separator' })
  if (state.unlocked) {
    if (!state.passwordless) items.push({ label: 'Заблокировать', click: actions.lock })
  } else {
    items.push({ label: 'Разблокировать…', click: actions.showMain })
  }
  items.push({ type: 'separator' }, { label: 'Выйти', click: actions.quit })
  return Menu.buildFromTemplate(items)
}

/** Показывает/обновляет значок в трее; enabled = false убирает его. */
export function updateTray(enabled: boolean, state: TrayState, actions: TrayActions): void {
  if (!enabled) {
    tray?.destroy()
    tray = null
    lastLocked = null
    return
  }
  const locked = !state.unlocked
  if (!tray) {
    tray = new Tray(icon(locked))
    tray.on('click', actions.toggleMain)
  } else if (lastLocked !== locked) {
    tray.setImage(icon(locked))
  }
  lastLocked = locked
  tray.setToolTip(locked ? 'yakey — заблокировано' : 'yakey')
  tray.setContextMenu(buildMenu(state, actions))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
