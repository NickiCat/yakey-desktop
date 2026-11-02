import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { api, matches, useVault } from '../hooks'
import LockScreen from './LockScreen'
import { Status } from './ui'

/** Компактное окно для бинда Hyprland: поиск → Enter → код в буфер (или ввод через wtype). */
export default function Picker(): JSX.Element {
  const { status, accounts, codes } = useVault()
  const [query, setQuery] = useState('')
  const [paste, setPaste] = useState(false)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      api.picker.onShow((opts) => {
        setQuery(opts.query)
        setPaste(opts.paste)
        setIndex(0)
        setError(null)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      }),
    []
  )

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') api.picker.hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = accounts.filter((a) => matches(a, query))

  useEffect(() => {
    listRef.current?.querySelector('.account-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const choose = async (id: string): Promise<void> => {
    const res = await api.accounts.copy(id, paste ? 'paste' : 'copy')
    if (!res.ok) return setError(res.error)
    api.picker.hide()
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && filtered[index]) {
      e.preventDefault()
      void choose(filtered[index].id)
    }
  }

  if (!status) return <div className="picker" />

  if (!status.unlocked) {
    return (
      <div className="picker">
        <LockScreen status={status} compact />
      </div>
    )
  }

  return (
    <div className="picker">
      <div className="picker-search">
        <input
          ref={inputRef}
          className="v-input"
          autoFocus
          placeholder="Аккаунт…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={onKey}
        />
      </div>
      <div className="picker-list" ref={listRef}>
        {filtered.length === 0 && <div className="empty">Ничего не найдено</div>}
        {filtered.map((a, i) => (
          <button
            key={a.id}
            className={`account-item${i === index ? ' active' : ''}`}
            onMouseEnter={() => setIndex(i)}
            onClick={() => void choose(a.id)}
          >
            <span className="account-item-text">
              <div className="account-item-name">{a.name}</div>
              <div className="account-item-issuer">{a.issuer}</div>
            </span>
            <span className="account-item-code">{codes[a.id]?.code ?? 'PIN?'}</span>
          </button>
        ))}
      </div>
      <div className="picker-footer">
        {error ? (
          <Status kind="error">{error}</Status>
        ) : (
          <span>
            <span className="kbd">↵</span> {paste ? 'ввести' : 'копировать'} · <span className="kbd">esc</span> закрыть
          </span>
        )}
        <span>{paste ? 'wtype' : 'буфер'}</span>
      </div>
    </div>
  )
}
