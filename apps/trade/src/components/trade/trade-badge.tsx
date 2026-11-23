import type { ReactNode } from "react"

import {
  ALARM_SURFACE,
  LOST_MONEY_SURFACE,
  MADE_MONEY_SURFACE,
} from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

/**
 * The small word beside a market: Long, Testnet, Practice, how a trade
 * ended.
 *
 * One component rather than the same four classes pasted into every table,
 * which is how the bottom panel and the market header ended up disagreeing
 * about how small "small" is. The shape is fixed here; a call site picks a
 * tone and nothing else.
 */

/** Every colour a badge is allowed to be, and what each one means. */
export type TradeBadgeTone =
  /** Says what a row is without judging it: Practice, Reduce only. */
  | "neutral"
  /** This went the way you wanted: Long, a trade that made money. */
  | "made"
  /** This went the other way: Short, a trade that lost money. */
  | "lost"
  /** The practice network — pretend money on a real exchange. */
  | "testnet"
  /** Something happened TO the account: a liquidation. */
  | "alarm"

const TONES: Record<TradeBadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  made: MADE_MONEY_SURFACE,
  lost: LOST_MONEY_SURFACE,
  testnet: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  alarm: ALARM_SURFACE,
}

export function TradeBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: TradeBadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
