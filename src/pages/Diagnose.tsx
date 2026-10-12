import { Camera, ChevronDown, ImageUp, Phone, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import type { DiagnoseResult, Likelihood } from '../../shared/types'
import { Card, ErrorNotice, ExperimentalBadge, Notice, PageHeader, Spinner, inputClass, primaryButton, secondaryButton } from '../components/ui'
import type { MessageKey } from '../i18n'
import { api } from '../lib/api'
import { compressPhoto } from '../lib/image'
import { useOnline } from '../lib/hooks'
import { useSettings, useT } from '../settings'

const KCC = '1800-180-1551'

const LIKELIHOOD_STYLE: Record<Likelihood, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-900',
  low: 'bg-stone-200 text-stone-700',
}

function CallKcc() {
  const { t } = useT()
  return (
    <a href={`tel:${KCC.replace(/-/g, '')}`} className={`${primaryButton} w-full`}>
      <Phone className="size-5" /> {t('diagnose.callKcc')} · {KCC}
    </a>
  )
}

function WarningCard() {
  const { t } = useT()
  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
      <p className="mb-1 flex items-center gap-2 text-lg font-bold">
        <ShieldAlert className="size-6 text-amber-600" /> {t('diagnose.warnTitle')}
      </p>
      <p>{t('diagnose.warnBody')}</p>
    </div>
  )
}

function Result({ result, photo }: { result: DiagnoseResult; photo: string }) {
  const { t } = useT()
  const [openExpert, setOpenExpert] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <img src={photo} alt="" className="size-24 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0">
          {result.crop && <p className="font-bold">{result.crop}</p>}
          <p className="text-sm">{result.summary}</p>
        </div>
      </div>

      {!result.is_plant_image && <Notice tone="warn">{t('diagnose.notPlant')}</Notice>}
      {result.image_quality === 'poor' && (
        <Notice tone="warn">
          <p className="font-semibold">{t('diagnose.poorPhoto')}</p>
          {result.retake_tips && <p>{result.retake_tips}</p>}
        </Notice>
      )}
      {result.looks_healthy && result.possible_problems.length === 0 && (
        <Notice>
          <span className="inline-flex items-center gap-1 font-semibold">
            <ShieldCheck className="size-4" /> {t('diagnose.healthy')}
          </span>
        </Notice>
      )}

      {result.possible_problems.length > 0 && (
        <>
          <h2 className="mt-1 text-lg font-bold">{t('diagnose.possible')}</h2>
          {result.possible_problems.map((p, i) => (
            <Card key={i} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex-1 font-bold">{p.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LIKELIHOOD_STYLE[p.likelihood]}`}>
                  {t(`diagnose.likelihood.${p.likelihood}` as MessageKey)}
                </span>
              </div>
              <p className="text-xs uppercase tracking-wide text-stone-500">{t(`diagnose.type.${p.type}` as MessageKey)}</p>
              {p.signs && (
                <p className="text-sm">
                  <span className="font-semibold">{t('diagnose.signs')}: </span>
                  {p.signs}
                </p>
              )}
              {p.safe_steps.length > 0 && (
                <div className="rounded-xl bg-brand-50 p-3">
                  <p className="mb-1 text-sm font-semibold text-brand-900">{t('diagnose.steps')}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {p.safe_steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {p.expert_options && (
                <div className="rounded-xl border border-amber-300">
                  <button
                    onClick={() => setOpenExpert(openExpert === i ? null : i)}
                    aria-expanded={openExpert === i}
                    className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold text-amber-900"
                  >
                    <ShieldAlert className="size-4" />
                    <span className="flex-1">{t('diagnose.expert')}</span>
                    <ChevronDown className={`size-4 transition ${openExpert === i ? 'rotate-180' : ''}`} />
                  </button>
                  {openExpert === i && (
                    <div className="space-y-2 border-t border-amber-200 p-3 text-sm">
                      <p className="font-semibold text-red-800">{t('diagnose.expertWarn')}</p>
                      <p>{p.expert_options}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </>
      )}

      <Notice tone="warn">{t('diagnose.confirm')}</Notice>
      <CallKcc />
    </div>
  )
}

export function Diagnose() {
  const { t, lang } = useT()
  const { settings, update } = useSettings()
  const online = useOnline()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [photo, setPhoto] = useState<{ base64: string; mimeType: 'image/jpeg'; previewUrl: string } | null>(null)
  const [crop, setCrop] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<DiagnoseResult | null>(null)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    setError(null)
    try {
      setPhoto(await compressPhoto(file))
    } catch (err) {
      setError(err)
    }
  }

  const check = async () => {
    if (!photo) return
    setLoading(true)
    setError(null)
    try {
      setResult(await api.diagnose({ image: photo.base64, mimeType: photo.mimeType, lang, crop: crop.trim() || undefined, note: note.trim() || undefined }))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setPhoto(null)
    setResult(null)
    setError(null)
    setNote('')
  }

  return (
    <>
      <PageHeader title={t('diagnose.title')} action={<ExperimentalBadge />} />
      <main className="flex flex-col gap-3 p-3 pb-24">
        <WarningCard />

        {!settings.photoConsent ? (
          <>
            <button onClick={() => update({ photoConsent: true })} className={`${primaryButton} w-full`}>
              {t('diagnose.agree')}
            </button>
            <CallKcc />
          </>
        ) : result && photo ? (
          <>
            <Result result={result} photo={photo.previewUrl} />
            <button onClick={reset} className={secondaryButton}>
              <RotateCcw className="size-5" /> {t('diagnose.again')}
            </button>
          </>
        ) : (
          <>
            {!online && <Notice tone="warn">{t('diagnose.offline')}</Notice>}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
            <input ref={galleryRef} type="file" accept="image/*" onChange={onFile} hidden />

            {photo ? (
              <img src={photo.previewUrl} alt="" className="max-h-80 w-full rounded-2xl bg-stone-200 object-contain" />
            ) : (
              <p className="text-sm text-stone-600">{t('diagnose.tips')}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => cameraRef.current?.click()} className={photo ? secondaryButton : primaryButton}>
                <Camera className="size-5" /> {t('diagnose.takePhoto')}
              </button>
              <button onClick={() => galleryRef.current?.click()} className={secondaryButton}>
                <ImageUp className="size-5" /> {t('diagnose.gallery')}
              </button>
            </div>

            {photo && (
              <>
                <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder={t('diagnose.crop')} className={inputClass} maxLength={60} />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('diagnose.note')} className={inputClass} rows={2} maxLength={300} />
                <button onClick={check} disabled={loading || !online} className={`${primaryButton} w-full`}>
                  {t('diagnose.check')}
                </button>
              </>
            )}
            {loading && <Spinner label={t('diagnose.checking')} />}
            {error ? <ErrorNotice error={error} /> : null}
          </>
        )}
      </main>
    </>
  )
}
