export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function formatNotional(value: string | number): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return "—"
  const sign = num < 0 ? "-" : ""
  const abs = Math.abs(num)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${Math.round(abs)}`
}
