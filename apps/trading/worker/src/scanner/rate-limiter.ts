/**
 * Token bucket for Hyperliquid REST info calls. HL allows ~1200 weight/min
 * per IP; the scanner budgets at most half of that so manual trading and
 * bots always have headroom.
 */
export class TokenBucket {
  private tokens: number
  private lastRefill = Date.now()
  private readonly capacity: number
  private readonly refillPerMs: number

  constructor(weightPerMinute = 600) {
    this.capacity = weightPerMinute
    this.tokens = weightPerMinute
    this.refillPerMs = weightPerMinute / 60_000
  }

  /** Waits until `weight` tokens are available, then consumes them. */
  async take(weight = 1): Promise<void> {
    for (;;) {
      this.refill()
      if (this.tokens >= weight) {
        this.tokens -= weight
        return
      }
      const deficit = weight - this.tokens
      const waitMs = Math.ceil(deficit / this.refillPerMs)
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5_000)))
    }
  }

  private refill() {
    const now = Date.now()
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (now - this.lastRefill) * this.refillPerMs
    )
    this.lastRefill = now
  }
}
