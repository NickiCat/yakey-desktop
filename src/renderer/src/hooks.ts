import { useCallback, useEffect, useState } from 'react'
import type { PasswordPolicy } from '@shared/password'
import type { AccountView, CodeView, VaultStatus } from '@shared/types'

export const api = window.yakey

export interface VaultState {
  status: VaultStatus | null
  accounts: AccountView[]
  codes: Record<string, CodeView>
  refresh: () => Promise<void>
}

export function useVault(): VaultState {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [codes, setCodes] = useState<Record<string, CodeView>>({})

  const refresh = useCallback(async () => {
    const s = await api.vault.status()
    setStatus(s)
    if (!s.unlocked) {
      setAccounts([])
      setCodes({})
      return
    }
    const list = await api.accounts.list()
    if (list.ok) setAccounts(list.value)
    const c = await api.accounts.codes()
    if (c.ok) setCodes(c.value)
  }, [])

  useEffect(() => {
    void refresh()
    return api.onVaultChanged(() => void refresh())
  }, [refresh])

  useEffect(() => {
    if (!status?.unlocked) return
    // коды считаются в main-процессе: секреты в renderer не попадают
    const tick = async (): Promise<void> => {
      const c = await api.accounts.codes()
      if (c.ok) setCodes(c.value)
    }
    const id = window.setInterval(() => void tick(), 1000)
    return () => window.clearInterval(id)
  }, [status?.unlocked])

  return { status, accounts, codes, refresh }
}

/** Сообщает main-процессу об активности пользователя (сброс таймера автоблокировки). */
export function useActivityPing(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let last = 0
    const ping = (): void => {
      const now = Date.now()
      if (now - last > 10_000) {
        last = now
        api.win.activity()
      }
    }
    window.addEventListener('mousemove', ping)
    window.addEventListener('keydown', ping)
    return () => {
      window.removeEventListener('mousemove', ping)
      window.removeEventListener('keydown', ping)
    }
  }, [enabled])
}

export function matches(a: AccountView, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return a.name.toLowerCase().includes(q) || a.issuer.toLowerCase().includes(q)
}

export function usePasswordPolicy(): PasswordPolicy {
  const [policy, setPolicy] = useState<PasswordPolicy>('normal')
  useEffect(() => {
    void api.settings.get().then((s) => setPolicy(s.passwordPolicy))
  }, [])
  return policy
}
