/** Open-Meteo's weather codes, in the few kinds a day's heading shows (copied from Project's Daily card). */
export const WEATHER_KINDS = ["clear", "partly-cloudy", "cloudy", "fog", "drizzle", "rain", "snow", "storm"] as const
export type WeatherKind = (typeof WEATHER_KINDS)[number]

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "Clear",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  storm: "Storms",
}

export function weatherKindOf(code: number): WeatherKind {
  if (code === 0) return "clear"
  if (code <= 2) return "partly-cloudy"
  if (code === 3) return "cloudy"
  if (code === 45 || code === 48) return "fog"
  if (code >= 51 && code <= 57) return "drizzle"
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  return "storm"
}

/** One day's forecast: Celsius, rounded. */
export type DayWeather = { day: number; high: number; low: number; kind: WeatherKind }

/** How far ahead a forecast is shown (task part 33: "inside the next 14 days"). */
export const FORECAST_DAYS = 14
