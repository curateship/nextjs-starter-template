type Bucket = {
  count: number
  resetAt: number
}

export class MemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private checksSincePrune = 0

  constructor(
    private readonly maxBuckets = 10_000,
    private readonly pruneInterval = 100,
  ) {}

  isLimited(key: string, limit: number, windowMs: number, now = Date.now()) {
    this.checksSincePrune += 1
    if (this.checksSincePrune >= this.pruneInterval || this.buckets.size >= this.maxBuckets) {
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

  get size() {
    return this.buckets.size
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }

    while (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.buckets.delete(oldestKey)
    }
  }
}
