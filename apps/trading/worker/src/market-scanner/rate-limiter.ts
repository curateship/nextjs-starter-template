export class MarketScannerRateLimiter {
  private tokens: number
  private lastRefill = Date.now()
  private readonly capacity: number
  private readonly refillPerMs: number

  constructor(weightPerMinute = 400) {
    this.capacity = weightPerMinute
    this.tokens = weightPerMinute
    this.refillPerMs = weightPerMinute / 60_000
  }

  async take(weight = 1): Promise<void> {
    for (;;) {
      this.refill()
      if (this.tokens >= weight) {
        this.tokens -= weight
        return
      }
      const waitMs = Math.ceil((weight - this.tokens) / this.refillPerMs)
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5_000)))
    }
  }

  private refill() {
    const timestamp = Date.now()
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (timestamp - this.lastRefill) * this.refillPerMs
    )
    this.lastRefill = timestamp
  }
}
