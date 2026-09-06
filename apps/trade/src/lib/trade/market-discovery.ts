import type { MarketWindow } from "./market-history"

export function marketPace(volume24h: number, minute: MarketWindow | null) {
  if (!minute || !Number.isFinite(volume24h) || volume24h <= 0) return null
  const pace = minute.traded / (volume24h / 1440)
  return Number.isFinite(pace) ? pace : null
}

export function isSurging(volume24h: number, minute: MarketWindow | null) {
  return (
    (marketPace(volume24h, minute) ?? 0) >= 5 && (minute?.traded ?? 0) >= 10_000
  )
}

export function fundingPerDay(hourly: number | null, side: "long" | "short") {
  if (hourly === null || !Number.isFinite(hourly)) return null
  const dollars = hourly * 24 * 1000 * (side === "long" ? -1 : 1)
  return Number.isFinite(dollars) ? dollars : null
}
