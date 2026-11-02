import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fingerLabel } from '@shared/fingers'
import { POLICY_HINTS, checkPassword } from '@shared/password'
import type { VaultStatus } from '@shared/types'
import { api, usePasswordPolicy } from '../hooks'
import { IconFingerprint, IconKey } from './icons'
import { Spinner, Status } from './ui'

export default function LockScreen({ status, compact }: { status: VaultStatus; compact?: boolean }): JSX.Element {
  const creating = !status.exists
  const policy = usePasswordPolicy()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const scanningRef = useRef(false)

  useEffect(
    () =>
      api.vault.onFingerprintProgress((p) => {
        if (!scanningRef.current) return
        const which = p.finger === 'any' ? '' : ` — проверяю: ${fingerLabel(p.finger).toLowerCase()}`
        setHint(`${p.message}${which} (${p.attempt}/${p.max})`)
      }),
    []
  )

  const scan = async (): Promise<void> => {
    if (!status.fingerprint || scanningRef.current) return
    scanningRef.current = true
    setScanning(true)
    setError(null)
    setHint(null)
    const res = await api.vault.fingerprint()
    scanningRef.current = false
    setScanning(false)
    setHint(null)
    if (!res.ok) setError(res.error)
  }

  // палец ждём, только пока окно в фокусе: иначе fprintd займёт сканер за спиной у пользователя
  useEffect(() => {
    if (!status.fingerprint) return
    if (document.hasFocus()) void scan()
    const onFocus = (): void => void scan()
    const onBlur = (): void => {
      if (scanningRef.current) void api.vault.cancelFingerprint()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      if (scanningRef.current) void api.vault.cancelFingerprint()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.fingerprint])

  const openWithoutPassword = async (): Promise<void> => {
    const res = await api.vault.autoUnlock()
    if (!res.ok) setError(res.error)
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (creating && password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    const policyError = creating ? checkPassword(password, policy) : null
    if (policyError) {
      setError(policyError)
      return
    }
    setBusy(true)
    setError(null)
    const res = creating ? await api.vault.create(password) : await api.vault.unlock(password)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      setPassword('')
    }
  }

  return (
    <div className="lock-screen">
      <form className={`lock-card${compact ? '' : ' block-card'}`} onSubmit={(e) => void submit(e)}>
        {!compact && (
          <div className="block-card-header">
            <span className="block-card-title">{creating ? 'Новое хранилище' : 'Хранилище заблокировано'}</span>
            <IconKey />
          </div>
        )}
        <div className={compact ? 'form' : 'block-card-body form'}>
          {creating && (
            <span className="secondary">
              Задайте мастер-пароль. Им шифруются все секреты (Argon2id + XChaCha20-Poly1305), восстановить его нельзя.
            </span>
          )}
          {creating && <span className="field-hint">Требования: {POLICY_HINTS[policy]}. Меняются в настройках.</span>}
          {status.passwordless && !creating && (
            <button type="button" className="v-btn v-btn-secondary" onClick={() => void openWithoutPassword()}>
              Открыть без пароля
            </button>
          )}
          {status.fingerprint && (
            <button
              type="button"
              className="v-btn v-btn-secondary"
              disabled={scanning}
              onClick={() => void scan()}
            >
              {scanning ? <Spinner /> : <IconFingerprint />}
              {scanning ? 'Приложите палец к сканеру…' : 'Разблокировать отпечатком'}
            </button>
          )}
          <input
            className="v-input"
            type="password"
            autoFocus={!status.fingerprint}
            placeholder={status.fingerprint ? 'или мастер-пароль' : 'Мастер-пароль'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {creating && (
            <input
              className="v-input"
              type="password"
              placeholder="Повторите пароль"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
          {scanning && hint && <Status>{hint}</Status>}
          {error && <Status kind="error">{error}</Status>}
          <button className="v-btn v-btn-primary" type="submit" disabled={busy || !password}>
            {busy && <Spinner />}
            {creating ? 'Создать' : 'Разблокировать'}
          </button>
          {!compact && <span className="lock-path selectable">{status.path}</span>}
        </div>
      </form>
    </div>
  )
}
