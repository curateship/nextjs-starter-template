/**
 * How many proxy/filmstrip builds may run at once, from
 * `VIDEO_PROXY_CONCURRENCY`. ffmpeg saturates cores quickly, so the ceiling is
 * low and anything unparseable falls back to one at a time.
 */
const MAX_PROXY_CONCURRENCY = 4

export function resolveProxyConcurrency(value: string | undefined) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return Math.min(parsed, MAX_PROXY_CONCURRENCY)
}
