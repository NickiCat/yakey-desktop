import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { AccountView, LogEntry } from '@shared/types'
import { api } from '../hooks'

const HELP = 'команды: list · code <имя> · copy <имя> · lock · clear · help'

function time(t: number): string {
  return new Date(t).toLocaleTimeString('ru-RU', { hour12: false })
}

export default function OutputPanel({ accounts }: { accounts: AccountView[] }): JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [height, setHeight] = useState(180)
  const [cmd, setCmd] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api.log.history().then(setEntries)
    return api.log.onEntry((e) => setEntries((prev) => [...prev.slice(-499), e]))
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [entries])

  const print = (message: string, level: LogEntry['level'] = 'info'): void =>
    setEntries((prev) => [...prev, { time: Date.now(), level, message }])

  const find = (name: string): AccountView | undefined => {
    const q = name.toLowerCase()
    return accounts.find((a) => a.name.toLowerCase() === q) ?? accounts.find((a) => a.name.toLowerCase().startsWith(q))
  }

  const exec = async (line: string): Promise<void> => {
    const [command, ...rest] = line.trim().split(/\s+/)
    const arg = rest.join(' ')
    print(`$ ${line}`, 'debug')
    switch (command) {
      case 'help':
        return print(HELP)
      case 'clear':
        return setEntries([])
      case 'list':
        return print(accounts.map((a) => (a.issuer ? `${a.issuer}:${a.name}` : a.name)).join('\n') || '(пусто)')
      case 'lock':
        await api.vault.lock()
        return
      case 'code':
      case 'copy': {
        const acc = find(arg)
        if (!acc) return print(`не найдено: ${arg}`, 'error')
        if (command === 'copy') {
          const res = await api.accounts.copy(acc.id)
          return print(res.ok ? `скопировано: ${acc.name}` : res.error, res.ok ? 'info' : 'error')
        }
        const res = await api.accounts.codes()
        if (!res.ok) return print(res.error, 'error')
        return print(res.value[acc.id]?.code ?? 'нет кода (нужен PIN)')
      }
      default:
        return print(`неизвестная команда: ${command}. ${HELP}`, 'error')
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && cmd.trim()) {
      void exec(cmd)
      setCmd('')
    }
  }

  const startResize = (e: MouseEvent): void => {
    const startY = e.clientY
    const startH = height
    const move = (ev: globalThis.MouseEvent): void => setHeight(Math.max(80, Math.min(500, startH + startY - ev.clientY)))
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="output-panel" style={{ height }}>
      <div className="output-resize" onMouseDown={startResize} />
      <div className="output-header">
        <span>Журнал</span>
        <button className="v-btn v-btn-ghost v-btn-sm" onClick={() => setEntries([])}>
          Очистить
        </button>
      </div>
      <div className="output-log" ref={logRef}>
        {entries.map((e, i) => (
          <div key={i} className={`output-line ${e.level}`}>
            <span className="time">{time(e.time)}</span>
            {e.message}
          </div>
        ))}
      </div>
      <div className="output-prompt">
        <span>yakey ›</span>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={onKey} placeholder="help" spellCheck={false} />
      </div>
    </div>
  )
}
