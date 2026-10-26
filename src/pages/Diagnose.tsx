import { ArrowLeft, Camera, ChevronDown, ImageUp, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { COMMODITIES } from '../../shared/commodities'
import { KCC_PHONE } from '../../shared/helplines'
import type { DiagnoseResult, Likelihood, Vote } from '../../shared/types'
import {
  CallKcc,
  Card,
  ErrorNotice,
  ExperimentalBadge,
  Feedback,
  Notice,
  PageHeader,
  ShareButton,
  Spinner,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../components/ui'
import type { MessageKey } from '../i18n'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { useOnline } from '../lib/hooks'
import { compressPhoto, shareablePhoto, thumbnail, type CompressedPhoto, type PhotoMime } from '../lib/image'
import { appUrl } from '../lib/share'
import { readJson, writeJson } from '../lib/storage'
import { useSettings, useT } from '../settings'

const LIKELIHOOD_STYLE: Record<Likelihood, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-900',
  low: 'bg-stone-200 text-stone-700',
}

// Android may discard a backgrounded page (e.g. while the camera app is open): keep the photo and result
// for this tab so the farmer doesn't have to start again.
const SESSION_KEY = 'bhoopal.diagnose'

type Photo = CompressedPhoto

interface Session {
  photo: { base64: string; mimeType: PhotoMime } | null
  /** A crop tapped from the farmer's own crops (its English id), or null when typed in. */
  cropId?: string | null
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

// The last few checks stay on the phone (with a small photo), to show the agriculture officer later.
const HISTORY_KEY = 'diagnose.history'
const MAX_HISTORY = 3

interface SavedCheck {
  at: number
  thumb: string
  result: DiagnoseResult
}

function loadHistory(): SavedCheck[] {
  const saved = readJson<SavedCheck[]>(HISTORY_KEY, [])
  return Array.isArray(saved)
    ? saved.filter((c) => c && typeof c.at === 'number' && typeof c.thumb === 'string' && Array.isArray(c.result?.possible_problems))
    : []
}

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

  // Medicine names stay out of the shared text: a forwarded guess must not turn into a shopping list.
  const shareContent = async () => {
    const lines = [t('diagnose.shareWarn', { kcc: KCC_PHONE }), '']
    if (result.crop) lines.push(`*${result.crop}*`)
    if (result.summary) lines.push(result.summary)
    for (const p of result.possible_problems) lines.push(`• ${p.name} – ${t(`diagnose.likelihood.${p.likelihood}` as MessageKey)}`)
    lines.push('', t('share.fromApp', { url: appUrl() }))
    const file = await shareablePhoto(photo).catch(() => undefined)
    return { text: lines.join('\n'), file }
  }

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
      <ShareButton content={shareContent} label={t('diagnose.share')} className={secondaryButton} />
    </div>
  )
}

export function Diagnose() {
  const { t, lang, bcp47 } = useT()
  const { settings, update } = useSettings()
  const online = useOnline()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [session] = useState(loadSession)
  const [photo, setPhoto] = useState<Photo | null>(() => toPhoto(session?.photo ?? null))
  const [cropId, setCropId] = useState<string | null>(session?.cropId ?? null)
  const [crop, setCrop] = useState(session?.crop ?? '')
  const [note, setNote] = useState(session?.note ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [badFormat, setBadFormat] = useState(false)
  const [result, setResult] = useState<DiagnoseResult | null>(session?.result ?? null)
  const [vote, setVote] = useState<Vote | null>(null)
  const [history, setHistory] = useState(loadHistory)
  const [viewing, setViewing] = useState<SavedCheck | null>(null)
  const myCrops = settings.crops.map((id) => COMMODITIES.find((c) => c.id === id)).filter((c) => c !== undefined)

  useEffect(() => {
    saveSession({ photo: photo && { base64: photo.base64, mimeType: photo.mimeType }, cropId, crop, note, result })
  }, [photo, cropId, crop, note, result])

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
      const answer = await api.diagnose({
        image: photo.base64,
        mimeType: photo.mimeType,
        lang,
        crop: cropId ?? (crop.trim() || undefined),
        note: note.trim() || undefined,
        state: settings.state,
        district: settings.district,
        crops: settings.crops,
      })
      setResult(answer)
      if (answer.is_plant_image) {
        // A small copy only: three full photos could fill the phone's storage for this app.
        thumbnail(photo.previewUrl)
          .then((thumb) => {
            const next = [{ at: Date.now(), thumb, result: answer }, ...loadHistory()].slice(0, MAX_HISTORY)
            writeJson(HISTORY_KEY, next)
            setHistory(next)
          })
          .catch(() => {})
      }
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
    setCropId(null)
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

        {viewing ? (
          <>
            <p className="text-sm text-stone-700">{t('diagnose.savedOn', { date: formatDate(viewing.at, bcp47) })}</p>
            <Result result={viewing.result} photo={viewing.thumb} />
            <button onClick={() => setViewing(null)} className={secondaryButton}>
              <ArrowLeft className="size-5" /> {t('common.back')}
            </button>
          </>
        ) : !settings.photoConsent ? (
          <>
            <p className="text-sm text-stone-700">{t('diagnose.privacy')}</p>
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
                void api.feedback({ kind: 'photo', vote: v, lang, id: result.id })
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
                {myCrops.length > 0 && (
                  <div role="group" aria-label={t('diagnose.whichCrop')}>
                    <p className="mb-1 text-sm text-stone-700">{t('diagnose.whichCrop')}</p>
                    <div className="flex flex-wrap gap-2">
                      {myCrops.map((c) => (
                        <button
                          key={c.id}
                          aria-pressed={cropId === c.id}
                          onClick={() => {
                            setCropId(cropId === c.id ? null : c.id)
                            setCrop('')
                          }}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold ${cropId === c.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 bg-white text-stone-800'}`}
                        >
                          {c.names[lang]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input
                  value={crop}
                  onChange={(e) => {
                    setCrop(e.target.value)
                    setCropId(null)
                  }}
                  placeholder={myCrops.length > 0 ? t('diagnose.otherCrop') : t('diagnose.crop')}
                  aria-label={myCrops.length > 0 ? t('diagnose.otherCrop') : t('diagnose.crop')}
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
            {!photo && history.length > 0 && (
              <section className="mt-2 flex flex-col gap-2">
                <h2 className="font-bold">{t('diagnose.earlier')}</h2>
                {history.map((c) => (
                  <button
                    key={c.at}
                    onClick={() => setViewing(c)}
                    className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2 text-left shadow-sm active:bg-stone-50"
                  >
                    <img src={c.thumb} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-stone-600">{formatDate(c.at, bcp47)}</span>
                      <span className="block truncate font-semibold">
                        {[c.result.crop, c.result.possible_problems[0]?.name ?? (c.result.looks_healthy ? t('diagnose.healthy') : '')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}
