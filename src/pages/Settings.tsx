import { useState } from 'react'
import { LANG_INFO, LANGS } from '../../shared/types'
import { STATES, findState } from '../../shared/states'
import { CropPicker } from '../components/CropPicker'
import { Card, PageHeader, inputClass } from '../components/ui'
import { api } from '../lib/api'
import { useOfflineData } from '../lib/hooks'
import { formatDateTime } from '../lib/format'
import { clearAll } from '../lib/storage'
import { useSettings, useT } from '../settings'

export function Settings() {
  const { t, lang, bcp47 } = useT()
  const { settings, update } = useSettings()
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)
  const state = findState(settings.state)
  const districts = useOfflineData(state ? `districts:${state.id}` : null, () => api.districts(state!.id))

  const clear = () => {
    if (!confirmClear) return setConfirmClear(true)
    // Keep the phone's id: clearing data must not reset its daily share of the free AI.
    clearAll(['settings', 'device'])
    update({ coords: undefined })
    setConfirmClear(false)
    setCleared(true)
  }

  return (
    <>
      <PageHeader title={t('settings.title')} back="more" />
      <main className="flex flex-col gap-3 p-3 pb-24">
        <Card>
          <h2 className="mb-2 font-bold">{t('settings.language')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => update({ lang: l })}
                aria-pressed={l === lang}
                className={`rounded-xl border-2 px-2 py-3 font-semibold ${l === lang ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-stone-200'}`}
              >
                {LANG_INFO[l].native}
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">{t('settings.location')}</h2>
          <label className="text-sm">
            <span className="mb-1 block text-stone-600">{t('common.state')}</span>
            <select
              value={settings.state ?? ''}
              onChange={(e) => update({ state: e.target.value, district: undefined, coords: undefined })}
              className={inputClass}
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {STATES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.names[lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-stone-600">{t('common.district')}</span>
            <select
              value={settings.district ?? ''}
              onChange={(e) => update({ district: e.target.value || undefined })}
              disabled={!state}
              className={inputClass}
            >
              <option value="">{t('common.allDistricts')}</option>
              {settings.district && !districts.data?.districts.some((d) => d.name === settings.district) && (
                <option value={settings.district}>{settings.district}</option>
              )}
              {districts.data?.districts.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">{t('settings.crops')}</h2>
          <CropPicker selected={settings.crops} onChange={(crops) => update({ crops })} />
        </Card>

        <Card>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => update({ autoSpeak: e.target.checked })} className="size-6 accent-brand-700" />
            <span>{t('settings.autoSpeak')}</span>
          </label>
        </Card>

        <Card className="space-y-2 text-sm">
          <h2 className="text-base font-bold">{t('settings.about')}</h2>
          <p>{t('settings.aboutBody')}</p>
          <p>{t('settings.privacy')}</p>
          <p className="text-xs text-stone-600">
            BhooPal v{__APP_VERSION__} · {formatDateTime(Date.parse(__BUILD__), bcp47)}
          </p>
        </Card>

        <button onClick={clear} className="rounded-xl border border-red-300 bg-white px-4 py-3 font-semibold text-red-700">
          {cleared ? t('settings.cleared') : confirmClear ? t('settings.clearConfirm') : t('settings.clearData')}
        </button>
      </main>
    </>
  )
}
