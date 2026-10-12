import { ChevronDown, ExternalLink, Phone } from 'lucide-react'
import { HELPLINES } from '../../shared/helplines'
import { SCHEMES, SCHEMES_CHECKED, type SchemeLinkKind } from '../../shared/schemes'
import { STATE_AGRI_INFO } from '../../shared/stateSchemes'
import { STATES } from '../../shared/states'
import { Card, Notice, PageHeader } from '../components/ui'
import type { MessageKey } from '../i18n'
import { useSettings, useT } from '../settings'

const tel = (phone: string) => `tel:${phone.replace(/-/g, '')}`

const LINK_LABEL: Record<SchemeLinkKind, MessageKey> = {
  status: 'schemes.linkStatus',
  mandis: 'schemes.linkMandis',
  guide: 'schemes.linkGuide',
}
const linkClass = 'inline-flex items-center gap-1 rounded-lg bg-stone-100 px-3 py-2 font-medium'

export function Schemes() {
  const { t, lang, bcp47 } = useT()
  const { settings } = useSettings()
  const state = STATES.find((s) => s.id === settings.state)
  const portal = state && STATE_AGRI_INFO[state.id]?.portal
  const checked = new Date(`${SCHEMES_CHECKED}-01T12:00:00`).toLocaleDateString(bcp47, { month: 'long', year: 'numeric' })

  return (
    <>
      <PageHeader title={t('schemes.title')} back="more" />
      <main className="flex flex-col gap-3 p-3 pb-24">
        <Notice tone="warn">{t('schemes.warning')}</Notice>

        {state && portal && (
          <Card>
            <h2 className="font-bold">{t('schemes.stateTitle', { state: state.names[lang] })}</h2>
            <p className="mb-2 text-sm text-stone-700">{t('schemes.stateBody')}</p>
            <a href={portal.url} target="_blank" rel="noopener noreferrer" className={`${linkClass} text-sm`}>
              <ExternalLink className="size-4 shrink-0" /> {portal.name[lang]}
            </a>
          </Card>
        )}

        <Card>
          <h2 className="mb-2 font-bold">{t('schemes.helplines')}</h2>
          <ul className="divide-y divide-stone-100">
            {HELPLINES.map((h) => (
              <li key={h.phone}>
                <a href={tel(h.phone)} className="flex items-center gap-3 py-2.5">
                  <span className="rounded-full bg-brand-100 p-2 text-brand-800">
                    <Phone className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{h.label[lang]}</span>
                  <span className="font-bold text-brand-800">{h.phone}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {SCHEMES.map((s) => {
          const text = s.text[lang]
          return (
            <details key={s.id} className="group rounded-2xl border border-stone-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold">{text.name}</h2>
                  <p className="text-sm text-stone-600">{text.what}</p>
                </div>
                <ChevronDown className="size-5 shrink-0 text-stone-400 transition group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-stone-100 p-4 pt-3 text-sm">
                <div>
                  <h3 className="font-semibold text-brand-800">{t('schemes.benefit')}</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    {text.benefit.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-brand-800">{t('schemes.howToApply')}</h3>
                  <ol className="list-decimal space-y-1 pl-5">
                    {text.apply.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ol>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      <ExternalLink className="size-4" /> {t('schemes.website')}
                    </a>
                  )}
                  {s.links?.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      <ExternalLink className="size-4" /> {t(LINK_LABEL[l.kind])}
                    </a>
                  ))}
                  {s.phones.map((p) => (
                    <a key={p} href={tel(p)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-2 font-medium text-brand-800">
                      <Phone className="size-4" /> {p}
                    </a>
                  ))}
                </div>
              </div>
            </details>
          )
        })}

        <p className="px-1 text-sm text-stone-600">{t('schemes.verify', { date: checked })}</p>
      </main>
    </>
  )
}
