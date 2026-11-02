import { useEffect, useState } from 'react'
import type { AccountView, CodeView } from '@shared/types'
import { api } from '../hooks'
import { IconCheck, IconCopy, IconTrash } from './icons'
import { Modal, ProgressBar, Status, formatCode, useFlash } from './ui'

export default function AccountDetail({ account, code }: { account: AccountView; code?: CodeView }): JSX.Element {
  const [name, setName] = useState(account.name)
  const [issuer, setIssuer] = useState(account.issuer)
  const [pin, setPin] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [msg, flash] = useFlash()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(account.name)
    setIssuer(account.issuer)
    setPin('')
    setError(null)
  }, [account.id, account.name, account.issuer])

  const copy = async (): Promise<void> => {
    const res = await api.accounts.copy(account.id)
    if (!res.ok) return setError(res.error)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const save = async (): Promise<void> => {
    const patch: { name?: string; issuer?: string; pin?: string } = {}
    if (name !== account.name) patch.name = name
    if (issuer !== account.issuer) patch.issuer = issuer
    if (pin) patch.pin = pin
    const res = await api.accounts.update(account.id, patch)
    if (!res.ok) return setError(res.error)
    setError(null)
    setPin('')
    flash('Сохранено')
  }

  const remove = async (): Promise<void> => {
    const res = await api.accounts.remove(account.id)
    if (!res.ok) setError(res.error)
    setConfirmDelete(false)
  }

  const dirty = name !== account.name || issuer !== account.issuer || pin !== ''
  const needsPin = account.type === 'yandex' && !account.hasPin

  return (
    <>
      <div className="block-card">
        <div className="block-card-header">
          <span>
            <span className="block-card-title">{account.name}</span>
            {account.issuer && <span className="muted"> · {account.issuer}</span>}
          </span>
          <span className="muted mono">{account.type === 'yandex' ? 'Yandex OTP' : 'TOTP'}</span>
        </div>
        <div className="block-card-body">
          {code?.code ? (
            <div className="otp-code">{formatCode(code.code)}</div>
          ) : (
            <div className="otp-code pending">{needsPin ? 'Укажите PIN ниже, чтобы получать коды' : '—'}</div>
          )}
          {code && (
            <>
              <div className="otp-meta">
                <span>обновится через {code.remaining} с</span>
                <span>{code.period} с</span>
              </div>
              <ProgressBar value={code.remaining / code.period} />
            </>
          )}
        </div>
        <div className="block-card-footer">
          <button className="v-btn v-btn-primary" onClick={() => void copy()} disabled={!code?.code}>
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
      </div>

      <div className="block-card">
        <div className="block-card-header">
          <span className="block-card-title">Параметры</span>
        </div>
        <div className="block-card-body">
          <dl className="kv">
            <dt>Алгоритм</dt>
            <dd>{account.type === 'yandex' ? 'SHA256(PIN ‖ секрет) → HMAC-SHA256' : `HMAC-${account.algo}`}</dd>
            <dt>Длина кода</dt>
            <dd>{account.type === 'yandex' ? '8 букв a–z' : `${account.digits} цифр`}</dd>
            <dt>Период</dt>
            <dd>{account.period} с</dd>
            {account.type === 'yandex' && (
              <>
                <dt>PIN</dt>
                <dd>{account.hasPin ? 'сохранён в хранилище' : 'не задан'}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="block-card">
        <div className="block-card-header">
          <span className="block-card-title">Изменить</span>
        </div>
        <div className="block-card-body form" style={{ fontFamily: 'var(--font-sans)' }}>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Название</span>
              <input className="v-input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Сервис</span>
              <input className="v-input" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
            </label>
          </div>
          {account.type === 'yandex' && (
            <label className="field">
              <span className="field-label">{account.hasPin ? 'Новый PIN' : 'PIN'}</span>
              <input
                className="v-input mono"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
              <span className="field-hint">PIN, который вы вводите в Яндекс Ключе. Неверный PIN даст неверные коды.</span>
            </label>
          )}
        </div>
        <div className="block-card-footer">
          {error && <Status kind="error">{error}</Status>}
          {msg && <Status kind="success">{msg}</Status>}
          <span className="titlebar-spacer" />
          <button className="v-btn v-btn-danger" onClick={() => setConfirmDelete(true)}>
            <IconTrash />
            Удалить
          </button>
          <button className="v-btn v-btn-secondary" disabled={!dirty} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
      </div>

      {confirmDelete && (
        <Modal
          title="Удалить аккаунт?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="v-btn v-btn-ghost" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
              <button className="v-btn v-btn-danger" onClick={() => void remove()}>
                Удалить
              </button>
            </>
          }
        >
          <span className="secondary">
            «{account.name}» будет удалён из хранилища. Если секрета нет в другом месте, восстановить его можно только
            повторным импортом из облака.
          </span>
        </Modal>
      )}
    </>
  )
}
