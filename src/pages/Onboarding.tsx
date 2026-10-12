import { Search } from 'lucide-react'
import { useState } from 'react'
import { STATES } from '../../shared/states'
import { fold } from '../../shared/text'
import { LANG_INFO, LANGS } from '../../shared/types'
import { CropPicker } from '../components/CropPicker'
import { Notice, inputClass, primaryButton, secondaryButton } from '../components/ui'
import { translate } from '../i18n'
import { api } from '../lib/api'
import { useOfflineData } from '../lib/hooks'
import { guessLang, useSettings, useT } from '../settings'

type Step = 'lang' | 'state' | 'district' | 'crops'

function LanguageStep({ onPick }: { onPick: () => void }) {
  const { update } = useSettings()
  const suggested = guessLang()
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo.svg" alt="" className="size-20 rounded-2xl shadow" />
        <h1 className="text-3xl font-bold text-brand-800">BhooPal</h1>
      </div>
      <div>
        {/* Shown in every language: the farmer may not read English. */}
        <p className="mb-3 text-center text-lg font-semibold">{LANGS.map((l) => translate(l, 'settings.language')).join(' · ')}</p>
        <div className="grid grid-cols-2 gap-3">
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => {
                update({ lang: l })
                onPick()
              }}
              className={`rounded-2xl border-2 bg-white px-3 py-5 text-center shadow-sm active:bg-brand-50 ${
                l === suggested ? 'border-brand-600' : 'border-stone-200'
              }`}
            >
              <span className="block text-2xl font-bold">{LANG_INFO[l].native}</span>
              <span className="text-sm text-stone-500">{LANG_INFO[l].english}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

/** First launch: language → state (any in India) → district (optional) → crops grown. */
export function Onboarding() {
  const { t, lang } = useT()
  const { settings, update } = useSettings()
  const [step, setStep] = useState<Step>('lang')
  const [stateQuery, setStateQuery] = useState('')
  const [districtQuery, setDistrictQuery] = useState('')
  const [crops, setCrops] = useState<string[]>(settings.crops)
  // Same key as Settings, so the list is fetched once and still there offline.
  const districtList = useOfflineData(settings.state ? `districts:${settings.state}` : null, () => api.districts(settings.state!))
  const districts = districtList.data?.districts.map((d) => d.name) ?? null

  if (step === 'lang') return <LanguageStep onPick={() => setStep('state')} />

  const finish = () => update({ crops, onboarded: true })
  const back = () => setStep(step === 'crops' ? (settings.state ? 'district' : 'state') : step === 'district' ? 'state' : 'lang')

  let body
  if (step === 'state') {
    const q = fold(stateQuery)
    const matches = STATES.filter((s) => !q || fold(s.names[lang]).includes(q) || fold(s.id).includes(q))
    body = (
      <>
        <h1 className="text-2xl font-bold">{t('onboard.state')}</h1>
        <p className="text-stone-600">{t('onboard.stateHint')}</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
          <input value={stateQuery} onChange={(e) => setStateQuery(e.target.value)} placeholder={t('onboard.searchState')} className={`${inputClass} pl-10`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {matches.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                update({ state: s.id, district: undefined, coords: undefined })
                setStep('district')
              }}
              className={`rounded-xl border bg-white px-3 py-3 text-left font-semibold shadow-sm active:bg-brand-50 ${
                s.id === settings.state ? 'border-brand-600' : 'border-stone-200'
              }`}
            >
              {s.names[lang]}
            </button>
          ))}
        </div>
      </>
    )
  } else if (step === 'district') {
    const q = fold(districtQuery)
    const shown = districts?.filter((d) => !q || fold(d).includes(q)) ?? []
    body = (
      <>
        <h1 className="text-2xl font-bold">{t('onboard.district')}</h1>
        <p className="text-stone-600">{t('onboard.districtHint')}</p>
        {districts === null && districtList.loading ? (
          <p className="text-stone-600">{t('common.loading')}</p>
        ) : !districts?.length ? (
          // Agmarknet down or the phone offline: say so, instead of an empty screen.
          <Notice tone="warn" alert>
            <p>{t('onboard.districtError')}</p>
            <span className="mt-2 flex gap-2">
              <button onClick={districtList.reload} className={secondaryButton}>
                {t('common.retry')}
              </button>
              <button onClick={() => setStep('crops')} className={secondaryButton}>
                {t('common.skip')}
              </button>
            </span>
          </Notice>
        ) : (
          <>
          {districts.length > 8 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-500" />
              <input
                value={districtQuery}
                onChange={(e) => setDistrictQuery(e.target.value)}
                placeholder={t('onboard.searchDistrict')}
                aria-label={t('onboard.searchDistrict')}
                className={`${inputClass} pl-10`}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {shown.map((d) => (
              <button
                key={d}
                onClick={() => {
                  update({ district: d })
                  setStep('crops')
                }}
                className={`rounded-xl border bg-white px-3 py-3 text-left font-medium shadow-sm active:bg-brand-50 ${
                  d === settings.district ? 'border-brand-600' : 'border-stone-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          </>
        )}
      </>
    )
  } else {
    body = (
      <>
        <h1 className="text-2xl font-bold">{t('onboard.crops')}</h1>
        <p className="text-stone-600">{t('onboard.cropsHint')}</p>
        <CropPicker selected={crops} onChange={setCrops} />
      </>
    )
  }

  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pb-28 pt-8">{body}</main>
      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <button onClick={back} className="px-2 py-3 text-stone-600">
            {t('common.back')}
          </button>
          {step === 'crops' ? (
            <button onClick={finish} className={primaryButton}>
              {t('onboard.start')}
            </button>
          ) : (
            <button onClick={() => setStep('crops')} className="px-2 py-3 font-semibold text-brand-700">
              {t('common.skip')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
