import { useState } from 'react'
import { findDistrict } from '../../shared/districts'
import { findState } from '../../shared/states'
import type { WeatherDay, WeatherHour, WeatherResponse } from '../../shared/types'
import { useSettings, useT } from '../settings'
import { api } from './api'
import { todayInIndia } from './format'
import { useOfflineData } from './hooks'

/** gps: the farmer's own fix. district: the centre of their district. state: the state capital, often far away. */
export type LocationSource = 'gps' | 'district' | 'state'

export interface FarmLocation {
  lat: number
  lon: number
  /** Place name to show; null for GPS ("My location"). */
  label: string | null
  source: LocationSource
}

/** Where to show weather for: the last GPS fix, else the centre of the farmer's district, else the state capital. */
export function useFarmLocation(): FarmLocation | null {
  const { settings } = useSettings()
  const { lang } = useT()
  if (settings.coords) return { lat: settings.coords.lat, lon: settings.coords.lon, label: null, source: 'gps' }
  const district = findDistrict(settings.state, settings.district)
  if (district) return { lat: district.lat, lon: district.lon, label: district.names?.[lang] ?? district.name, source: 'district' }
  const state = findState(settings.state)
  if (state) return { lat: state.lat, lon: state.lon, label: state.names[lang], source: 'state' }
  return null
}

export function useWeather() {
  const loc = useFarmLocation()
  const key = loc ? `wx:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}` : null
  const result = useOfflineData(key, () => api.weather(loc!.lat, loc!.lon))
  return { loc, ...result }
}

// ~1 km: plenty for farm weather, and the farmer's exact position never needs to leave the phone.
const round2 = (n: number) => Math.round(n * 100) / 100

/** One-tap "Use my location": saves a rounded, timestamped GPS fix in settings. */
export function useLocate() {
  const { update } = useSettings()
  const [locating, setLocating] = useState(false)
  const [failed, setFailed] = useState(false)
  const locate = (onFix?: (coords: { lat: number; lon: number }) => void) => {
    if (!navigator.geolocation) return setFailed(true)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude) }
        setLocating(false)
        setFailed(false)
        update({ coords: { ...coords, at: Date.now() } })
        onFix?.(coords)
      },
      () => {
        setLocating(false)
        setFailed(true)
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000 },
    )
  }
  return { locate, locating, failed }
}

/** Hourly forecast from the current hour on (saved forecasts can be hours old). */
export function upcomingHours(w: WeatherResponse) {
  const from = Date.now() - 3600_000
  const hours = w.hours.filter((h) => Date.parse(h.time) >= from)
  return hours.length ? hours : w.hours.slice(-1)
}

/** The hour now, or undefined when the saved forecast is too old to say (never show a stale hour as "now"). */
export function currentHour(w: WeatherResponse): WeatherHour | undefined {
  const from = Date.now() - 3600_000
  return w.hours.find((h) => Date.parse(h.time) >= from)
}

/** Today's forecast by date: a forecast saved yesterday starts with yesterday. */
export function todayForecast(w: WeatherResponse): WeatherDay | undefined {
  const today = todayInIndia()
  return w.days.find((d) => d.date === today)
}

/**
 * The day to sum up on Home: today, or tomorrow from 6 pm. By evening the forecast holds only today's last few
 * hours, so today's "min / max" would read 26° / 26°; tomorrow is what the farmer plans for anyway.
 */
export function headlineDay(w: WeatherResponse): { day: WeatherDay; tomorrow: boolean } | undefined {
  const evening = new Date(Date.now() + 5.5 * 3600_000).getUTCHours() >= 18
  const tomorrow = evening ? w.days.find((d) => d.date === todayInIndia(1)) : undefined
  const day = tomorrow ?? todayForecast(w)
  return day && { day, tomorrow: Boolean(tomorrow) }
}
