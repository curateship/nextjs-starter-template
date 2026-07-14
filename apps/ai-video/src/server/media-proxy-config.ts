const MAX_PROXY_CONCURRENCY = 4

export function resolveProxyConcurrency(value: string | undefined) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return Math.min(parsed, MAX_PROXY_CONCURRENCY)
}
