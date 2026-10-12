// One structured record per answer, photo check and thumbs up/down: to Workers Analytics Engine (free,
// 100k points/day, queried with SQL) and to Workers Logs as JSON. Never the farmer's text or location
// beyond the state.

export interface MetricEvent {
  kind: 'chat' | 'photo' | 'feedback'
  /** answered, template, cached, blocked, busy, daily_limit, upstream, aborted, up, down… */
  outcome: string
  /** Hash of the question, to match feedback and bug reports within the log retention. */
  id?: string
  model?: string
  finish?: string
  lang?: string
  state?: string
  /** Tools used, e.g. "get_mandi_prices,get_weather_forecast". */
  tools?: string
  detail?: string
  calls?: number
  toolRounds?: number
  ms?: number
}

export function record(env: Env, event: MetricEvent) {
  const version = env.CF_VERSION_METADATA?.id ?? ''
  try {
    env.STATS?.writeDataPoint({
      indexes: [event.kind],
      blobs: [
        event.outcome,
        event.model ?? '',
        event.finish ?? '',
        event.lang ?? '',
        event.state ?? '',
        event.tools ?? '',
        event.detail ?? '',
        event.id ?? '',
        version,
      ],
      doubles: [event.calls ?? 0, event.toolRounds ?? 0, event.ms ?? 0],
    })
  } catch (err) {
    console.warn(`metrics: ${err instanceof Error ? err.message : String(err)}`)
  }
  console.log({ event: event.kind, ...event, version })
}
