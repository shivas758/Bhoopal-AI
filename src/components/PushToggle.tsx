import { BellRing, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MessageKey } from '../i18n'
import { disablePush, enablePush, pushBlock, syncPush, type PushBlock } from '../lib/push'
import { readJson, writeJson } from '../lib/storage'
import { useSettings, useT } from '../settings'
import { primaryButton } from './ui'

const BLOCK_TEXT: Record<PushBlock, MessageKey> = { unsupported: 'push.unsupported', 'ios-install': 'push.ios', denied: 'push.denied' }

/** Turning the morning message on or off, with what went wrong if it didn't work. */
function usePush() {
  const { t } = useT()
  const { settings, update } = useSettings()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<MessageKey | null>(null)
  const block = pushBlock()

  const turnOn = async () => {
    setBusy(true)
    setProblem(null)
    const result = await enablePush(settings, { title: 'BhooPal', body: t('push.fallbackBody') })
    setBusy(false)
    if (result === 'on') update({ alerts: true })
    else setProblem(result === 'denied' ? 'push.denied' : 'push.failed')
  }
  const turnOff = async () => {
    setBusy(true)
    update({ alerts: false })
    await disablePush().catch(() => {})
    setBusy(false)
  }
  return { on: settings.alerts, busy, problem: problem ?? (block ? BLOCK_TEXT[block] : null), blocked: Boolean(block), turnOn, turnOff }
}

/** Settings: the morning weather message switch. */
export function PushSetting() {
  const { t } = useT()
  const push = usePush()
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={push.on}
          disabled={push.busy || (push.blocked && !push.on)}
          onChange={(e) => void (e.target.checked ? push.turnOn() : push.turnOff())}
          className="mt-0.5 size-6 shrink-0 accent-brand-700"
        />
        <span>
          <span className="block font-semibold">{t('push.settingTitle')}</span>
          <span className="block text-sm text-stone-700">{t('push.settingBody')}</span>
        </span>
      </label>
      {push.problem && !push.on && <p className="text-sm text-amber-900">{t(push.problem)}</p>}
    </div>
  )
}

const DISMISS_KEY = 'push.offerDismissed'

/** Weather page: a one-tap offer to get this every morning, until the farmer turns it on or closes it. */
export function PushOffer() {
  const { t } = useT()
  const push = usePush()
  const [dismissed, setDismissed] = useState(() => readJson<boolean>(DISMISS_KEY, false))
  if (push.on || dismissed || (push.blocked && push.problem !== 'push.ios')) return null
  const close = () => {
    writeJson(DISMISS_KEY, true)
    setDismissed(true)
  }
  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <BellRing className="mt-0.5 size-6 shrink-0 text-brand-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-900">{t('push.offer')}</p>
        <p className="text-sm text-brand-900/80">{t('push.settingBody')}</p>
        {push.blocked ? (
          <p className="mt-2 text-sm text-amber-900">{t('push.ios')}</p>
        ) : (
          <button onClick={() => void push.turnOn()} disabled={push.busy} className={`${primaryButton} mt-2 py-2 text-sm`}>
            {t('push.turnOn')}
          </button>
        )}
        {push.problem && !push.blocked && <p className="mt-2 text-sm text-amber-900">{t(push.problem)}</p>}
      </div>
      <button onClick={close} aria-label={t('common.close')} className="-m-1 rounded-full p-2.5 text-brand-900">
        <X className="size-5" />
      </button>
    </div>
  )
}

/** Keeps the server's copy of the farm in step with Settings while alerts are on (mounted once, in App). */
export function PushSync() {
  const { t } = useT()
  const { settings } = useSettings()
  const { alerts, lang, state, district, coords } = settings
  useEffect(() => {
    if (!alerts) return
    const timer = setTimeout(() => void syncPush(settings, { title: 'BhooPal', body: t('push.fallbackBody') }), 1500)
    return () => clearTimeout(timer)
    // Only the fields the server keeps matter.
  }, [alerts, lang, state, district, coords?.lat, coords?.lon])
  return null
}
