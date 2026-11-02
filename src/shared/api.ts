import type {
  AccountView,
  AddInput,
  AddResult,
  BackupEntry,
  CodeView,
  FingerprintStatus,
  LogEntry,
  Result,
  Settings,
  VaultStatus
} from './types'

export interface PickerOptions {
  query: string
  paste: boolean
}

export interface FingerprintProgress {
  attempt: number
  max: number
  /** палец, который проверяется в этой попытке ('any' — на усмотрение fprintd) */
  finger: string
  message: string
}

export interface YakeyApi {
  vault: {
    status(): Promise<VaultStatus>
    create(password: string): Promise<Result<void>>
    unlock(password: string): Promise<Result<void>>
    lock(): Promise<Result<void>>
    changePassword(oldPassword: string, newPassword: string): Promise<Result<void>>
    /** true — открыто; false — отменено или палец не приложили */
    fingerprint(): Promise<Result<boolean>>
    onFingerprintProgress(cb: (p: FingerprintProgress) => void): () => void
    cancelFingerprint(): Promise<Result<void>>
    fingerprintStatus(): Promise<Result<FingerprintStatus>>
    keyStorage(): Promise<Result<{ backend: string; weak: boolean }>>
    disablePassword(currentPassword: string): Promise<Result<void>>
    enablePassword(newPassword: string): Promise<Result<void>>
    autoUnlock(): Promise<Result<void>>
  }
  accounts: {
    list(): Promise<Result<AccountView[]>>
    codes(): Promise<Result<Record<string, CodeView>>>
    add(input: AddInput): Promise<Result<AddResult>>
    addQr(source: 'file' | 'screen'): Promise<Result<AddResult | null>>
    update(id: string, patch: { name?: string; issuer?: string; pin?: string }): Promise<Result<void>>
    remove(id: string): Promise<Result<void>>
    copy(id: string, mode?: 'copy' | 'paste'): Promise<Result<void>>
    exportUris(): Promise<Result<string>>
  }
  backup: {
    start(phone: string): Promise<Result<{ phone: string }>>
    verify(code: string): Promise<Result<{ updated: number }>>
    decrypt(password: string): Promise<Result<BackupEntry[]>>
    commit(selection: { index: number; pin?: string }[]): Promise<Result<AddResult>>
    cancel(): Promise<Result<void>>
    save(): Promise<Result<string | null>>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  log: {
    history(): Promise<LogEntry[]>
    onEntry(cb: (e: LogEntry) => void): () => void
  }
  win: {
    minimize(): void
    close(): void
    quit(): void
    activity(): void
  }
  picker: {
    hide(): void
    onShow(cb: (opts: PickerOptions) => void): () => void
  }
  onVaultChanged(cb: () => void): () => void
}
