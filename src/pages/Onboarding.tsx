import { Check, LocateFixed, Search, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { districtLabel, nearestDistrict } from '../../shared/districts'
import { STATES } from '../../shared/states'
import { fold } from '../../shared/text'
import { LANG_INFO, LANGS, type Lang } from '../../shared/types'
import { CropPicker } from '../components/CropPicker'
import { Notice, inputClass, primaryButton, secondaryButton } from '../components/ui'
import { loadDict } from '../i18n'
import { PICKER_TEXT } from '../i18n/picker'
import { api } from '../lib/api'
import { useLocate } from '../lib/data'
import { useOfflineData } from '../lib/hooks'
import { speak } from '../lib/speech'
import { guessLang, useSettings, useT } from '../settings'

type Step = 'lang' | 'state' | 'district' | 'crops'

function LanguageStep({ onPick }: { onPick: () => void }) {
  const { update } = useSettings()
  const suggested = guessLang()
  // Languages this phone can say aloud; a speaker button is hidden once it turns out there is no voice.
  const [noVoice, setNoVoice] = useState<Lang[]>([])
  const sayName = async (l: Lang) => {
    if (!(await speak(LANG_INFO[l].native, LANG_INFO[l].bcp47))) setNoVoice((v) => [...v, l])
  }
  // Fetch the likely choice while the farmer reads, so the next screen opens straight away.
  useEffect(() => {
    void loadDict(suggested).catch(() => {})
  }, [suggested])
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo.svg" alt="" className="size-20 rounded-2xl shadow" />
        <h1 className="text-3xl font-bold text-brand-800">BhooPal</h1>
      </div>
      <div>
        {/* Shown in every language: the farmer may not read English. */}
        <p className="mb-3 flex flex-wrap justify-center gap-x-2 text-center text-lg font-semibold">
          {LANGS.map((l, i) => (
            <span key={l} lang={LANG_INFO[l].bcp47}>
              {PICKER_TEXT[l].language}
              {i < LANGS.length - 1 ? ' ·' : ''}
            </span>
          ))}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {LANGS.map((l) => (
            <div key={l} className="relative">
              <button
                lang={LANG_INFO[l].bcp47}
                onClick={() => {
                  update({ lang: l })
                  onPick()
                }}
                className={`w-full rounded-2xl border-2 px-3 pb-5 pt-9 text-center shadow-sm active:bg-brand-100 ${
                  l === suggested ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'
                }`}
              >
                {l === suggested && <Check className="absolute left-2 top-2 size-5 text-brand-700" aria-hidden />}
                <span className="block text-2xl font-bold">{LANG_INFO[l].native}</span>
                {/* "Free, no sign-up, no OTP", in that language: farmers are rightly wary of apps asking for money. */}
                <span className="mt-1 block text-sm text-stone-700">{PICKER_TEXT[l].trust}</span>
              </button>
              {!noVoice.includes(l) && (
                <button
                  onClick={() => void sayName(l)}
                  aria-label={`${PICKER_TEXT[l].readAloud}: ${LANG_INFO[l].native}`}
                  className="absolute right-1 top-1 rounded-full p-2.5 text-stone-600 active:bg-stone-200"
                >
                  <Volume2 className="size-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

/** First launch: language → state (any in India) → district (optional) → crops grown. */
export function Onboarding() {
  const { t, lang, bcp47 } = useT()
  const { settings, update } = useSettings()
  // After a restart mid-way, continue where the farmer stopped.
  const [step, setStep] = useState<Step>(() => (!settings.lang ? 'lang' : !settings.state ? 'state' : 'crops'))
  const [stateQuery, setStateQuery] = useState('')
  const [districtQuery, setDistrictQuery] = useState('')
  const [crops, setCrops] = useState<string[]>(settings.crops)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [noMatch, setNoMatch] = useState(false)
  const { locate, locating, failed } = useLocate()
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
        <p className="text-stone-700">{t('onboard.stateHint')}</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-500" />
          <input
            value={stateQuery}
            onChange={(e) => setStateQuery(e.target.value)}
            placeholder={t('onboard.searchState')}
            aria-label={t('onboard.searchState')}
            className={`${inputClass} pl-10`}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {matches.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                update({ state: s.id, district: undefined, coords: undefined })
                setSuggestion(null)
                setNoMatch(false)
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
    const label = (name: string) => districtLabel(settings.state, name, lang)
    const q = fold(districtQuery)
    const shown = (districts ?? [])
      .filter((d) => !q || fold(label(d)).includes(q) || fold(d).includes(q))
      .sort((a, b) => label(a).localeCompare(label(b), bcp47))
    const pick = (d: string) => {
      update({ district: d })
      setStep('crops')
    }
    // GPS -> the nearest district centre in this state, offered for the farmer to confirm.
    const fromGps = () =>
      locate((c) => {
        const near = nearestDistrict(c.lat, c.lon, settings.state)
        const match = near && districts?.find((d) => fold(d).replace(/[^a-z]/g, '') === fold(near.name).replace(/[^a-z]/g, ''))
        setSuggestion(match ?? null)
        setNoMatch(!match)
      })
    body = (
      <>
        <h1 className="text-2xl font-bold">{t('onboard.district')}</h1>
        <p className="text-stone-700">{t('onboard.districtHint')}</p>
        {districts === null && districtList.loading ? (
          <p className="text-stone-700">{t('common.loading')}</p>
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
            <button onClick={fromGps} disabled={locating} className={secondaryButton}>
              <LocateFixed className="size-5" /> {locating ? t('weather.locating') : t('onboard.useLocation')}
            </button>
            {suggestion && (
              <Notice>
                <p className="font-semibold">{t('onboard.nearestDistrict', { district: label(suggestion) })}</p>
                <button onClick={() => pick(suggestion)} className={`${primaryButton} mt-2`}>
                  <Check className="size-5" /> {label(suggestion)}
                </button>
              </Notice>
            )}
            {(noMatch || failed) && <Notice tone="warn">{t('onboard.locationNoMatch')}</Notice>}
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
                  onClick={() => pick(d)}
                  className={`rounded-xl border bg-white px-3 py-3 text-left font-medium shadow-sm active:bg-brand-50 ${
                    d === settings.district ? 'border-brand-600' : 'border-stone-200'
                  }`}
                >
                  {label(d)}
                  {/* Agmarknet's English name too: officials and price boards use it. */}
                  {label(d) !== d && (
                    <span lang="en" className="block text-sm font-normal text-stone-600">
                      {d}
                    </span>
                  )}
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
        <p className="text-stone-700">{t('onboard.cropsHint')}</p>
        <CropPicker selected={crops} onChange={setCrops} />
      </>
    )
  }

  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pb-28 pt-8">{body}</main>
      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <button onClick={back} className="px-2 py-3 text-stone-700">
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
