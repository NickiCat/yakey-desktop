import { useEffect, useState } from 'react'
import { fingerLabel } from '@shared/fingers'
import { POLICY_HINTS, type PasswordPolicy } from '@shared/password'
import type { ClipboardMethod, FingerprintStatus, Settings } from '@shared/types'
import { api } from '../hooks'
import { Modal, Segmented, Select, Status } from './ui'

export default function SettingsModal({
  unlocked,
  passwordless,
  onClose,
  onChangePassword,
  onEnablePassword,
  onDisablePassword
}: {
  unlocked: boolean
  passwordless: boolean
  onClose: () => void
  onChangePassword: () => void
  onEnablePassword: () => void
  onDisablePassword: () => void
}): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [fp, setFp] = useState<FingerprintStatus | null>(null)

  useEffect(() => {
    void api.settings.get().then(setSettings)
    void api.vault.fingerprintStatus().then((r) => r.ok && setFp(r.value))
  }, [])

  const set = async (patch: Partial<Settings>): Promise<void> => {
    setSettings(await api.settings.set(patch))
  }

  return (
    <Modal
      title="Настройки"
      onClose={onClose}
      footer={
        <>
          <button className="v-btn v-btn-danger" onClick={() => api.win.quit()}>
            Завершить yakey
          </button>
          <span className="titlebar-spacer" />
          <button className="v-btn v-btn-primary" onClick={onClose}>
            Готово
          </button>
        </>
      }
    >
      {settings && (
        <div className="form">
          <div className="field-row">
            <label className="field">
              <span className="field-label">Очистка буфера</span>
              <Select
                value={settings.clipboardClearSeconds}
                onChange={(v) => void set({ clipboardClearSeconds: v })}
                options={[
                  { value: 15, label: 'через 15 с' },
                  { value: 30, label: 'через 30 с' },
                  { value: 60, label: 'через 60 с' },
                  { value: 120, label: 'через 2 мин' },
                  { value: 0, label: 'не очищать' }
                ]}
              />
            </label>
            <label className="field">
              <span className="field-label">Автоблокировка</span>
              <Select
                value={settings.autoLockMinutes}
                onChange={(v) => void set({ autoLockMinutes: v })}
                options={[
                  { value: 1, label: 'через 1 мин' },
                  { value: 5, label: 'через 5 мин' },
                  { value: 15, label: 'через 15 мин' },
                  { value: 30, label: 'через 30 мин' },
                  { value: 60, label: 'через 1 час' },
                  { value: 0, label: 'никогда' }
                ]}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Буфер обмена</span>
            <Select<ClipboardMethod>
              value={settings.clipboardMethod}
              onChange={(v) => void set({ clipboardMethod: v })}
              options={[
                { value: 'auto', label: 'Авто (wl-copy на Wayland)' },
                { value: 'wl-copy', label: 'wl-copy' },
                { value: 'electron', label: 'Встроенный (Electron)' }
              ]}
            />
          </label>

          <div className="field">
            <span className="field-label">Работать в фоне после закрытия окна</span>
            <Segmented
              value={settings.runInBackground ? 'on' : 'off'}
              onChange={(v) => void set({ runInBackground: v === 'on' })}
              options={[
                { value: 'on', label: 'Да' },
                { value: 'off', label: 'Нет' }
              ]}
            />
            <span className="field-hint">
              В фоне yakey показывает значок в трее (меню: открыть, быстрый выбор, копировать код, заблокировать, выйти).
              Пока хранилище разблокировано, <span className="mono">yakey --pick</span> не спрашивает пароль.
            </span>
          </div>

          <div className="field">
            <span className="field-label">Блокировать при блокировке экрана и сне</span>
            <Segmented
              value={settings.lockOnSessionLock ? 'on' : 'off'}
              onChange={(v) => void set({ lockOnSessionLock: v === 'on' })}
              options={[
                { value: 'on', label: 'Да' },
                { value: 'off', label: 'Нет' }
              ]}
            />
            <span className="field-hint">
              Срабатывает на <span className="mono">loginctl lock-session</span> (hypridle) и уход в сон. Если hyprlock
              запускается напрямую, добавьте перед ним <span className="mono">yakey --lock</span>.
            </span>
          </div>

          <div className="field">
            <span className="field-label">Разблокировка отпечатком пальца</span>
            <div className="field-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <Segmented
                value={settings.fingerprintUnlock ? 'on' : 'off'}
                onChange={(v) => void set({ fingerprintUnlock: v === 'on' })}
                options={[
                  { value: 'off', label: 'Выкл' },
                  { value: 'on', label: 'Вкл' }
                ]}
              />
              <Select
                value={settings.fingerprintHours}
                onChange={(v) => void set({ fingerprintHours: v })}
                options={[1, 4, 8, 12, 24].map((h) => ({ value: h, label: `${h} ч после ввода пароля` }))}
              />
            </div>
            {fp?.available && (
              <Select
                value={
                  ['auto', 'any', ...fp.fingers].includes(settings.fingerprintFinger) ? settings.fingerprintFinger : 'auto'
                }
                onChange={(v) => void set({ fingerprintFinger: v })}
                options={[
                  { value: 'auto', label: 'Авто — по очереди, с последнего удачного' },
                  { value: 'any', label: 'Как решит fprintd' },
                  ...fp.fingers.map((f) => ({ value: f, label: fingerLabel(f) }))
                ]}
              />
            )}
            {fp && (
              <Status kind={fp.available ? 'success' : 'error'}>
                {fp.available ? 'fprintd: сканер и отпечатки найдены' : fp.reason}
              </Status>
            )}
            <span className="field-hint">
              Сенсор сравнивает касание только с одним названным пальцем. «Авто» проверяет пальцы по очереди — каждое
              касание следующий — и запоминает, какой сработал, чтобы в следующий раз начать с него. Отпечаток не
              заменяет пароль: после запуска yakey и по истечении срока нужен мастер-пароль. Между ними ключ
              хранится только в памяти и открывается отпечатком (fprintd).
            </span>
          </div>

          <div className="field">
            <span className="field-label">Отладочный журнал API импорта</span>
            <Segmented
              value={settings.debug ? 'on' : 'off'}
              onChange={(v) => void set({ debug: v === 'on' })}
              options={[
                { value: 'off', label: 'Выкл' },
                { value: 'on', label: 'Вкл' }
              ]}
            />
            <span className="field-hint">Запросы и ответы пишутся в журнал без номера телефона, track_id и содержимого бэкапа.</span>
          </div>

          <div className="field">
            <span className="field-label">Мастер-пароль</span>
            {passwordless ? (
              <Status kind="error">Отключён — yakey открывается без пароля</Status>
            ) : (
              <>
                <Select<PasswordPolicy>
                  value={settings.passwordPolicy}
                  onChange={(v) => void set({ passwordPolicy: v })}
                  options={[
                    { value: 'complex', label: 'Сложный' },
                    { value: 'normal', label: 'Обычный' },
                    { value: 'short', label: 'Короткий (PIN)' }
                  ]}
                />
                <span className="field-hint">
                  Требования к новому паролю: {POLICY_HINTS[settings.passwordPolicy]}. Текущий пароль не меняется —
                  правило действует при следующей смене.
                </span>
                {settings.passwordPolicy === 'short' && (
                  <Status kind="error">
                    Короткий пароль защищает только от случайного взгляда: украденный vault.bin с PIN из 4–6 цифр
                    подбирается за минуты или часы.
                  </Status>
                )}
              </>
            )}
            {unlocked && (
              <div className="field-row">
                {passwordless ? (
                  <button className="v-btn v-btn-secondary" onClick={onEnablePassword}>
                    Включить пароль…
                  </button>
                ) : (
                  <>
                    <button className="v-btn v-btn-secondary" onClick={onChangePassword}>
                      Сменить пароль…
                    </button>
                    <button className="v-btn v-btn-danger" onClick={onDisablePassword}>
                      Отключить пароль…
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
