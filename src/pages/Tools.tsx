import { useState } from 'react'
import { Card, Notice, PageHeader, Segmented, inputClass } from '../components/ui'
import type { MessageKey } from '../i18n'
import { formatNumber, formatRupees } from '../lib/format'
import { readJson, writeJson } from '../lib/storage'
import { useT } from '../settings'

const num = (s: string) => {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Remembers what the farmer typed so the calculators survive closing the app. */
function useSavedFields<T extends Record<string, string>>(key: string, initial: T) {
  const [fields, setFields] = useState<T>(() => ({ ...initial, ...readJson<Partial<T>>(key, {}) }))
  const set = (name: keyof T, value: string) =>
    setFields((prev) => {
      const next = { ...prev, [name]: value }
      writeJson(key, next)
      return next
    })
  return [fields, set] as const
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-stone-700">{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} />
    </label>
  )
}

// Standard Indian bag sizes: urea is sold in 45 kg bags, DAP and MOP in 50 kg bags.
const FERTILIZERS = [
  { key: 'fert.urea' as MessageKey, bag: 45 },
  { key: 'fert.dap' as MessageKey, bag: 50 },
  { key: 'fert.mop' as MessageKey, bag: 50 },
]

function FertilizerCalc() {
  const { t } = useT()
  const [f, set] = useSavedFields('calc.fert', { area: '1', n: '', p: '', k: '' })
  const area = num(f.area)
  // DAP covers phosphorus first and also supplies 18% N; urea tops up the remaining N; MOP covers potash.
  const dap = num(f.p) / 0.46
  const urea = Math.max(0, num(f.n) - dap * 0.18) / 0.46
  const mop = num(f.k) / 0.6
  const totals = [urea * area, dap * area, mop * area]

  return (
    <div className="flex flex-col gap-3">
      <Notice>{t('fert.help')}</Notice>
      <NumberField label={t('fert.area')} value={f.area} onChange={(v) => set('area', v)} />
      <div className="grid grid-cols-1 gap-3">
        <NumberField label={t('fert.n')} value={f.n} onChange={(v) => set('n', v)} />
        <NumberField label={t('fert.p')} value={f.p} onChange={(v) => set('p', v)} />
        <NumberField label={t('fert.k')} value={f.k} onChange={(v) => set('k', v)} />
      </div>
      {area > 0 && totals.some((x) => x > 0) && (
        <Card className="border-brand-200 bg-brand-50">
          <h3 className="mb-2 font-bold text-brand-900">{t('fert.result')}</h3>
          <ul className="space-y-2">
            {FERTILIZERS.map((fert, i) => (
              <li key={fert.key} className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{t(fert.key)}</span>
                <span className="text-right">
                  <span className="text-lg font-bold">{formatNumber(Math.round(totals[i]))} kg</span>
                  <span className="block text-xs text-stone-600">{t('fert.bags', { n: formatNumber(Math.round((totals[i] / fert.bag) * 10) / 10), size: fert.bag })}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-brand-900/80">{t('fert.note')}</p>
        </Card>
      )}
    </div>
  )
}

function ProfitCalc() {
  const { t } = useT()
  const [f, set] = useSavedFields('calc.profit', { area: '1', yield: '', price: '', seed: '', fertilizer: '', pesticide: '', labour: '', other: '' })
  const area = num(f.area)
  const quintals = area * num(f.yield)
  const income = quintals * num(f.price)
  const cost = num(f.seed) + num(f.fertilizer) + num(f.pesticide) + num(f.labour) + num(f.other)
  const profit = income - cost
  const costs: [keyof typeof f, MessageKey][] = [
    ['seed', 'profit.seed'],
    ['fertilizer', 'profit.fertilizer'],
    ['pesticide', 'profit.pesticide'],
    ['labour', 'profit.labour'],
    ['other', 'profit.other'],
  ]

  return (
    <div className="flex flex-col gap-3">
      <NumberField label={t('profit.area')} value={f.area} onChange={(v) => set('area', v)} />
      <NumberField label={t('profit.yield')} value={f.yield} onChange={(v) => set('yield', v)} />
      <NumberField label={t('profit.price')} value={f.price} onChange={(v) => set('price', v)} />
      <h3 className="mt-1 font-semibold">{t('profit.costs')}</h3>
      <div className="grid grid-cols-2 gap-3">
        {costs.map(([name, label]) => (
          <NumberField key={name} label={t(label)} value={f[name]} onChange={(v) => set(name, v)} />
        ))}
      </div>
      {(income > 0 || cost > 0) && (
        <Card className={profit >= 0 ? 'border-brand-200 bg-brand-50' : 'border-red-200 bg-red-50'}>
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt>{t('profit.income')}</dt>
              <dd className="font-semibold">{formatRupees(income)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('profit.totalCost')}</dt>
              <dd className="font-semibold">{formatRupees(cost)}</dd>
            </div>
            <div className="flex justify-between border-t border-black/10 pt-1.5 text-lg">
              <dt className="font-bold">{profit >= 0 ? t('profit.profit') : t('profit.loss')}</dt>
              <dd className={`font-bold ${profit >= 0 ? 'text-brand-800' : 'text-red-700'}`}>{formatRupees(Math.abs(profit))}</dd>
            </div>
            {area > 0 && (
              <div className="flex justify-between text-sm text-stone-600">
                <dt>{t('profit.perAcre')}</dt>
                <dd>{formatRupees(profit / area)}</dd>
              </div>
            )}
            {quintals > 0 && (
              <div className="flex justify-between text-sm text-stone-600">
                <dt>{t('profit.breakEven')}</dt>
                <dd>
                  {formatRupees(cost / quintals)} / {t('units.quintal')}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}
    </div>
  )
}

const AREA_UNITS: { key: MessageKey; perAcre: number }[] = [
  { key: 'units.acre', perAcre: 1 },
  { key: 'units.hectare', perAcre: 0.404686 },
  { key: 'units.guntha', perAcre: 40 },
  { key: 'units.cent', perAcre: 100 },
  { key: 'units.sqft', perAcre: 43560 },
]
const WEIGHT_UNITS: { key: MessageKey; perAcre: number }[] = [
  { key: 'units.kg', perAcre: 1 },
  { key: 'units.quintal', perAcre: 0.01 },
  { key: 'units.tonne', perAcre: 0.001 },
]

function Converter({ title, units }: { title: MessageKey; units: { key: MessageKey; perAcre: number }[] }) {
  const { t } = useT()
  const [value, setValue] = useState('1')
  const [from, setFrom] = useState(0)
  const base = num(value) / units[from].perAcre
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="font-bold">{t(title)}</h3>
      <div className="flex gap-2">
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} aria-label={t('units.value')} className={`${inputClass} flex-1`} />
        <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className={`${inputClass} w-auto`}>
          {units.map((u, i) => (
            <option key={u.key} value={i}>
              {t(u.key)}
            </option>
          ))}
        </select>
      </div>
      <ul className="divide-y divide-stone-100">
        {units.map(
          (u, i) =>
            i !== from && (
              <li key={u.key} className="flex justify-between py-2">
                <span>{t(u.key)}</span>
                <span className="font-semibold">{formatNumber(Math.round(base * u.perAcre * 100) / 100)}</span>
              </li>
            ),
        )}
      </ul>
    </Card>
  )
}

export function Tools() {
  const { t } = useT()
  const [tab, setTab] = useState<'fertilizer' | 'profit' | 'units'>('fertilizer')
  return (
    <>
      <PageHeader title={t('tools.title')} back="more" />
      <main className="flex flex-col gap-3 p-3 pb-24">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'fertilizer', label: t('tools.fertilizer') },
            { value: 'profit', label: t('tools.profit') },
            { value: 'units', label: t('tools.units') },
          ]}
        />
        {tab === 'fertilizer' && <FertilizerCalc />}
        {tab === 'profit' && <ProfitCalc />}
        {tab === 'units' && (
          <>
            <Converter title="units.area" units={AREA_UNITS} />
            <Converter title="units.weight" units={WEIGHT_UNITS} />
          </>
        )}
      </main>
    </>
  )
}
