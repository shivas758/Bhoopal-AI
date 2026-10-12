import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { COMMODITIES } from '../../shared/commodities'
import { fold } from '../../shared/text'
import { useT } from '../settings'
import { inputClass } from './ui'

// Most widely grown crops first, so most farmers find theirs without scrolling.
const POPULAR = [
  'Paddy',
  'Cotton',
  'Maize',
  'Groundnut',
  'Red Gram',
  'Dry Chillies',
  'Tomato',
  'Onion',
  'Sugarcane',
  'Wheat',
  'Turmeric',
  'Ragi',
  'Jowar',
  'Bajra',
  'Bengal Gram',
  'Green Gram',
  'Black Gram',
  'Soyabean',
  'Banana',
  'Coconut',
  'Arecanut',
  'Mango',
]

export function CropPicker({ selected, onChange }: { selected: string[]; onChange: (crops: string[]) => void }) {
  const { t, lang, bcp47 } = useT()
  const [query, setQuery] = useState('')

  const crops = useMemo(() => {
    const rank = (id: string) => (POPULAR.includes(id) ? POPULAR.indexOf(id) : POPULAR.length)
    const q = fold(query)
    return COMMODITIES.filter((c) => !q || fold(c.names[lang]).includes(q) || fold(c.names.en).includes(q)).sort(
      (a, b) => rank(a.id) - rank(b.id) || a.names[lang].localeCompare(b.names[lang], bcp47),
    )
  }, [query, lang, bcp47])

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('crops.search')} className={`${inputClass} pl-10`} />
      </div>
      {selected.length > 0 && <p className="text-sm font-medium text-brand-800">{t('crops.selected', { n: selected.length })}</p>}
      <div className="flex flex-wrap gap-2">
        {crops.map((c) => {
          const on = selected.includes(c.id)
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm font-medium ${
                on ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 bg-white text-stone-800'
              }`}
            >
              {on && <Check className="size-4" />}
              {c.names[lang]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
