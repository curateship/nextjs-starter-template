import { scrubSecrets } from "@/server/protocols/scrub"
import type { PausableSmartPlan } from "@/lib/trade/smart-order-pause"

export const DEFAULT_SMART_ORDER_REFUSAL_LIMIT = 5

const ASTER_ORDER_REFUSALS = [
  "ASTER_AUTH",
  "ASTER_ORDER_TOO_SMALL",
  "ASTER_PRICE_STEP",
  "ASTER_LEVERAGE_OPEN_POSITION",
  "ASTER_ISOLATED_MULTI_ASSET",
  "ASTER_ORDER_GONE",
  "ASTER_MARGIN_UNCHANGED",
  "ASTER_MARGIN_OPEN",
  "ASTER_MARGIN_REJECTED",
  "ASTER_MARGIN_BALANCE",
  "ASTER_POSITION_GONE",
  "ASTER_MARGIN_POSITIVE",
] as const

function isNamedAsterOrderRefusal(message: string): boolean {
  return ASTER_ORDER_REFUSALS.some(
    (code) => message === code || message.startsWith(`${code}:`)
  )
}

/** The saved streak limit, bounded so one bad setting cannot disable the safety. */
export function smartOrderRefusalLimit(
  configured = process.env.TRADE_SMART_ORDER_REFUSAL_LIMIT
): number {
  const parsed = Number.parseInt(configured ?? "", 10)
  return Number.isFinite(parsed)
    ? Math.min(20, Math.max(2, parsed))
    : DEFAULT_SMART_ORDER_REFUSAL_LIMIT
}

/**
 * Whether a failed send says something is wrong with this order or market.
 * Busy exchanges, timeouts and general service failures keep the current
 * streak unchanged because the exchange-wide safety already handles them.
 */
export function isSmartOrderRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.startsWith("EXCHANGE_BUSY") ||
    message.startsWith("LIVE_NO_ANSWER") ||
    message.startsWith("LIVE_EXCHANGE") ||
    message.startsWith("ASTER_CLOCK") ||
    message.startsWith("ASTER_IP_BANNED") ||
    /asking Trade to slow down|check .* status|could not handle the request/i.test(
      message
    )
  ) {
    return /post only order would have immediately matched/i.test(message)
  }
  return (
    message.startsWith("LIVE_ORDER_REFUSED") ||
    message.startsWith("LIVE_ORDER_SETTINGS") ||
    message.startsWith("LIVE_MARGIN_MODE") ||
    message.startsWith("LIVE_LEVERAGE") ||
    message.startsWith("LIVE_ORDER_TOO_SMALL") ||
    message.startsWith("LIVE_SIZE_TOO_SMALL") ||
    message.startsWith("LIVE_TAKE_PROFIT_SIDE") ||
    message.startsWith("LIVE_STOP_SIDE") ||
    message.startsWith("LIVE_WALLET_KEY") ||
    isNamedAsterOrderRefusal(message) ||
    /post only order would have immediately matched/i.test(message)
  )
}

/** The refusal text a person sees beside the paused strategy. */
export function smartOrderRefusalReason(error: unknown): string | null {
  if (!isSmartOrderRefusal(error)) return null
  const raw = scrubSecrets(
    error instanceof Error ? error.message : String(error)
  ).trim()
  const body = raw.replace(/^[A-Z][A-Z0-9_]+:/, "").trim()
  const known: Record<string, string> = {
    LIVE_SIZE_TOO_SMALL:
      "The order rounds below this market's smallest allowed size.",
    LIVE_TAKE_PROFIT_SIDE:
      "The take-profit price is on the wrong side of the order price.",
    LIVE_STOP_SIDE: "The stop price is on the wrong side of the order price.",
    LIVE_WALLET_KEY: "The exchange did not accept this wallet's trading key.",
  }
  return (known[raw] || body || "The exchange refused this order.").slice(
    0,
    500
  )
}

/** Records one order-specific refusal and says whether it caused the pause. */
export function recordSmartOrderRefusal(
  plan: PausableSmartPlan,
  reason: string,
  limit = smartOrderRefusalLimit()
): { pausedNow: boolean; streak: number } {
  if (plan.paused) {
    return { pausedNow: false, streak: plan.refusalStreak ?? limit }
  }
  const streak = (plan.refusalStreak ?? 0) + 1
  plan.refusalStreak = streak
  plan.pauseReason = reason
  const pausedNow = streak >= limit
  if (pausedNow) plan.paused = true
  return { pausedNow, streak }
}

/** A confirmed exchange acceptance breaks the run of refusals. */
export function recordSmartOrderSendSuccess(plan: PausableSmartPlan): void {
  if (plan.paused) return
  plan.paused = false
  plan.refusalStreak = 0
  plan.pauseReason = null
}

/** Carries only pause bookkeeping onto a plan restored after a failed pass. */
export function copySmartOrderPauseState(
  target: PausableSmartPlan,
  source: PausableSmartPlan
): void {
  target.paused = source.paused
  target.pauseReason = source.pauseReason
  target.refusalStreak = source.refusalStreak
}

export function resumeSmartOrderPlan(plan: PausableSmartPlan): void {
  plan.paused = false
  plan.pauseReason = null
  plan.refusalStreak = 0
}
