import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { IconCaret, IconX } from './icons'

/* ---------- Select (свой dropdown вместо нативного <select>) ---------- */

export interface SelectOption<T extends string | number> {
  value: T
  label: string
}

export function Select<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = (): void => {
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen((o) => !o)
  }

  const onKey = (e: ReactKeyboardEvent): void => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        toggle()
      }
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(options.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onChange(options[highlight].value)
      setOpen(false)
    }
  }

  return (
    <div className={`v-select${open ? ' open' : ''}`} ref={ref}>
      <button type="button" className="v-select-trigger" onClick={toggle} onKeyDown={onKey}>
        <span>{current?.label ?? '—'}</span>
        <IconCaret />
      </button>
      {open && (
        <div className="v-select-menu" role="listbox">
          {options.map((o, i) => (
            <button
              type="button"
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              className={`v-select-option${o.value === value ? ' selected' : ''}${i === highlight ? ' highlighted' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Segmented ---------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  full
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  full?: boolean
}): JSX.Element {
  return (
    <div className={`segmented${full ? ' full' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`segmented-item${o.value === value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Modal ---------- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button type="button" className="v-btn v-btn-ghost v-btn-icon" onClick={onClose} title="Закрыть">
            <IconX />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- мелочи ---------- */

export function Spinner(): JSX.Element {
  return <span className="spinner" aria-label="Загрузка" />
}

export function Status({ kind, children }: { kind?: 'success' | 'error'; children: ReactNode }): JSX.Element {
  return (
    <span className={`status${kind ? ` ${kind}` : ''}`}>
      <span className={`status-dot${kind ? ` ${kind}` : ''}`} />
      {children}
    </span>
  )
}

export function ProgressBar({ value, small }: { value: number; small?: boolean }): JSX.Element {
  return (
    <div className={`progress${small ? ' small' : ''}`}>
      <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

/** Временное сообщение, исчезающее через ms. */
export function useFlash(ms = 2500): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>()
  const flash = (m: string): void => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), ms)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return [msg, flash]
}

export function formatCode(code: string): string {
  if (/^\d+$/.test(code)) {
    const mid = Math.ceil(code.length / 2)
    return `${code.slice(0, mid)} ${code.slice(mid)}`
  }
  return code
}
