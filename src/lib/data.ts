import { findState } from '../../shared/states'
import type { WeatherResponse } from '../../shared/types'
import { useSettings, useT } from '../settings'
import { api } from './api'
import { useOfflineData } from './hooks'

/** Where to show weather for: the last GPS fix, else the capital of the farmer's state. */
export function useFarmLocation() {
  const { settings } = useSettings()
  const { lang } = useT()
  if (settings.coords) return { ...settings.coords, label: null, gps: true }
  const state = findState(settings.state)
  if (state) return { lat: state.lat, lon: state.lon, label: state.names[lang], gps: false }
  return null
}

export function useWeather() {
  const loc = useFarmLocation()
  const key = loc ? `wx:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}` : null
  const result = useOfflineData(key, () => api.weather(loc!.lat, loc!.lon))
  return { loc, ...result }
}

/** Hourly forecast from the current hour on (saved forecasts can be hours old). */
export function upcomingHours(w: WeatherResponse) {
  const from = Date.now() - 3600_000
  const hours = w.hours.filter((h) => Date.parse(h.time) >= from)
  return hours.length ? hours : w.hours.slice(-1)
}
