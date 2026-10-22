import { Eye, EyeOff, Languages, Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { normalizePhone, validPassword } from '../../shared/account'
import { LANG_INFO } from '../../shared/types'
import { ErrorNotice, Notice, Segmented, inputClass, primaryButton } from '../components/ui'
import type { MessageKey } from '../i18n'
import { ApiError, api } from '../lib/api'
import { logIn, sessionEnded } from '../lib/auth'
import { useOnline } from '../lib/hooks'
import { useSettings, useT } from '../settings'

type Mode = 'signup' | 'login' | 'reset'

// Log-in answers the farmer can fix, with the button that fixes them.
const PROBLEMS: Partial<Record<string, { message: MessageKey; fix: Mode }>> = {
  no_account: { message: 'auth.noAccount', fix: 'signup' },
  account_exists: { message: 'auth.exists', fix: 'login' },
  wrong_password: { message: 'auth.wrongPassword', fix: 'reset' },
}
const FIX_LABEL: Record<Mode, MessageKey> = { signup: 'auth.create', login: 'auth.login', reset: 'auth.forgot' }

/** Mobile number and password. Shown after the language, before the farm questions; nothing works without it. */
export function Login() {
  const { t, lang } = useT()
  const { settings, update } = useSettings()
  const online = useOnline()
  // A farmer who has used the app before is more likely logging back in than signing up.
  const [mode, setMode] = useState<Mode>(settings.onboarded ? 'login' : 'signup')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: MessageKey; fix?: Mode } | null>(() => (sessionEnded() ? { message: 'auth.ended' } : null))
  const [error, setError] = useState<unknown>(null)
  const passwordId = useId()

  // What was typed is kept, so "This number already has an account → Log in" is one more tap.
  const switchMode = (next: Mode) => {
    setMode(next)
    setProblem(null)
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const number = normalizePhone(phone)
    if (!number) return setProblem({ message: 'auth.badPhone' })
    if (!validPassword(password)) return setProblem({ message: 'auth.shortPassword' })
    setBusy(true)
    setProblem(null)
    setError(null)
    try {
      const call = mode === 'signup' ? api.signup : mode === 'login' ? api.login : api.resetPassword
      logIn(await call({ phone: number, password }))
    } catch (err) {
      const known = err instanceof ApiError ? PROBLEMS[err.code] : undefined
      if (known) setProblem(known)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  const submitLabel: MessageKey = mode === 'signup' ? 'auth.create' : mode === 'login' ? 'auth.login' : 'auth.save'

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/logo.svg" alt="" className="size-20 rounded-2xl shadow" />
        <h1 className="text-3xl font-bold text-brand-800">BhooPal</h1>
        <p className="text-stone-700">{t('app.tagline')}</p>
      </div>

      {mode === 'reset' ? (
        <div>
          <h2 className="text-xl font-bold">{t('auth.resetTitle')}</h2>
          <p className="text-stone-700">{t('auth.resetHint')}</p>
        </div>
      ) : (
        <Segmented
          value={mode}
          options={[
            { value: 'signup', label: t('auth.signup') },
            { value: 'login', label: t('auth.login') },
          ]}
          onChange={switchMode}
        />
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <label>
          <span className="mb-1 block font-semibold">{t('auth.phone')}</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-600">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={16}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              className={`${inputClass} pl-12 text-lg tracking-wide`}
            />
          </span>
        </label>
        <div>
          <label htmlFor={passwordId} className="mb-1 block font-semibold">
            {mode === 'reset' ? t('auth.newPassword') : t('auth.password')}
          </label>
          <span className="relative block">
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={64}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-12 text-lg`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? t('auth.hide') : t('auth.show')}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-2.5 text-stone-600 active:bg-stone-100"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </span>
          {mode !== 'login' && <p className="mt-1 text-sm text-stone-600">{t('auth.passwordHint')}</p>}
        </div>

        {problem && (
          <Notice tone="warn" alert>
            <p>{t(problem.message)}</p>
            {problem.fix && (
              <button type="button" onClick={() => switchMode(problem.fix!)} className="mt-1 py-1 font-semibold underline">
                {t(FIX_LABEL[problem.fix])}
              </button>
            )}
          </Notice>
        )}
        {error ? <ErrorNotice error={error} /> : null}
        {!online && <Notice tone="warn">{t('auth.offline')}</Notice>}

        <button type="submit" disabled={busy || !online} className={`${primaryButton} w-full text-lg`}>
          {busy && <Loader2 className="size-5 motion-safe:animate-spin" />}
          {t(submitLabel)}
        </button>
      </form>

      {mode === 'login' && (
        <button onClick={() => switchMode('reset')} className="self-center py-2 font-semibold text-brand-800 underline">
          {t('auth.forgot')}
        </button>
      )}
      {mode === 'reset' && (
        <button onClick={() => switchMode('login')} className="self-center py-2 font-semibold text-brand-800 underline">
          {t('common.back')}
        </button>
      )}

      <p className="text-center text-sm text-stone-600">{t('auth.privacy')}</p>
      <button onClick={() => update({ lang: null })} className="inline-flex items-center gap-2 self-center py-2 text-stone-700">
        <Languages className="size-5" />
        {t('settings.language')}: {LANG_INFO[lang].native}
      </button>
    </main>
  )
}
