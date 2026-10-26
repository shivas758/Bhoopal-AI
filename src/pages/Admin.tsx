import { KeyRound, LogOut, RefreshCw, Search, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatPhone } from '../../shared/account'
import { dateTimeFormat } from '../../shared/time'
import { LANGS, LANG_INFO, isLang, type AdminAiStats, type AdminAnswer, type AdminDay, type AdminStats, type AdminUser, type Lang } from '../../shared/types'
import { Card, Notice, Segmented, Spinner, inputClass, primaryButton, smallButton } from '../components/ui'
import { AdminError, fetchAdminAnswers, fetchAdminStats, forgetToken, loadToken, saveToken } from '../lib/admin'

// The owner's analytics page (#/admin): who signed up, who comes back, what they use and how the AI is doing.
// English only, no farmer log-in and not linked from the app: it opens with the ADMIN_TOKEN secret, which this
// browser then remembers. The charts are plain SVG (no library): thin columns, a hairline grid, a tooltip on
// hover, and every number is also in a table further down.

type Days = '7' | '30' | '90'
const DAY_OPTIONS: { value: Days; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

// The app's green for a chart with one series. Two series share a chart only as blue + orange (identity) or
// blue + red (answered / not answered): both pairs checked for colour-blind separation and 3:1 contrast on white.
const GREEN = '#15803d'
const BLUE = '#2a78d6'
const ORANGE = '#eb6834'
const RED = '#d03b3b'

const plain = new Intl.NumberFormat('en-IN')
const compactFormat = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
const compact = (n: number) => (n >= 10_000 ? compactFormat.format(n) : plain.format(n))
const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '–')
/** "23 Oct" for an India date. */
const shortDate = (day: string) => dateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${day}T00:00:00`))
/** "23 Oct 2026" in India for a moment. */
const dateIst = (ms: number) => dateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(ms))
/** "23 Oct, 9:14 am" in India. */
const dateTimeIst = (ms: number) =>
  dateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(ms))
const indiaDay = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10)

/** "today", "yesterday", "5 days ago", or the date. */
function ago(ms: number | null, now: number) {
  if (!ms) return 'never'
  const days = Math.round((Date.parse(indiaDay(now)) - Date.parse(indiaDay(ms))) / 86400_000)
  if (days <= 0) return `today ${dateTimeIst(ms).replace(/^.*, /, '')}`
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return dateIst(ms)
}

function errorText(error: AdminError) {
  switch (error.code) {
    case 'unauthorized':
      return 'That token is wrong (or the ADMIN_TOKEN secret has changed).'
    case 'not_configured':
      return 'The ADMIN_TOKEN secret is not set on this server, so this page is switched off.'
    case 'network':
      return 'No connection to the server.'
    default:
      return 'The server could not compute the numbers. Is migration 0004 applied to this database?'
  }
}

export function Admin() {
  const [token, setToken] = useState(loadToken)
  const [days, setDays] = useState<Days>('30')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AdminError | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    document.title = 'BhooPal analytics'
  }, [])

  useEffect(() => {
    if (!token) return
    let live = true
    setLoading(true)
    setError(null)
    fetchAdminStats(token, Number(days))
      .then((s) => live && setStats(s))
      .catch((err: unknown) => {
        if (!live) return
        const e = err instanceof AdminError ? err : new AdminError('server')
        setError(e)
        if (e.code === 'unauthorized') {
          forgetToken()
          setToken(null)
          setStats(null)
        }
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token, days, attempt])

  const forget = () => {
    forgetToken()
    setToken(null)
    setStats(null)
  }

  if (!token)
    return (
      <TokenScreen
        error={error}
        onSubmit={(t) => {
          saveToken(t)
          setError(null)
          setToken(t)
        }}
      />
    )

  return (
    <div className="mx-auto min-h-dvh max-w-4xl bg-soil-50">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
        <img src="/logo.svg" alt="" className="size-8 rounded-lg" />
        <h1 className="flex-1 truncate text-lg font-bold">BhooPal analytics</h1>
        <button onClick={() => setAttempt((n) => n + 1)} disabled={loading} className={smallButton}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Refresh
        </button>
        <button onClick={forget} className={smallButton} title="Forget the token on this browser">
          <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Forget token</span>
        </button>
      </header>
      <main className="flex flex-col gap-4 p-4 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full max-w-xs">
            <Segmented value={days} options={DAY_OPTIONS} onChange={setDays} />
          </div>
          {stats && (
            <p className="text-sm text-stone-600">
              Updated {dateTimeIst(stats.generated)} IST · India dates · version {stats.version?.slice(0, 8) ?? '?'}
            </p>
          )}
        </div>
        {error && (
          <Notice tone="danger" alert>
            {errorText(error)}
          </Notice>
        )}
        {!stats && loading && <Spinner label="Loading…" />}
        {/* While a new window loads the old numbers stay, dimmed, so nothing jumps. */}
        {stats && (
          <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <Dashboard stats={stats} token={token} refresh={attempt} />
          </div>
        )}
      </main>
    </div>
  )
}

function TokenScreen({ error, onSubmit }: { error: AdminError | null; onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('')
  const ready = value.trim().length >= 20
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <div className="flex items-center gap-3">
        <img src="/logo.svg" alt="" className="size-12 rounded-xl" />
        <h1 className="text-xl font-bold">BhooPal analytics</h1>
      </div>
      <p className="text-stone-700">The owner's page. Paste the admin token (the Worker's ADMIN_TOKEN secret); this browser will remember it.</p>
      {error && (
        <Notice tone="danger" alert>
          {errorText(error)}
        </Notice>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) onSubmit(value.trim())
        }}
        className="flex flex-col gap-3"
      >
        <input
          type="password"
          autoComplete="off"
          className={inputClass}
          placeholder="Admin token"
          aria-label="Admin token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" disabled={!ready} className={primaryButton}>
          <KeyRound className="size-5" aria-hidden /> Open
        </button>
      </form>
    </div>
  )
}

// ---- the dashboard -------------------------------------------------------------------------------------------

function Dashboard({ stats, token, refresh }: { stats: AdminStats; token: string; refresh: number }) {
  const { totals, daily, users, push, ai, days } = stats
  const sum = (key: Exclude<keyof AdminDay, 'day'>) => daily.reduce((s, d) => s + d[key], 0)
  const labels = daily.map((d) => d.day)
  const inWindow = `last ${days} days`
  return (
    <>
      <section aria-label="Accounts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accounts" value={totals.users} note={`+${plain.format(totals.new7)} in 7 days · +${plain.format(totals.new30)} in 30 days`} />
        <Stat label="Active today" value={totals.activeToday} note="opened, logged in, asked or checked a photo" />
        <Stat label="Active in 7 days" value={totals.active7} note={`${pct(totals.active7, totals.users)} of accounts`} />
        <Stat label="Active in 30 days" value={totals.active30} note={`${pct(totals.active30, totals.users)} of accounts`} />
        <Stat label={`Questions, ${inWindow}`} value={sum('chats')} note="sent to Ask" />
        <Stat label={`Photo checks, ${inWindow}`} value={sum('photos')} />
        <Stat label="Logged-in phones" value={totals.sessions} note="sessions not yet expired" />
        <Stat label="Morning message on" value={totals.pushSubs} note="push subscriptions" />
      </section>

      <ChartCard title="Active accounts per day" sub="Accounts that opened the app, logged in, asked a question or checked a photo">
        <Columns days={labels} series={[{ name: 'Active accounts', color: GREEN, values: daily.map((d) => d.active) }]} />
      </ChartCard>
      <ChartCard title="New accounts per day">
        <Columns days={labels} series={[{ name: 'Sign-ups', color: GREEN, values: daily.map((d) => d.signups) }]} />
      </ChartCard>
      <ChartCard title="Questions and photo checks per day">
        <Columns
          days={labels}
          series={[
            { name: 'Questions', color: BLUE, values: daily.map((d) => d.chats) },
            { name: 'Photo checks', color: ORANGE, values: daily.map((d) => d.photos) },
          ]}
        />
      </ChartCard>

      <UsersTable users={users} total={totals.users} days={days} />
      <AiSection ai={ai} days={labels} />
      <AnswersSection token={token} refresh={refresh} />

      <Card>
        <h2 className="mb-2 font-bold">Morning message</h2>
        {totals.pushSubs === 0 ? (
          <p className="text-sm text-stone-600">No phone has alerts on yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <SimpleTable head={['State', 'Phones']} rows={push.byState.map((r) => [r.state || 'GPS only', r.n])} />
            <SimpleTable head={['Language', 'Phones']} rows={push.byLang.map((r) => [isLang(r.lang) ? LANG_INFO[r.lang].english : r.lang, r.n])} />
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">Day by day</h2>
        <p className="mb-2 text-sm text-stone-600">Every number behind the charts, newest first.</p>
        <SimpleTable
          head={['Day', 'Sign-ups', 'Active', 'Opens', 'Log-ins', 'Questions', 'Photos', ...(ai?.daily.length ? ['AI answered', 'Not answered'] : [])]}
          rows={[...daily].reverse().map((d) => {
            const a = ai?.daily.find((x) => x.day === d.day)
            return [
              shortDate(d.day),
              d.signups,
              d.active,
              d.opens,
              d.logins,
              d.chats,
              d.photos,
              ...(ai?.daily.length ? [a?.answered ?? 0, a?.failed ?? 0] : []),
            ]
          })}
        />
      </Card>
    </>
  )
}

function UsersTable({ users, total, days }: { users: AdminUser[]; total: number; days: number }) {
  const [query, setQuery] = useState('')
  const digits = query.replace(/\D/g, '')
  const shown = digits ? users.filter((u) => u.phone.includes(digits)) : users
  const now = Date.now()
  const cell = 'px-2 py-1.5 text-right tabular-nums'
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-bold">Accounts</h2>
        <input
          className={`${inputClass} max-w-44 py-2 text-sm`}
          inputMode="numeric"
          placeholder="Search number"
          aria-label="Search by number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="mb-2 text-sm text-stone-600">
        Most recently seen first{users.length < total ? `, the ${plain.format(users.length)} most recent of ${plain.format(total)}` : ''}. Counts are for the
        last {days} days.
      </p>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-500">{users.length ? 'No account matches.' : 'No accounts yet.'}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs font-semibold text-stone-600 uppercase">
                <th className="px-2 py-1.5">Number</th>
                <th className="px-2 py-1.5">Joined</th>
                <th className="px-2 py-1.5">Last seen</th>
                <th className={cell}>Opens</th>
                <th className={cell}>Log-ins</th>
                <th className={cell}>Questions</th>
                <th className={cell}>Photos</th>
                <th className={cell}>Active days</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.phone} className="border-t border-stone-100">
                  <td className="px-2 py-1.5 font-medium tabular-nums">{formatPhone(u.phone)}</td>
                  <td className="px-2 py-1.5 text-stone-700">{dateIst(u.created)}</td>
                  <td className="px-2 py-1.5 text-stone-700">{ago(u.lastSeen, now)}</td>
                  <td className={cell}>{plain.format(u.opens)}</td>
                  <td className={cell}>{plain.format(u.logins)}</td>
                  <td className={cell}>{plain.format(u.chats)}</td>
                  <td className={cell}>{plain.format(u.photos)}</td>
                  <td className={cell}>{plain.format(u.activeDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function AiSection({ ai, days }: { ai?: AdminAiStats; days: string[] }) {
  if (!ai)
    return (
      <Card>
        <h2 className="mb-1 font-bold">AI answers</h2>
        <p className="text-sm text-stone-600">
          Not set up yet. Create a Cloudflare API token with <i>Account Analytics: Read</i> and save it as the Worker's CF_ANALYTICS_TOKEN secret (see the
          README). The numbers above don't need it.
        </p>
      </Card>
    )
  if (ai.error)
    return (
      <Card>
        <h2 className="mb-2 font-bold">AI answers</h2>
        <Notice tone="danger" alert>
          Analytics Engine did not answer: {ai.error}
        </Notice>
      </Card>
    )
  const byDay = new Map(ai.daily.map((d) => [d.day, d]))
  const row = (key: 'chats' | 'photos' | 'answered' | 'failed' | 'up' | 'down') => days.map((day) => byDay.get(day)?.[key] ?? 0)
  const total = (key: Parameters<typeof row>[0]) => row(key).reduce((s, n) => s + n, 0)
  const asked = total('chats') + total('photos')
  const kind = (k: string) => (k === 'chat' ? 'Question' : k === 'photo' ? 'Photo check' : 'Feedback')
  return (
    <>
      <section aria-label="AI" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="AI questions" value={total('chats')} note="answers recorded by the Worker" />
        <Stat label="Answered" value={total('answered')} note={`${pct(total('answered'), asked)} of questions and photo checks`} />
        <Stat label="Not answered" value={total('failed')} note="blocked, daily limit, AI busy, cut off" />
        <Stat label="Thumbs up / down" value={`${plain.format(total('up'))} / ${plain.format(total('down'))}`} />
      </section>
      <ChartCard title="Answers per day" sub="Questions and photo checks: answered (by the AI, the cache, a template or the backup AI) or not">
        <Columns
          days={days}
          series={[
            { name: 'Answered', color: BLUE, values: row('answered') },
            { name: 'Not answered', color: RED, values: row('failed') },
          ]}
        />
      </ChartCard>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">Outcomes</h2>
          <SimpleTable head={['Kind', 'Outcome', 'Count']} rows={ai.outcomes.map((o) => [kind(o.kind), o.outcome, o.n])} />
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">Models</h2>
          <SimpleTable
            head={['Model', 'Outcome', 'Count', 'Avg time']}
            rows={ai.models.map((m) => [m.model || '–', m.outcome, m.n, m.ms ? `${(m.ms / 1000).toFixed(1)} s` : '–'])}
          />
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">Languages</h2>
          <SimpleTable
            head={['Kind', 'Language', 'Count']}
            rows={ai.langs.map((l) => [kind(l.kind), isLang(l.lang) ? LANG_INFO[l.lang].english : l.lang || '–', l.n])}
          />
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">States</h2>
          <SimpleTable head={['Kind', 'State', 'Count']} rows={ai.states.map((s) => [kind(s.kind), s.state || '–', s.n])} />
        </Card>
      </div>
    </>
  )
}

// ---- recent answers --------------------------------------------------------------------------------------------

type KindFilter = 'all' | 'chat' | 'photo'
type VoteFilter = 'all' | 'down' | 'up'
const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'chat', label: 'Questions' },
  { value: 'photo', label: 'Photo checks' },
]
const VOTE_OPTIONS: { value: VoteFilter; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'down', label: 'Thumbs down' },
  { value: 'up', label: 'Thumbs up' },
]
const ANSWERS_PAGE = 50
/** Chat and photo outcomes that gave the farmer an answer (the same set as the Worker's). */
const ANSWERED = new Set(['answered', 'template', 'cached', 'resting_template', 'backup'])
const langName = (lang: string) => (isLang(lang) ? LANG_INFO[lang].english : lang)

/** The questions and answers the Worker keeps for 7 days, with the account that asked, newest first, with filters and a search. */
function AnswersSection({ token, refresh }: { token: string; refresh: number }) {
  const [kind, setKind] = useState<KindFilter>('all')
  const [vote, setVote] = useState<VoteFilter>('all')
  const [lang, setLang] = useState<Lang | ''>('')
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminAnswer[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<AdminError | null>(null)
  const filter = {
    kind: kind === 'all' ? undefined : kind,
    vote: vote === 'all' ? undefined : vote,
    lang: lang || undefined,
    q: q || undefined,
    limit: ANSWERS_PAGE,
  }

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    fetchAdminAnswers(token, {
      kind: kind === 'all' ? undefined : kind,
      vote: vote === 'all' ? undefined : vote,
      lang: lang || undefined,
      q: q || undefined,
      limit: ANSWERS_PAGE,
    })
      .then((a) => {
        if (!live) return
        setRows(a.rows)
        setMore(a.more)
      })
      .catch((err: unknown) => live && setError(err instanceof AdminError ? err : new AdminError('server')))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token, kind, vote, lang, q, refresh])

  const loadMore = async () => {
    const last = rows.at(-1)
    if (!last || loadingMore) return
    setLoadingMore(true)
    try {
      const a = await fetchAdminAnswers(token, { ...filter, before: last.created })
      setRows((prev) => [...prev, ...a.rows])
      setMore(a.more)
    } catch (err) {
      setError(err instanceof AdminError ? err : new AdminError('server'))
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = kind !== 'all' || vote !== 'all' || lang || q
  return (
    <Card>
      <h2 className="mb-1 font-bold">Recent answers</h2>
      <p className="mb-3 text-sm text-stone-600">
        Every question and photo check of the last 7 days with what the AI said and who asked, newest first. For a photo check, the farmer's note and the
        result, never the photo. A thumb appears when the farmer taps one.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full max-w-xs sm:w-auto">
          <Segmented value={kind} options={KIND_OPTIONS} onChange={setKind} />
        </div>
        <div className="w-full max-w-xs sm:w-auto">
          <Segmented value={vote} options={VOTE_OPTIONS} onChange={setVote} />
        </div>
        <select className={`${inputClass} w-auto py-2 text-sm`} value={lang} onChange={(e) => setLang(e.target.value as Lang | '')} aria-label="Language">
          <option value="">All languages</option>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_INFO[l].english}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setQ(typed.trim())
          }}
          className="flex gap-2"
        >
          <input
            className={`${inputClass} max-w-56 py-2 text-sm`}
            placeholder="A word, or a phone number"
            aria-label="Search the questions, answers and phone numbers"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button type="submit" className={smallButton}>
            <Search className="size-4" aria-hidden /> Search
          </button>
        </form>
      </div>
      {error && (
        <Notice tone="danger" alert>
          {error.code === 'server' ? 'The server could not read the answers. Are migrations 0005 and 0006 applied to this database?' : errorText(error)}
        </Notice>
      )}
      {loading && !rows.length ? (
        <Spinner label="Loading…" />
      ) : rows.length === 0 ? (
        !error && <p className="py-4 text-center text-sm text-stone-500">{filtered ? 'Nothing matches.' : 'No questions in the last 7 days.'}</p>
      ) : (
        <ul className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {rows.map((r) => (
            <AnswerRow key={r.id} row={r} />
          ))}
        </ul>
      )}
      {more && (
        <div className="mt-3 flex justify-center">
          <button onClick={loadMore} disabled={loadingMore} className={smallButton}>
            {loadingMore ? 'Loading…' : 'Older answers'}
          </button>
        </div>
      )}
    </Card>
  )
}

function AnswerRow({ row: r }: { row: AdminAnswer }) {
  const [open, setOpen] = useState(false)
  const sep = <span aria-hidden>·</span>
  const long = r.answer.length > 400 || r.answer.split('\n').length > 6
  return (
    <li className="border-t border-stone-100 py-3 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-stone-500">
        <span className="font-medium text-stone-800 tabular-nums">{r.phone ? formatPhone(r.phone) : 'Account unknown'}</span>
        {sep}
        <span>{dateTimeIst(r.created)}</span>
        {sep}
        <span>{r.kind === 'photo' ? 'Photo check' : 'Question'}</span>
        {sep}
        <span>{langName(r.lang)}</span>
        {r.state && (
          <>
            {sep}
            <span>{[r.district, r.state].filter(Boolean).join(', ')}</span>
          </>
        )}
        {sep}
        <span>{r.model || '–'}</span>
        {sep}
        <span className={ANSWERED.has(r.outcome) ? '' : 'font-medium text-red-700'}>{r.outcome}</span>
        {r.ms !== null && (
          <>
            {sep}
            <span>{(r.ms / 1000).toFixed(1)} s</span>
          </>
        )}
        {r.vote && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${r.vote === 'up' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
          >
            {r.vote === 'up' ? <ThumbsUp className="size-3.5" aria-hidden /> : <ThumbsDown className="size-3.5" aria-hidden />}
            {r.vote === 'up' ? 'Thumbs up' : 'Thumbs down'}
          </span>
        )}
      </p>
      <p className="mt-1 font-medium break-words whitespace-pre-wrap">{r.question}</p>
      {r.answer ? (
        <>
          <p className={`mt-1 text-sm break-words whitespace-pre-wrap text-stone-800 ${long && !open ? 'line-clamp-4' : ''}`}>{r.answer}</p>
          {long && (
            <button onClick={() => setOpen((o) => !o)} className="mt-1 text-sm font-medium text-green-700">
              {open ? 'Show less' : 'Show the whole answer'}
            </button>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-stone-500 italic">No answer was sent.</p>
      )}
    </li>
  )
}

// ---- pieces ---------------------------------------------------------------------------------------------------

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <p className="text-sm text-stone-600">{label}</p>
      <p className="text-2xl font-semibold text-stone-900">{typeof value === 'number' ? compact(value) : value}</p>
      {note && <p className="mt-0.5 text-xs text-stone-500">{note}</p>}
    </div>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="font-bold">{title}</h2>
      {sub && <p className="mb-2 text-sm text-stone-600">{sub}</p>}
      <div className="mt-2">{children}</div>
    </Card>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="py-3 text-center text-sm text-stone-500">Nothing yet.</p>
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-xs font-semibold text-stone-600 uppercase">
            {head.map((h, i) => (
              <th key={h} className={`px-2 py-1.5 ${i && typeof rows[0][i] === 'number' ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-stone-100">
              {r.map((v, j) => (
                <td key={j} className={`px-2 py-1.5 ${typeof v === 'number' ? 'text-right tabular-nums' : j ? 'text-stone-700' : 'font-medium'}`}>
                  {typeof v === 'number' ? plain.format(v) : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The element's width in px, so the SVG chart is drawn pixel-exact (600 until measured). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 600)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Clean axis steps (1, 2, 5 × 10ⁿ; never below 1) from 0 to just above `max`. */
function niceTicks(max: number): number[] {
  const rough = Math.max(max, 1) / 3
  const power = 10 ** Math.max(0, Math.floor(Math.log10(rough)))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10
  const ticks: number[] = []
  for (let t = 0; t < max + step; t += step) ticks.push(t)
  return ticks
}

/** A column with rounded top corners and a square base. */
function columnPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2)
  if (rr <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

interface Series {
  name: string
  color: string
  values: number[]
}

/** Columns per day, stacked when there are two series: thin marks, 4px rounded tops, a 2px gap between segments. */
function Columns({ days, series, height = 170 }: { days: string[]; series: Series[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.max(days.length, 1)
  const pad = { top: 10, right: 8, bottom: 24, left: 36 }
  const plotW = Math.max(width - pad.left - pad.right, 10)
  const plotH = height - pad.top - pad.bottom
  const totals = days.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0))
  const ticks = niceTicks(Math.max(0, ...totals))
  const top = ticks[ticks.length - 1] || 1
  const slot = plotW / n
  const bar = Math.min(24, Math.max(1, slot - 2))
  const radius = Math.min(4, bar / 2)
  const y = (v: number) => pad.top + plotH * (1 - v / top)
  const x = (i: number) => pad.left + i * slot + (slot - bar) / 2
  const labelEvery = days.length <= 10 ? 1 : Math.ceil(days.length / 6)
  const nothing = totals.every((t) => t === 0)
  const muted = '#78716c'
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`${series.map((s) => s.name).join(' and ')} per day`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#d6d3d1' : '#e7e5e4'} />
            <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill={muted} className="tabular-nums">
              {compact(t)}
            </text>
          </g>
        ))}
        {days.map((day, i) => {
          let acc = 0
          return (
            <g key={day}>
              {series.map((s, k) => {
                const v = s.values[i] ?? 0
                if (v <= 0) return null
                const base = y(acc)
                acc += v
                const topY = y(acc)
                // A 2px gap in the surface colour separates stacked segments; only the top segment is rounded.
                const h = Math.max(base - topY - (k > 0 ? 2 : 0), 0.5)
                return <path key={s.name} d={columnPath(x(i), topY, bar, h, acc >= totals[i] ? radius : 0)} fill={s.color} />
              })}
            </g>
          )
        })}
        {days.map(
          (day, i) =>
            i % labelEvery === 0 && (
              <text key={day} x={pad.left + i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={muted}>
                {shortDate(day)}
              </text>
            ),
        )}
        {days.map((day, i) => (
          <rect
            key={day}
            x={pad.left + i * slot}
            y={pad.top}
            width={slot}
            height={plotH}
            fill={hover === i ? 'rgba(28, 25, 23, 0.06)' : 'transparent'}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {nothing && <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-stone-500">Nothing yet</p>}
      {hover !== null && days[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
          style={{ left: Math.min(Math.max(pad.left + hover * slot + slot / 2, 70), width - 70) }}
        >
          <p className="font-semibold">{shortDate(days[hover])}</p>
          {series.map((s) => (
            <p key={s.name}>
              {s.name}: {plain.format(s.values[hover] ?? 0)}
            </p>
          ))}
          {series.length > 1 && <p className="text-stone-300">Total: {plain.format(totals[hover])}</p>}
        </div>
      )}
      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
