import { Component, type ErrorInfo, type ReactNode } from 'react'
import { KCC_PHONE } from '../../shared/helplines'
import { translate } from '../i18n'
import { clearAll } from '../lib/storage'
import { savedLang } from '../settings'

interface State {
  failed: boolean
}

/**
 * Last line of defence: instead of a white screen that never goes away (e.g. after a bad saved value),
 * the farmer gets "Try again" and "Reset app data", in their language.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('BhooPal crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const lang = savedLang()
    const t = (key: Parameters<typeof translate>[1]) => translate(lang, key, { kcc: KCC_PHONE })
    const reset = () => {
      clearAll()
      try {
        sessionStorage.clear()
      } catch {
        /* ignore */
      }
      window.location.replace('/')
    }
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <img src="/logo.svg" alt="" className="size-16 rounded-2xl" />
        <h1 className="text-2xl font-bold">{t('crash.title')}</h1>
        <p className="text-stone-700">{t('crash.body')}</p>
        <button onClick={() => this.setState({ failed: false })} className="w-full rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white">
          {t('common.retry')}
        </button>
        <button onClick={reset} className="w-full rounded-xl border border-red-300 bg-white px-4 py-3 font-semibold text-red-700">
          {t('crash.reset')}
        </button>
      </main>
    )
  }
}
