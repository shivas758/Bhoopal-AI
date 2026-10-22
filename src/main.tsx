import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { dropOldOfflineCopies, removeKey } from './lib/storage'
import { SettingsProvider } from './settings'
import './index.css'

dropOldOfflineCopies()
// Older versions saved the chat; now every visit to Ask starts a new one.
removeKey('chat')

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
