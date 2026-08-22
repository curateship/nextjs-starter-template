import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The small word beside a market: Long, Real, Testnet, Practice, how a trade
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
  /** Real money is involved. Amber everywhere, so it is never missed. */
  | "real"
  /** The practice network — pretend money on a real exchange. */
  | "testnet"
  /** Something happened TO the account: a liquidation. */
  | "alarm"

const TONES: Record<TradeBadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  made: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  lost: "bg-red-500/10 text-red-700 dark:text-red-400",
  real: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  testnet: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  alarm: "bg-red-500/20 text-red-700 dark:text-red-300",
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
