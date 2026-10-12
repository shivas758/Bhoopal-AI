import { AlertTriangle, ArrowLeft, Info, Loader2, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { errorMessageKey } from '../lib/api'
import { useOnline } from '../lib/hooks'
import { go, type Route } from '../lib/router'
import { useT } from '../settings'

export const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200'
export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white active:bg-brand-800 disabled:opacity-50'
export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 font-medium text-stone-800 active:bg-stone-100 disabled:opacity-50'

export function PageHeader({ title, back = 'home', action }: { title: string; back?: Route | null; action?: ReactNode }) {
  const { t } = useT()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-stone-200 bg-white/95 px-3 py-2 backdrop-blur">
      {back && (
        <button onClick={() => go(back)} aria-label={t('common.back')} className="-ml-1 rounded-full p-2 active:bg-stone-100">
          <ArrowLeft className="size-6" />
        </button>
      )}
      <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
      {action}
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-950',
    danger: 'border-red-300 bg-red-50 text-red-900',
  }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={`flex gap-2 rounded-xl border p-3 text-sm ${styles}`}>
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

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT()
  return (
    <Notice tone="danger">
      <p>{t(errorMessageKey(error))}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold underline">
          {t('common.retry')}
        </button>
      )}
    </Notice>
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
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
      <AlertTriangle className="size-3" />
      {t('common.experimental')}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-stone-200 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${value === o.value ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
