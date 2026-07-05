// Pure crowded-trade scoring: coordinated smart-wallet positioning per
// coin+direction over a rolling window.

export type CrowdInput = {
  /** Distinct (non-ignored) taker wallets in this coin+direction. */
  walletCount: number
  /** Sum of their taker notional in USD. */
  totalNotional: number
  /** Average quality score of the wallets (0-100), null if unscored. */
  avgQuality: number | null
  /** Rolling window length. */
  windowMs: number
  /** Time between the first and last trade in the cluster. */
  spanMs: number
  /** This direction's share of the coin's total whale notional (0.5-1). */
  directionShare: number
}

/**
 * 0-100: wallet count (30) + notional (25) + wallet quality (20) +
 * time compression (10) + direction agreement (15).
 */
export function crowdScore(input: CrowdInput): number {
  let score = 0

  score += Math.min(30, input.walletCount * 6)

  if (input.totalNotional > 0) {
    // $100k → ~8, $1M → ~17, $10M → 25.
    score += Math.min(25, Math.max(0, (Math.log10(input.totalNotional) - 4) * 8.33))
  }

  score += ((input.avgQuality ?? 40) / 100) * 20

  if (input.windowMs > 0) {
    const compression = 1 - Math.min(1, input.spanMs / input.windowMs)
    score += compression * 10
  }

  score += Math.max(0, Math.min(1, (input.directionShare - 0.5) * 2)) * 15

  return Math.max(0, Math.min(100, Math.round(score)))
}
