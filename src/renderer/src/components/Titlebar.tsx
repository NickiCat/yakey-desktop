import { api } from '../hooks'
import { IconGear, IconLock, IconMinus, IconPanel, IconTerminal, IconX, Logo } from './icons'

export default function Titlebar({
  unlocked,
  passwordless,
  onToggleSidebar,
  onToggleLog,
  onSettings
}: {
  unlocked: boolean
  passwordless: boolean
  onToggleSidebar: () => void
  onToggleLog: () => void
  onSettings: () => void
}): JSX.Element {
  return (
    <div className="titlebar">
      {unlocked && (
        <button className="v-btn v-btn-ghost v-btn-icon" onClick={onToggleSidebar} title="Боковая панель">
          <IconPanel />
        </button>
      )}
      <Logo />
      <span className="titlebar-title">yakey</span>
      <span className="muted">Яндекс Ключ</span>
      <span className="titlebar-spacer" />
      {unlocked && !passwordless && (
        <button className="v-btn v-btn-ghost v-btn-icon" onClick={() => void api.vault.lock()} title="Заблокировать">
          <IconLock />
        </button>
      )}
      <button className="v-btn v-btn-ghost v-btn-icon" onClick={onToggleLog} title="Журнал">
        <IconTerminal />
      </button>
      <button className="v-btn v-btn-ghost v-btn-icon" onClick={onSettings} title="Настройки">
        <IconGear />
      </button>
      <button className="v-btn v-btn-ghost v-btn-icon" onClick={() => api.win.minimize()} title="Свернуть">
        <IconMinus />
      </button>
      <button className="v-btn v-btn-ghost v-btn-icon" onClick={() => api.win.close()} title="Закрыть">
        <IconX />
      </button>
    </div>
  )
}
