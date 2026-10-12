import { AlertTriangle, ArrowLeft, Check, Info, Loader2, Phone, Share2, ThumbsDown, ThumbsUp, WifiOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { KCC_PHONE } from '../../shared/helplines'
import type { Vote } from '../../shared/types'
import { errorMessageKey, errorMessageVars } from '../lib/api'
import { useOnline } from '../lib/hooks'
import { go, type Route } from '../lib/router'
import { share } from '../lib/share'
import { useT } from '../settings'

export const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base outline-none placeholder:text-stone-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-200'
export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white active:bg-brand-800 disabled:opacity-50'
export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 font-medium text-stone-800 active:bg-stone-100 disabled:opacity-50'
export const smallButton = 'inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-2.5 text-sm font-medium text-stone-700 active:bg-stone-200'

export function PageHeader({ title, back = 'home', action }: { title: string; back?: Route | null; action?: ReactNode }) {
  const { t } = useT()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-2">
      {back && (
        <button onClick={() => go(back)} aria-label={t('common.back')} className="-ml-1 rounded-full p-3 active:bg-stone-100">
          <ArrowLeft className="size-6" />
        </button>
      )}
      <h1 tabIndex={-1} className="flex-1 truncate text-lg font-bold outline-none">
        {title}
      </h1>
      {action}
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>
}

/** A boxed message. Screen readers announce it only when `alert` is set (errors), not for every hint. */
export function Notice({ tone = 'info', alert = false, children }: { tone?: 'info' | 'warn' | 'danger'; alert?: boolean; children: ReactNode }) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-950',
    danger: 'border-red-300 bg-red-50 text-red-900',
  }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div role={alert ? 'alert' : 'note'} className={`flex gap-2 rounded-xl border p-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-stone-600" role="status">
      <Loader2 className="size-5 animate-spin" />
      {label && <span>{label}</span>}
    </div>
  )
}

const tel = (phone: string) => `tel:${phone.replace(/-/g, '')}`

/** One-tap call to the free Kisan Call Centre. */
export function CallKcc({ className = '' }: { className?: string }) {
  const { t } = useT()
  return (
    <a href={tel(KCC_PHONE)} className={`${primaryButton} w-full ${className}`}>
      <Phone className="size-5" /> {t('diagnose.callKcc')} · {KCC_PHONE}
    </a>
  )
}

/** Small tappable phone numbers, for messages that point to a helpline. */
export function CallLinks({ phones }: { phones: string[] }) {
  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {phones.map((p) => (
        <a key={p} href={tel(p)} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 font-bold text-stone-900 ring-1 ring-black/10">
          <Phone className="size-4" /> {p}
        </a>
      ))}
    </span>
  )
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, bcp47 } = useT()
  const key = errorMessageKey(error)
  const waiting = key === 'error.resting' || key === 'error.daily_limit'
  return (
    <Notice tone={waiting ? 'warn' : 'danger'} alert>
      <p>{t(key, { kcc: KCC_PHONE, ...errorMessageVars(error, bcp47, t('weather.tomorrow')) })}</p>
      {key === 'error.blocked' && <CallLinks phones={['108', '112', KCC_PHONE]} />}
      {waiting && <CallLinks phones={[KCC_PHONE]} />}
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold underline">
          {t('common.retry')}
        </button>
      )}
    </Notice>
  )
}

/** "Helpful / Wrong" under an answer or a photo check, so systematically wrong answers get noticed. */
export function Feedback({ vote, onVote }: { vote?: Vote; onVote: (vote: Vote) => void }) {
  const { t } = useT()
  if (vote) return <p className="text-sm text-stone-600">{t('feedback.thanks')}</p>
  return (
    <span className="flex flex-wrap gap-2">
      <button onClick={() => onVote('up')} className={smallButton}>
        <ThumbsUp className="size-4" /> {t('feedback.helpful')}
      </button>
      <button onClick={() => onVote('down')} className={smallButton}>
        <ThumbsDown className="size-4" /> {t('feedback.wrong')}
      </button>
    </span>
  )
}

/** Share to WhatsApp or any app. The content is built only when tapped, since preparing a photo takes a moment. */
export function ShareButton({
  content,
  label,
  className = smallButton,
}: {
  content: () => Promise<{ text: string; file?: File }>
  label?: string
  className?: string
}) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    if ((await share(await content())) !== 'copied') return
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <button onClick={() => void onClick()} className={className}>
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />} {copied ? t('share.copied') : (label ?? t('share.share'))}
    </button>
  )
}

export function OfflineBanner() {
  const online = useOnline()
  const { t } = useT()
  if (online) return null
  return (
    <div className="flex items-center gap-2 bg-stone-800 px-3 py-2 text-sm text-white">
      <WifiOff className="size-4 shrink-0" />
      {t('common.offline')}
    </div>
  )
}

export function ExperimentalBadge() {
  const { t } = useT()
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-950">
      <AlertTriangle className="size-3" />
      {t('common.experimental')}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-stone-200 p-1" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold ${value === o.value ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
