export function formatTokenCount(tokens: number) {
  if (tokens < 100_000) return tokens.toLocaleString()
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(tokens)
}

export function formatSharePercent(part: number, whole: number) {
  if (!whole) return "0%"
  return `${Math.round((part / whole) * 100)}%`
}
