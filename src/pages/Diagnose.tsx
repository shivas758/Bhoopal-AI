import { Camera, ChevronDown, ImageUp, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { KCC_PHONE } from '../../shared/schemes'
import type { DiagnoseResult, Likelihood, Vote } from '../../shared/types'
import {
  CallKcc,
  Card,
  ErrorNotice,
  ExperimentalBadge,
  Feedback,
  Notice,
  PageHeader,
  Spinner,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../components/ui'
import type { MessageKey } from '../i18n'
import { api } from '../lib/api'
import { compressPhoto } from '../lib/image'
import { useOnline } from '../lib/hooks'
import { useSettings, useT } from '../settings'

const LIKELIHOOD_STYLE: Record<Likelihood, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-900',
  low: 'bg-stone-200 text-stone-700',
}

// Android may discard a backgrounded page (e.g. while the camera app is open): keep the photo and result
// for this tab so the farmer doesn't have to start again.
const SESSION_KEY = 'bhoopal.diagnose'

interface Photo {
  base64: string
  mimeType: 'image/jpeg'
  previewUrl: string
}

interface Session {
  photo: { base64: string; mimeType: 'image/jpeg' } | null
  crop: string
  note: string
  result: DiagnoseResult | null
}

function loadSession(): Session | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
    return raw && typeof raw === 'object' ? raw : null
  } catch {
    return null
  }
}

function saveSession(session: Session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage full: the farmer just loses the photo if Android discards the page.
  }
}

const toPhoto = (p: Session['photo']): Photo | null => (p ? { ...p, previewUrl: `data:${p.mimeType};base64,${p.base64}` } : null)

function WarningCard() {
  const { t } = useT()
  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
      <p className="mb-1 flex items-center gap-2 text-lg font-bold">
        <ShieldAlert className="size-6 text-amber-600" /> {t('diagnose.warnTitle')}
      </p>
      <p>{t('diagnose.warnBody', { kcc: KCC_PHONE })}</p>
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
      {result.crop_mismatch && <Notice tone="warn">{t('diagnose.cropMismatch', { crop: result.crop })}</Notice>}
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
          {/* Before the list too, not just at the end: the call matters more than any guess below. */}
          <CallKcc />
          <h2 className="mt-1 text-lg font-bold">{t('diagnose.possible')}</h2>
          {result.possible_problems.map((p, i) => (
            <Card key={i} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex-1 font-bold">{p.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${LIKELIHOOD_STYLE[p.likelihood]}`}>
                  {t(`diagnose.likelihood.${p.likelihood}` as MessageKey)}
                </span>
              </div>
              <p className="text-sm uppercase tracking-wide text-stone-600">{t(`diagnose.type.${p.type}` as MessageKey)}</p>
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
              {p.expert_options_redacted && (
                <Notice tone="warn">
                  <p className="font-semibold">{t('diagnose.expertRemoved')}</p>
                </Notice>
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

  const [session] = useState(loadSession)
  const [photo, setPhoto] = useState<Photo | null>(() => toPhoto(session?.photo ?? null))
  const [crop, setCrop] = useState(session?.crop ?? '')
  const [note, setNote] = useState(session?.note ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [badFormat, setBadFormat] = useState(false)
  const [result, setResult] = useState<DiagnoseResult | null>(session?.result ?? null)
  const [vote, setVote] = useState<Vote | null>(null)

  useEffect(() => {
    saveSession({ photo: photo && { base64: photo.base64, mimeType: photo.mimeType }, crop, note, result })
  }, [photo, crop, note, result])

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    setError(null)
    setBadFormat(false)
    try {
      setPhoto(await compressPhoto(file))
    } catch {
      // Usually an iPhone HEIC photo or another format the phone's browser can't open.
      setBadFormat(true)
    }
  }

  const check = async () => {
    if (!photo) return
    setLoading(true)
    setError(null)
    try {
      setResult(
        await api.diagnose({
          image: photo.base64,
          mimeType: photo.mimeType,
          lang,
          crop: crop.trim() || undefined,
          note: note.trim() || undefined,
          state: settings.state,
          district: settings.district,
          crops: settings.crops,
        }),
      )
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setPhoto(null)
    setResult(null)
    setVote(null)
    setError(null)
    setBadFormat(false)
    setNote('')
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
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
            {/* Did the guess turn out right? Wrong photo checks must get noticed. */}
            <Feedback
              vote={vote ?? undefined}
              onVote={(v) => {
                setVote(v)
                void api.feedback({ kind: 'photo', vote: v, lang })
              }}
            />
            <button onClick={reset} className={secondaryButton}>
              <RotateCcw className="size-5" /> {t('diagnose.again')}
            </button>
          </>
        ) : (
          <>
            {!online && <Notice tone="warn">{t('diagnose.offline')}</Notice>}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
            {/* Only formats every phone browser can shrink; HEIC gets a clear message instead of an error. */}
            <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} hidden />

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
            {badFormat && (
              <Notice tone="warn" alert>
                {t('diagnose.badFormat')}
              </Notice>
            )}

            {photo && (
              <>
                <input
                  value={crop}
                  onChange={(e) => setCrop(e.target.value)}
                  placeholder={t('diagnose.crop')}
                  aria-label={t('diagnose.crop')}
                  className={inputClass}
                  maxLength={60}
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('diagnose.note')}
                  aria-label={t('diagnose.note')}
                  className={inputClass}
                  rows={2}
                  maxLength={300}
                />
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
