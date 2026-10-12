import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudRainWind, CloudSun, Snowflake, Sun } from 'lucide-react'
import type { WeatherKind } from '../../shared/types'

const ICONS: Record<WeatherKind, { Icon: typeof Sun; color: string }> = {
  clear: { Icon: Sun, color: 'text-amber-500' },
  partly: { Icon: CloudSun, color: 'text-amber-500' },
  cloudy: { Icon: Cloud, color: 'text-stone-500' },
  fog: { Icon: CloudFog, color: 'text-stone-400' },
  lightrain: { Icon: CloudDrizzle, color: 'text-sky-500' },
  rain: { Icon: CloudRain, color: 'text-sky-600' },
  heavyrain: { Icon: CloudRainWind, color: 'text-blue-700' },
  thunder: { Icon: CloudLightning, color: 'text-violet-700' },
  snow: { Icon: Snowflake, color: 'text-sky-400' },
}

export function WeatherIcon({ kind, className = 'size-8' }: { kind: WeatherKind; className?: string }) {
  const { Icon, color } = ICONS[kind]
  return <Icon className={`${className} ${color}`} aria-hidden />
}
