import { useEffect, useState } from 'react'
import AccountDetail from './components/AccountDetail'
import AddModal from './components/AddModal'
import ExportModal from './components/ExportModal'
import ImportModal from './components/ImportModal'
import LockScreen from './components/LockScreen'
import OutputPanel from './components/OutputPanel'
import DisablePasswordModal from './components/DisablePasswordModal'
import PasswdModal from './components/PasswdModal'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import Titlebar from './components/Titlebar'
import { useActivityPing, useVault } from './hooks'
import { IconCloud, IconPlus } from './components/icons'

type ModalKind = 'add' | 'import' | 'export' | 'settings' | 'passwd' | 'setpass' | 'nopass' | null

export default function App(): JSX.Element {
  const { status, accounts, codes } = useVault()
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [modal, setModal] = useState<ModalKind>(null)

  const unlocked = !!status?.unlocked
  useActivityPing(unlocked)

  useEffect(() => {
    if (!accounts.find((a) => a.id === selected)) setSelected(accounts[0]?.id ?? null)
  }, [accounts, selected])

  useEffect(() => {
    if (!unlocked && modal !== 'settings') setModal(null)
  }, [unlocked, modal])

  const account = accounts.find((a) => a.id === selected)

  return (
    <div className="app">
      <Titlebar
        unlocked={unlocked}
        passwordless={!!status?.passwordless}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onToggleLog={() => setLogOpen((o) => !o)}
        onSettings={() => setModal('settings')}
      />
      <div className="app-body">
        {status && unlocked && (
          <Sidebar
            collapsed={sidebarCollapsed}
            accounts={accounts}
            codes={codes}
            selected={selected}
            query={query}
            onQuery={setQuery}
            onSelect={setSelected}
            onAdd={() => setModal('add')}
            onImport={() => setModal('import')}
            onExport={() => setModal('export')}
          />
        )}
        <main className="main">
          {status && !unlocked && <LockScreen status={status} />}
          {unlocked && (
            <div className="main-content">
              {account ? (
                <AccountDetail key={account.id} account={account} code={codes[account.id]} />
              ) : (
                <div className="lock-screen">
                  <div className="block-card lock-card">
                    <div className="block-card-header">
                      <span className="block-card-title">Хранилище пустое</span>
                    </div>
                    <div className="block-card-body form" style={{ fontFamily: 'var(--font-sans)' }}>
                      <span className="secondary">
                        Импортируйте аккаунты из облачной копии Яндекс Ключа (телефон → СМС → пароль бэкапа) или добавьте
                        вручную.
                      </span>
                      <button className="v-btn v-btn-primary" onClick={() => setModal('import')}>
                        <IconCloud />
                        Импорт из облака
                      </button>
                      <button className="v-btn v-btn-secondary" onClick={() => setModal('add')}>
                        <IconPlus />
                        Добавить вручную
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {logOpen && <OutputPanel accounts={accounts} />}
        </main>
      </div>

      {modal === 'add' && <AddModal onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal === 'export' && <ExportModal onClose={() => setModal(null)} />}
      {modal === 'passwd' && <PasswdModal mode="change" onClose={() => setModal(null)} />}
      {modal === 'setpass' && <PasswdModal mode="set" onClose={() => setModal(null)} />}
      {modal === 'nopass' && <DisablePasswordModal onClose={() => setModal(null)} />}
      {modal === 'settings' && (
        <SettingsModal
          unlocked={unlocked}
          passwordless={!!status?.passwordless}
          onClose={() => setModal(null)}
          onChangePassword={() => setModal('passwd')}
          onEnablePassword={() => setModal('setpass')}
          onDisablePassword={() => setModal('nopass')}
        />
      )}
    </div>
  )
}
