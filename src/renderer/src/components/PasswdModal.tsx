import { useState } from 'react'
import { POLICY_HINTS, checkPassword } from '@shared/password'
import { api, usePasswordPolicy } from '../hooks'
import { Modal, Spinner, Status } from './ui'

/** change — смена пароля (нужен текущий); set — включить пароль обратно в режиме без пароля. */
export default function PasswdModal({ mode, onClose }: { mode: 'change' | 'set'; onClose: () => void }): JSX.Element {
  const policy = usePasswordPolicy()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const policyError = newPw ? checkPassword(newPw, policy) : null

  const submit = async (): Promise<void> => {
    if (newPw !== confirm) return setResult({ kind: 'error', text: 'Пароли не совпадают' })
    setBusy(true)
    const res = mode === 'set' ? await api.vault.enablePassword(newPw) : await api.vault.changePassword(oldPw, newPw)
    setBusy(false)
    if (!res.ok) return setResult({ kind: 'error', text: res.error })
    if (mode === 'set') return onClose()
    setOldPw('')
    setNewPw('')
    setConfirm('')
    setResult({ kind: 'success', text: 'Пароль изменён' })
  }

  return (
    <Modal
      title={mode === 'set' ? 'Включить мастер-пароль' : 'Смена мастер-пароля'}
      onClose={onClose}
      footer={
        <>
          {result && <Status kind={result.kind}>{result.text}</Status>}
          {busy && <Spinner />}
          <button className="v-btn v-btn-ghost" onClick={onClose}>
            Закрыть
          </button>
          <button
            className="v-btn v-btn-primary"
            disabled={busy || !newPw || !!policyError || (mode === 'change' && !oldPw)}
            onClick={() => void submit()}
          >
            {mode === 'set' ? 'Включить' : 'Сменить'}
          </button>
        </>
      }
    >
      <div className="form">
        {mode === 'set' && (
          <span className="secondary">
            Хранилище будет перешифровано новым паролем, ключ удалится из системной связки ключей. Прежний пароль
            перестанет работать.
          </span>
        )}
        {mode === 'change' && (
          <input className="v-input" type="password" autoFocus placeholder="Текущий пароль" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        )}
        <input
          className="v-input"
          type="password"
          autoFocus={mode === 'set'}
          placeholder="Новый пароль"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <input className="v-input" type="password" placeholder="Повторите новый пароль" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {policyError ? <Status kind="error">{policyError}</Status> : <span className="field-hint">Требования: {POLICY_HINTS[policy]}</span>}
      </div>
    </Modal>
  )
}
