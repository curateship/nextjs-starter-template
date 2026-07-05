export function formatPriceDisplay(value: string | number): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return "—"
  if (num >= 1000) {
    return num.toLocaleString("en-US", { maximumFractionDigits: 1 })
  }
  if (num >= 1) return num.toLocaleString("en-US", { maximumFractionDigits: 4 })
  return num.toLocaleString("en-US", { maximumFractionDigits: 6 })
}
