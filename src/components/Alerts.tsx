import { ExternalLink, TriangleAlert } from 'lucide-react'
import { LANG_INFO, type AlertSeverity, type OfficialAlert } from '../../shared/types'
import type { MessageKey } from '../i18n'
import { formatDateTime } from '../lib/format'
import { useT } from '../settings'

const TONE: Record<AlertSeverity, string> = {
  Extreme: 'border-red-600 bg-red-50 text-red-950',
  Severe: 'border-red-600 bg-red-50 text-red-950',
  Moderate: 'border-amber-500 bg-amber-50 text-amber-950',
  Minor: 'border-yellow-400 bg-yellow-50 text-stone-900',
  Unknown: 'border-yellow-400 bg-yellow-50 text-stone-900',
}
const LABEL: Record<AlertSeverity, MessageKey> = {
  Extreme: 'alerts.severe',
  Severe: 'alerts.severe',
  Moderate: 'alerts.moderate',
  Minor: 'alerts.minor',
  Unknown: 'alerts.minor',
}

/** Official warnings (IMD, State Disaster Management Authority) for the farm, most serious first. */
export function OfficialAlerts({ alerts }: { alerts: OfficialAlert[] }) {
  const { t, bcp47 } = useT()
  if (!alerts.length) return null
  return (
    <section aria-label={t('alerts.title')} className="flex flex-col gap-2">
      {alerts.map((a) => (
        <div key={a.id} className={`rounded-2xl border-2 p-4 ${TONE[a.severity]}`}>
          <p className="flex items-center gap-2 font-bold">
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            {t(LABEL[a.severity])} · {a.office}
          </p>
          {/* The issuer's own words: in the farmer's language when they sent one, else English. */}
          <p lang={LANG_INFO[a.headlineLang].bcp47} className="mt-1">
            {a.headline}
          </p>
          <p className="mt-1 text-sm">{t('alerts.until', { time: formatDateTime(Date.parse(a.expires), bcp47) })}</p>
        </div>
      ))}
      <a
        href="https://sachet.ndma.gov.in/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-1 text-sm text-stone-700 underline"
      >
        <ExternalLink className="size-4" aria-hidden /> {t('alerts.source')}
      </a>
    </section>
  )
}

/** One line for the Home weather card: the most serious warning. */
export function AlertBanner({ alert }: { alert: OfficialAlert }) {
  const { t } = useT()
  return (
    <p className={`mt-3 flex gap-2 rounded-xl border-2 p-2.5 text-sm ${TONE[alert.severity]}`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-bold">
          {t(LABEL[alert.severity])} ({alert.office}):{' '}
        </span>
        <span lang={LANG_INFO[alert.headlineLang].bcp47} className="line-clamp-3">
          {alert.headline}
        </span>
      </span>
    </p>
  )
}
