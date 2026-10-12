import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { dropOldOfflineCopies } from './lib/storage'
import { SettingsProvider } from './settings'
import './index.css'

dropOldOfflineCopies()

// public/browser-check.js has already shown "please update Chrome" on browsers too old for the app.
if (!(window as { __bhoopalOldBrowser?: boolean }).__bhoopalOldBrowser) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}
