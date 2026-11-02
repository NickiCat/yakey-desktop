import { useMemo, useState } from 'react'
import type { BackupEntry } from '@shared/types'
import { api } from '../hooks'
import { describeAdd } from './AddModal'
import { Modal, ProgressBar, Spinner, Status } from './ui'

type Step = 'phone' | 'sms' | 'password' | 'select' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'phone', label: 'Телефон' },
  { id: 'sms', label: 'Код из СМС' },
  { id: 'password', label: 'Пароль бэкапа' },
  { id: 'select', label: 'Аккаунты' }
]

export default function ImportModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [sms, setSms] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<BackupEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pins, setPins] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState('')

  const close = (): void => {
    void api.backup.cancel()
    onClose()
  }

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const sendSms = (): Promise<void> =>
    run(async () => {
      const res = await api.backup.start(phone)
      if (!res.ok) return setError(res.error)
      setMaskedPhone(res.value.phone)
      setStep('sms')
    })

  const verify = (): Promise<void> =>
    run(async () => {
      const res = await api.backup.verify(sms)
      if (!res.ok) return setError(res.error)
      setStep('password')
    })

  const saveBlob = async (): Promise<void> => {
    const res = await api.backup.save()
    if (!res.ok) return setError(res.error)
    if (res.value) setSavedPath(res.value)
  }

  const decrypt = (): Promise<void> =>
    run(async () => {
      const res = await api.backup.decrypt(password)
      if (!res.ok) {
        setAttempts((n) => n + 1)
        return setError(res.error)
      }
      setPassword('')
      setEntries(res.value)
      setSelected(new Set(res.value.filter((e) => e.type !== 'unsupported' && !e.duplicate).map((e) => e.index)))
      setStep('select')
    })

  const commit = (): Promise<void> =>
    run(async () => {
      const selection = [...selected].map((index) => ({ index, pin: pins[index] || undefined }))
      const res = await api.backup.commit(selection)
      if (!res.ok) return setError(res.error)
      setSummary(describeAdd(res.value))
      setStep('done')
    })

  const toggle = (index: number): void => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const missingPins = useMemo(
    () => entries.filter((e) => selected.has(e.index) && e.type === 'yandex' && !e.hasPin && !pins[e.index]).length,
    [entries, selected, pins]
  )

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const primary: Record<Step, { label: string; action: () => void; disabled: boolean }> = {
    phone: { label: 'Отправить СМС', action: () => void sendSms(), disabled: !phone.trim() },
    sms: { label: 'Проверить код', action: () => void verify(), disabled: !sms.trim() },
    password: { label: 'Расшифровать', action: () => void decrypt(), disabled: !password },
    select: { label: `Импортировать (${selected.size})`, action: () => void commit(), disabled: selected.size === 0 },
    done: { label: 'Готово', action: onClose, disabled: false }
  }
  const p = primary[step]

  return (
    <Modal
      title="Импорт из облачного бэкапа"
      wide
      onClose={close}
      footer={
        <>
          {error && <Status kind="error">{error}</Status>}
          {step === 'select' && missingPins > 0 && !error && (
            <Status>без PIN: {missingPins} — коды появятся, когда укажете PIN</Status>
          )}
          {busy && <Spinner />}
          {step !== 'done' && (
            <button className="v-btn v-btn-ghost" onClick={close}>
              Отмена
            </button>
          )}
          <button className="v-btn v-btn-primary" disabled={busy || p.disabled} onClick={p.action}>
            {p.label}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy && !p.disabled) p.action()
        }}
      >
        <div className="steps">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`step${i === stepIndex ? ' active' : ''}${i < stepIndex || step === 'done' ? ' done' : ''}`}
            >
              <ProgressBar value={i < stepIndex || step === 'done' ? 1 : i === stepIndex ? 0.5 : 0} />
              {s.label}
            </div>
          ))}
        </div>

        {step === 'phone' && (
          <label className="field">
            <span className="field-label">Номер телефона, к которому привязан бэкап</span>
            <input
              className="v-input mono"
              autoFocus
              inputMode="tel"
              placeholder="+79XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <span className="field-hint">
              Бэкап создаётся в настройках Яндекс Ключа на телефоне. Сетевые запросы идут только к
              registrator.mobile.yandex.net.
            </span>
          </label>
        )}

        {step === 'sms' && (
          <label className="field">
            <span className="field-label">Код из СМС, отправленного на {maskedPhone}</span>
            <input
              className="v-input mono"
              type="password"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              value={sms}
              onChange={(e) => setSms(e.target.value.trim())}
            />
          </label>
        )}

        {step === 'password' && (
          <label className="field">
            <span className="field-label">Пароль резервной копии</span>
            <div className="field-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <input
                className="v-input"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="v-btn v-btn-secondary" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {/[а-яё]/i.test(password) && (
              <Status>В пароле есть кириллица — проверьте раскладку клавиатуры</Status>
            )}
            <span className="field-hint">
              Тот, что задавали при создании бэкапа в Яндекс Ключе. Можно пробовать несколько раз — новая СМС не нужна.
            </span>
          </label>
        )}

        {step === 'password' && attempts > 0 && (
          <div className="field">
            <span className="field-hint">
              Не подходит? Сохраните зашифрованный бэкап и проверьте пароль независимым скриптом{' '}
              <span className="mono">scripts/decrypt-backup.py</span>. Если и он скажет «неверный пароль», дело в пароле,
              а не в yakey.
            </span>
            <button type="button" className="v-btn v-btn-secondary v-btn-sm" onClick={() => void saveBlob()}>
              Сохранить зашифрованный бэкап…
            </button>
            {savedPath && <Status kind="success">Сохранено: <span className="mono">{savedPath}</span></Status>}
          </div>
        )}

        {step === 'select' && (
          <>
            <span className="secondary">
              Найдено записей: {entries.length}. Для аккаунтов Яндекса (Yandex OTP) PIN в бэкапе не хранится — введите его
              сейчас или позже в карточке аккаунта.
            </span>
            <div className="import-list">
              {entries.map((e) => {
                const disabled = e.type === 'unsupported'
                return (
                  <label key={e.index} className={`import-row${disabled ? ' disabled' : ''}`}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      disabled={disabled}
                      checked={selected.has(e.index)}
                      onChange={() => toggle(e.index)}
                    />
                    <span>
                      {e.name}
                      {e.issuer && <span className="muted"> · {e.issuer}</span>}
                      {e.duplicate && <span className="muted"> · уже есть</span>}
                      {disabled && <span className="muted"> · не поддерживается</span>}
                    </span>
                    {e.type === 'yandex' && !e.hasPin ? (
                      <input
                        className="v-input mono"
                        type="password"
                        inputMode="numeric"
                        placeholder={e.pinLength ? `PIN (${e.pinLength})` : 'PIN'}
                        value={pins[e.index] ?? ''}
                        onChange={(ev) => setPins((m) => ({ ...m, [e.index]: ev.target.value.replace(/\D/g, '') }))}
                      />
                    ) : (
                      <span className="muted mono">{e.type === 'yandex' ? 'yaotp' : e.type}</span>
                    )}
                  </label>
                )
              })}
            </div>
          </>
        )}

        {step === 'done' && <Status kind="success">Импорт завершён: {summary}</Status>}
      </form>
    </Modal>
  )
}
