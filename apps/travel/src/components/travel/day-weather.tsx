import * as React from "react"
import {
  CalendarHeartIcon,
  CloudDrizzleIcon,
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSunIcon,
  SnowflakeIcon,
  SunIcon,
  ThermometerSunIcon,
  type LucideIcon,
} from "lucide-react"

import { loadWeather } from "@/lib/api/travel/weather"
import {
  rainLine,
  typicalLine,
  WEATHER_LABEL,
  type DayHoliday,
  type DayWeather,
  type TripWeather,
  type TypicalDay,
  type WeatherKind,
} from "@/lib/travel/weather"

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

const NO_WEATHER: TripWeather = { forecast: [], typical: [], holidays: [] }

/**
 * The forecast for each of a trip's days in the next 14 days (task part 33),
 * what later days are usually like (More Travel features part 7) and the
 * public holidays (part 8), loaded once the page is up so the board never
 * waits for it. It loads again when the dates or the destination change.
 * Nothing shows while it loads or when the services don't answer.
 */
export function useTripWeather(trip: { id: string; startDate: string | null; destination: string | null }) {
  const [weather, setWeather] = React.useState<{ key: string; days: TripWeather }>({ key: "", days: NO_WEATHER })
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
  return weather.key === key ? weather.days : NO_WEATHER
}

/** "☀ 18° / 9°" under a day's heading, then "· 70% rain" when the chance is 30 out of 100 or more. */
export function DayWeatherLine({ weather }: { weather: DayWeather }) {
  const Icon = ICON[weather.kind]
  const rain = rainLine(weather)
  return (
    <span
      className="flex items-center gap-1 text-xs text-muted-foreground"
      aria-label={`${WEATHER_LABEL[weather.kind]}, high ${weather.high}°, low ${weather.low}°${rain ? `, ${rain}` : ""}`}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="tabular-nums">
        {weather.high}° / {weather.low}°{rain ? ` · ${rain}` : ""}
      </span>
    </span>
  )
}

/** "Usually 24° / 15° · rain on 8 of 30 days" under a far-off day's heading (More Travel features part 7). */
export function TypicalWeatherLine({ typical }: { typical: TypicalDay }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <ThermometerSunIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="tabular-nums">{typicalLine(typical)}</span>
    </span>
  )
}

/** The public holiday on a day, under its heading (More Travel features part 8), such as "Culture Day". */
export function HolidayLine({ holiday }: { holiday: DayHoliday }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <CalendarHeartIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        <span className="sr-only">Public holiday: </span>
        {holiday.name}
      </span>
    </span>
  )
}

/** A day heading's lines: the holiday, then the forecast or what the day is usually like. */
export function DayOutlook({ weather, day }: { weather: TripWeather; day: number }) {
  const forecast = weather.forecast.find((item) => item.day === day)
  const typical = forecast ? undefined : weather.typical.find((item) => item.day === day)
  const holiday = weather.holidays.find((item) => item.day === day)
  if (!forecast && !typical && !holiday) return null
  return (
    <>
      {holiday ? <HolidayLine holiday={holiday} /> : null}
      {forecast ? <DayWeatherLine weather={forecast} /> : typical ? <TypicalWeatherLine typical={typical} /> : null}
    </>
  )
}
