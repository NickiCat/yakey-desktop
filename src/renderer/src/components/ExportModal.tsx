import { useState } from 'react'
import { api } from '../hooks'
import { IconCheck, IconCopy } from './icons'
import { Modal, Status } from './ui'

export default function ExportModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [uris, setUris] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reveal = async (): Promise<void> => {
    const res = await api.accounts.exportUris()
    if (!res.ok) return setError(res.error)
    setUris(res.value)
  }

  const copy = async (): Promise<void> => {
    if (!uris) return
    await navigator.clipboard.writeText(uris)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const close = (): void => {
    setUris(null)
    onClose()
  }

  return (
    <Modal
      title="Экспорт otpauth://"
      wide
      onClose={close}
      footer={
        <>
          {error && <Status kind="error">{error}</Status>}
          <button className="v-btn v-btn-ghost" onClick={close}>
            Закрыть
          </button>
          {uris === null ? (
            <button className="v-btn v-btn-danger" onClick={() => void reveal()}>
              Показать секреты
            </button>
          ) : (
            <button className="v-btn v-btn-secondary" onClick={() => void copy()}>
              {copied ? <IconCheck /> : <IconCopy />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          )}
        </>
      }
    >
      {uris === null ? (
        <span className="secondary">
          Будут показаны все секреты открытым текстом — для переезда в другое приложение (Aegis, 2FAS, KeePassXC). Файл на
          диск не пишется. Убедитесь, что экран никто не видит.
        </span>
      ) : (
        <textarea className="v-textarea" readOnly spellCheck={false} rows={12} value={uris} />
      )}
    </Modal>
  )
}
