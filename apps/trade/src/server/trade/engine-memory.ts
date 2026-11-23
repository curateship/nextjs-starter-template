/**
 * Transient engine memory must have an expiry or a capacity, never both by
 * accident. Account promises expire by age in engine-exchange-reads.ts.
 * Disposable pacing timestamps use this cap, like remembered fill triggers.
 * A clear can allow one early check; it never removes an order or a position.
 */
export const MAX_ENGINE_TIMESTAMPS = 5_000

export function rememberEngineTimestamp(
  timestamps: Map<string, number>,
  key: string,
  now: number
): void {
  if (!timestamps.has(key) && timestamps.size >= MAX_ENGINE_TIMESTAMPS)
    timestamps.clear()
  timestamps.set(key, now)
}
