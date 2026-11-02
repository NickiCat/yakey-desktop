import type { AccountView, CodeView } from '@shared/types'
import { matches } from '../hooks'
import { IconCloud, IconExport, IconPlus } from './icons'

export default function Sidebar({
  collapsed,
  accounts,
  codes,
  selected,
  query,
  onQuery,
  onSelect,
  onAdd,
  onImport,
  onExport
}: {
  collapsed: boolean
  accounts: AccountView[]
  codes: Record<string, CodeView>
  selected: string | null
  query: string
  onQuery: (q: string) => void
  onSelect: (id: string) => void
  onAdd: () => void
  onImport: () => void
  onExport: () => void
}): JSX.Element {
  const filtered = accounts.filter((a) => matches(a, query))

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-top">
        <input className="v-input" placeholder="Поиск" value={query} onChange={(e) => onQuery(e.target.value)} />
      </div>
      <div className="sidebar-mid">
        <div className="sidebar-section-title">Аккаунты · {accounts.length}</div>
        {filtered.length === 0 && (
          <div className="empty">{accounts.length ? 'Ничего не найдено' : 'Пока пусто — импортируйте бэкап или добавьте аккаунт'}</div>
        )}
        {filtered.map((a) => (
          <button
            key={a.id}
            className={`account-item${a.id === selected ? ' active' : ''}`}
            onClick={() => onSelect(a.id)}
          >
            <span className="account-item-text">
              <div className="account-item-name">{a.name}</div>
              <div className="account-item-issuer">{a.issuer || (a.type === 'yandex' ? 'Yandex' : 'TOTP')}</div>
            </span>
            <span className="account-item-code">{codes[a.id]?.code ?? (a.type === 'yandex' ? 'PIN?' : '')}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <button className="v-btn v-btn-secondary" onClick={onImport}>
          <IconCloud />
          Импорт из облака
        </button>
        <div className="field-row">
          <button className="v-btn v-btn-ghost" onClick={onAdd}>
            <IconPlus />
            Добавить
          </button>
          <button className="v-btn v-btn-ghost" onClick={onExport}>
            <IconExport />
            Экспорт
          </button>
        </div>
      </div>
    </aside>
  )
}
