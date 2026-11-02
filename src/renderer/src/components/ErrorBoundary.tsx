import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Вместо чёрного окна при падении интерфейса показывает ошибку и даёт перезагрузить. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI crash:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="lock-screen">
        <div className="block-card lock-card" style={{ maxWidth: 560 }}>
          <div className="block-card-header">
            <span className="block-card-title">Ошибка интерфейса</span>
          </div>
          <div className="block-card-body">
            <div className="error-text selectable" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {error.message}
            </div>
            <div className="field-hint" style={{ marginTop: 'var(--space-sm)' }}>
              Данные не пострадали: хранилище на диске не меняется. Подробности — Ctrl+Shift+I.
            </div>
          </div>
          <div className="block-card-footer">
            <button className="v-btn v-btn-primary" onClick={() => window.location.reload()}>
              Перезагрузить окно
            </button>
          </div>
        </div>
      </div>
    )
  }
}
