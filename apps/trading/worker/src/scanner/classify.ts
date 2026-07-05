// Pure wallet classification: auto labels + 0-100 quality score.

export type ClassifyInput = {
  pnl7d: number | null
  pnl30d: number | null
  winRate: number | null
  fillCount30d: number
  accountValue: number | null
  avgHoldMinutes: number | null
  takerRatio: number | null
  /** Highest leverage across current open positions. */
  maxOpenLeverage: number | null
  /** When the wallet first appeared in the whale feed (ms). */
  firstSeenAt: number | null
  /** Oldest fill inside the 30d fills window (ms). */
  oldestFillAt: number | null
  now: number
}

export type ClassifyResult = {
  labels: string[]
  qualityScore: number
}

const DAY_MS = 86_400_000

export const LABEL_MARKET_MAKER = "Market maker"

export function classifyWallet(input: ClassifyInput): ClassifyResult {
  const labels: string[] = []

  if (
    input.winRate !== null &&
    input.winRate >= 0.55 &&
    (input.pnl30d ?? 0) > 0 &&
    input.fillCount30d >= 20
  ) {
    labels.push("Consistent winner")
  }
  if (input.maxOpenLeverage !== null && input.maxOpenLeverage >= 10) {
    labels.push("High leverage")
  }
  if (
    input.fillCount30d >= 1500 &&
    input.takerRatio !== null &&
    input.takerRatio < 0.2
  ) {
    labels.push(LABEL_MARKET_MAKER)
  }
  if (
    input.avgHoldMinutes !== null &&
    input.avgHoldMinutes < 30 &&
    input.fillCount30d >= 50
  ) {
    labels.push("Scalper")
  }
  if (input.avgHoldMinutes !== null && input.avgHoldMinutes > 24 * 60) {
    labels.push("Swing trader")
  }
  if (
    input.firstSeenAt !== null &&
    input.now - input.firstSeenAt < 7 * DAY_MS
  ) {
    labels.push("New whale")
  }
  if (
    input.firstSeenAt !== null &&
    input.oldestFillAt !== null &&
    input.now - input.firstSeenAt > 30 * DAY_MS &&
    input.now - input.oldestFillAt < 7 * DAY_MS
  ) {
    labels.push("Dormant reactivated")
  }

  return { labels, qualityScore: qualityScore(input) }
}

/**
 * 0-100 composite: win rate (30) + 30d PnL size (20) + 7d/30d agreement (10)
 * + both-positive consistency (10) + activity (15) + account size (15).
 */
export function qualityScore(input: ClassifyInput): number {
  let score = 0

  if (input.winRate !== null) {
    score += Math.min(30, input.winRate * 40)
  } else {
    score += 10
  }

  if (input.pnl30d !== null && input.pnl30d > 0) {
    score += Math.min(20, Math.log10(input.pnl30d + 1) * 4)
  }
  if (input.pnl7d !== null && input.pnl7d > 0) {
    score += 10
  }
  if (
    input.pnl7d !== null &&
    input.pnl30d !== null &&
    input.pnl7d > 0 &&
    input.pnl30d > 0
  ) {
    score += 10
  }

  score += Math.min(15, input.fillCount30d / 20)

  if (input.accountValue !== null && input.accountValue > 0) {
    score += Math.min(15, Math.log10(input.accountValue + 1) * 2.5)
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}
