import { enforceRateLimit } from "@/server/auth/rate-limit"

export const LIVE_ORDER_RATE_LIMITS = {
  order: { maxAttempts: 20, windowSeconds: 10 },
  cancel: { maxAttempts: 100, windowSeconds: 10 },
} as const

type RateLimitCheck = typeof enforceRateLimit

/**
 * Runs one signed-in browser action inside the user's order budget.
 *
 * Orders and cancels have separate buckets so a stuck placement loop cannot
 * spend the room needed to get existing orders off an exchange. A broken
 * limiter store also cannot strand a cancel. The order lane stays closed when
 * its safety check cannot run.
 */
export async function runLiveOrderAction<T>(
  userId: string,
  direction: keyof typeof LIVE_ORDER_RATE_LIMITS,
  action: () => Promise<T>,
  check: RateLimitCheck = enforceRateLimit
): Promise<T> {
  try {
    await check(
      `trade-order:${direction}:${userId}`,
      LIVE_ORDER_RATE_LIMITS[direction]
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("RATE_LIMITED")) {
      throw new Error("TRADE_ORDER_RATE_LIMITED")
    }
    if (direction !== "cancel") throw error
    console.error("trade cancel rate-limit check failed", error)
  }

  return await action()
}
