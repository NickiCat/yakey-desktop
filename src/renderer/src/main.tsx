import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import Picker from './components/Picker'
import './styles/global.css'

const isPicker = window.location.hash === '#picker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>{isPicker ? <Picker /> : <App />}</ErrorBoundary>
  </StrictMode>
)
