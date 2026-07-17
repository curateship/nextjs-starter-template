// Process-local fixed-window rate limiter. Best-effort (not shared across
// instances) — good enough to blunt abuse of the public ingest endpoint.
// Ported from Hub's MemoryRateLimiter.

type Bucket = { count: number; resetAt: number }

class MemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private checksSincePrune = 0
  private readonly maxBuckets = 10_000
  private readonly pruneInterval = 100

  isLimited(key: string, limit: number, windowMs: number, now = Date.now()) {
    this.checksSincePrune += 1
    if (
      this.checksSincePrune >= this.pruneInterval ||
      this.buckets.size >= this.maxBuckets
    ) {
      this.prune(now)
      this.checksSincePrune = 0
    }

    const current = this.buckets.get(key)
    if (!current || current.resetAt <= now) {
      if (current) this.buckets.delete(key)
      this.buckets.set(key, { count: 1, resetAt: now + windowMs })
      return false
    }

    if (current.count >= limit) return true
    current.count += 1
    return false
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
    while (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value
      if (typeof oldestKey !== "string") break
      this.buckets.delete(oldestKey)
    }
  }
}

const limiter = new MemoryRateLimiter()

export function isRateLimited(key: string, limit: number, windowMs: number) {
  return limiter.isLimited(key, limit, windowMs)
}

// Reads the client IP from a trusted proxy header, falling back to common CDN
// headers. Takes the last comma-separated value (closest hop we trust).
export function getClientIp(headers: Headers) {
  const trusted = process.env.CUSTOM_SHELL_TRUSTED_IP_HEADER?.toLowerCase()
  const candidates = trusted
    ? [trusted]
    : ["cf-connecting-ip", "true-client-ip", "x-forwarded-for"]

  for (const name of candidates) {
    const value = headers.get(name)
    if (!value) continue
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    const ip = parts[parts.length - 1]
    if (ip) return ip
  }

  return "unknown"
}
