import * as React from "react"
import {
  CloudDrizzleIcon,
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSunIcon,
  SnowflakeIcon,
  SunIcon,
  type LucideIcon,
} from "lucide-react"

import { loadWeather } from "@/lib/api/travel/weather"
import { WEATHER_LABEL, type DayWeather, type WeatherKind } from "@/lib/travel/weather"

const ICON: Record<WeatherKind, LucideIcon> = {
  clear: SunIcon,
  "partly-cloudy": CloudSunIcon,
  cloudy: CloudIcon,
  fog: CloudFogIcon,
  drizzle: CloudDrizzleIcon,
  rain: CloudRainIcon,
  snow: SnowflakeIcon,
  storm: CloudLightningIcon,
}

/**
 * The forecast for each of a trip's days in the next 14 days (task part 33),
 * loaded once the page is up so the board never waits for it. It loads again
 * when the dates or the destination change. Nothing shows while it loads or when
 * the weather service doesn't answer.
 */
export function useTripWeather(trip: { id: string; startDate: string | null; destination: string | null }) {
  const [weather, setWeather] = React.useState<{ key: string; days: DayWeather[] }>({ key: "", days: [] })
  const key = JSON.stringify([trip.id, trip.startDate, trip.destination])
  React.useEffect(() => {
    if (!trip.startDate) return
    let alive = true
    loadWeather(trip.id)
      .then((days) => {
        if (alive) setWeather({ key, days })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [key, trip.id, trip.startDate])
  return weather.key === key ? weather.days : []
}

/** "☀ 18° / 9°" under a day's heading. */
export function DayWeatherLine({ weather }: { weather: DayWeather }) {
  const Icon = ICON[weather.kind]
  return (
    <span
      className="flex items-center gap-1 px-1 text-xs text-muted-foreground"
      aria-label={`${WEATHER_LABEL[weather.kind]}, high ${weather.high}°, low ${weather.low}°`}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="tabular-nums">
        {weather.high}° / {weather.low}°
      </span>
    </span>
  )
}
