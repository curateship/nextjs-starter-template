/** Compact USD formatting for worker-generated alert/signal titles. */
export function formatUsd(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}k`
  return `$${Math.round(abs)}`
}
