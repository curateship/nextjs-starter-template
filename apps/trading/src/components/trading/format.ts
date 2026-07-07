/** Compact USD for volumes / open interest, e.g. `$2.10B`, `$558K`, `—`. */
export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—"
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

export function formatPriceDisplay(value: string | number): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return "—"
  if (num >= 1000) {
    return num.toLocaleString("en-US", { maximumFractionDigits: 1 })
  }
  if (num >= 1) return num.toLocaleString("en-US", { maximumFractionDigits: 4 })
  return num.toLocaleString("en-US", { maximumFractionDigits: 6 })
}
