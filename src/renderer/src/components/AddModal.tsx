import { useState } from 'react'
import type { AddResult, Algo, OtpType } from '@shared/types'
import { api } from '../hooks'
import { Modal, Segmented, Select, Spinner, Status } from './ui'

type Mode = 'uri' | 'secret' | 'qr'

export function describeAdd(r: AddResult): string {
  const parts = [`добавлено ${r.added}`]
  if (r.skipped) parts.push(`повторов пропущено ${r.skipped}`)
  if (r.unsupported) parts.push(`не поддерживается ${r.unsupported}`)
  return parts.join(', ')
}

export default function AddModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [mode, setMode] = useState<Mode>('uri')
  const [uri, setUri] = useState('')
  const [type, setType] = useState<OtpType>('totp')
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [secret, setSecret] = useState('')
  const [pin, setPin] = useState('')
  const [algo, setAlgo] = useState<Algo>('SHA1')
  const [digits, setDigits] = useState(6)
  const [period, setPeriod] = useState(30)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const finish = (res: Awaited<ReturnType<typeof api.accounts.add>>): void => {
    if (!res.ok) {
      setResult({ kind: 'error', text: res.error })
      return
    }
    if (res.value.added > 0) onClose()
    else setResult({ kind: 'error', text: describeAdd(res.value) })
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    if (mode === 'uri') finish(await api.accounts.add({ kind: 'uri', uri }))
    else
      finish(
        await api.accounts.add({
          kind: 'secret',
          name,
          issuer,
          type,
          secret,
          algo,
          digits,
          period,
          pin: type === 'yandex' ? pin : undefined
        })
      )
    setBusy(false)
  }

  const fromQr = async (source: 'file' | 'screen'): Promise<void> => {
    setBusy(true)
    setResult(null)
    const res = await api.accounts.addQr(source)
    setBusy(false)
    if (!res.ok) return setResult({ kind: 'error', text: res.error })
    if (!res.value) return
    if (res.value.added > 0) onClose()
    else setResult({ kind: 'error', text: describeAdd(res.value) })
  }

  const canSubmit =
    mode === 'uri' ? uri.trim() !== '' : name.trim() !== '' && secret.trim() !== '' && (type === 'totp' || pin !== '')

  return (
    <Modal
      title="Добавить аккаунт"
      onClose={onClose}
      footer={
        <>
          {result && <Status kind={result.kind}>{result.text}</Status>}
          {busy && <Spinner />}
          <button className="v-btn v-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          {mode !== 'qr' && (
            <button className="v-btn v-btn-primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
              Добавить
            </button>
          )}
        </>
      }
    >
      <div className="form">
        <Segmented
          full
          value={mode}
          onChange={setMode}
          options={[
            { value: 'uri', label: 'otpauth://' },
            { value: 'secret', label: 'Секрет' },
            { value: 'qr', label: 'QR-код' }
          ]}
        />

        {mode === 'uri' && (
          <label className="field">
            <span className="field-label">Ссылки otpauth:// — по одной на строку</span>
            <textarea
              className="v-textarea"
              autoFocus
              spellCheck={false}
              placeholder="otpauth://totp/GitHub:me?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
            />
            <span className="field-hint">Поддерживаются totp и yaotp (Яндекс). HOTP и otpauth-migration — нет.</span>
          </label>
        )}

        {mode === 'secret' && (
          <>
            <Segmented
              value={type}
              onChange={setType}
              options={[
                { value: 'totp', label: 'TOTP' },
                { value: 'yandex', label: 'Yandex OTP' }
              ]}
            />
            <div className="field-row">
              <label className="field">
                <span className="field-label">Название</span>
                <input className="v-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Сервис</span>
                <input
                  className="v-input"
                  placeholder={type === 'yandex' ? 'Yandex' : 'необязательно'}
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Секрет (base32)</span>
              <input
                className="v-input mono"
                type="password"
                spellCheck={false}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </label>
            {type === 'yandex' ? (
              <label className="field">
                <span className="field-label">PIN</span>
                <input
                  className="v-input mono"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </label>
            ) : (
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Алгоритм</span>
                  <Select
                    value={algo}
                    onChange={setAlgo}
                    options={[
                      { value: 'SHA1', label: 'SHA1' },
                      { value: 'SHA256', label: 'SHA256' },
                      { value: 'SHA512', label: 'SHA512' }
                    ]}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Цифр</span>
                  <Select
                    value={digits}
                    onChange={setDigits}
                    options={[6, 7, 8].map((d) => ({ value: d, label: String(d) }))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Период</span>
                  <Select
                    value={period}
                    onChange={setPeriod}
                    options={[30, 60].map((p) => ({ value: p, label: `${p} с` }))}
                  />
                </label>
              </div>
            )}
          </>
        )}

        {mode === 'qr' && (
          <div className="form">
            <span className="secondary">
              Картинка с QR-кодом otpauth:// или выделение области экрана (нужны <span className="mono">grim</span> и{' '}
              <span className="mono">slurp</span>).
            </span>
            <div className="field-row">
              <button className="v-btn v-btn-secondary" disabled={busy} onClick={() => void fromQr('file')}>
                Выбрать файл…
              </button>
              <button className="v-btn v-btn-secondary" disabled={busy} onClick={() => void fromQr('screen')}>
                С экрана
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
