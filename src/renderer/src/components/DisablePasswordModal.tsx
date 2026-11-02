import { useEffect, useState } from 'react'
import { api } from '../hooks'
import { Modal, Spinner, Status } from './ui'

export default function DisablePasswordModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [password, setPassword] = useState('')
  const [storage, setStorage] = useState<{ backend: string; weak: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.vault.keyStorage().then((r) => r.ok && setStorage(r.value))
  }, [])

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await api.vault.disablePassword(password)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onClose()
  }

  return (
    <Modal
      title="Отключить мастер-пароль"
      onClose={onClose}
      footer={
        <>
          {error && <Status kind="error">{error}</Status>}
          {busy && <Spinner />}
          <button className="v-btn v-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="v-btn v-btn-danger" disabled={busy || !password || !storage || storage.backend === 'unavailable'} onClick={() => void submit()}>
            Отключить пароль
          </button>
        </>
      }
    >
      <div className="form">
        <span className="secondary">
          yakey будет открываться сам, без пароля. Ключ хранилища уйдёт в системную связку ключей и будет доступен любой
          программе, запущенной от вашего пользователя после входа в систему. Блокировка по таймеру, экрану и отпечатку
          отключится.
        </span>
        {storage && (
          <Status kind={storage.weak ? 'error' : 'success'}>
            {storage.backend === 'unavailable'
              ? 'Системное хранилище секретов недоступно — отключить пароль нельзя'
              : storage.weak
                ? `Связка ключей не найдена (${storage.backend}): ключ будет лишь обфусцирован — по сути открытым текстом. Установите gnome-keyring или KWallet.`
                : `Ключ будет храниться в: ${storage.backend}`}
          </Status>
        )}
        <span className="field-hint">
          Текущий пароль останется запасным: если связка ключей сбросится, хранилище можно открыть им.
        </span>
        <input
          className="v-input"
          type="password"
          autoFocus
          placeholder="Текущий мастер-пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password && void submit()}
        />
      </div>
    </Modal>
  )
}
