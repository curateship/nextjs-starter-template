import * as React from "react"

import { useHiddenPnlClass } from "@/lib/trade/hide-pnl"
import { cn } from "@/lib/utils"

/**
 * A figure that says what was made or lost, behind frosted glass when the
 * header's Hide profit and loss switch is on.
 *
 * Every such figure in this app goes through here, so there is one answer to
 * "is this hidden" rather than thirty. What it wraps is money you made or
 * lost: open profit, banked profit, a day's result, a backtest's result. A
 * balance or an order size is not one of these — hiding those would stop
 * somebody trading, which is not what the switch is for.
 */
export function PnlAmount({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span className={cn(className, useHiddenPnlClass())} {...props}>
      {children}
    </span>
  )
}
