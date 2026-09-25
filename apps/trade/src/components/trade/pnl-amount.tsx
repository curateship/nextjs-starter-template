import * as React from "react"

import { useHiddenPnlClass } from "@/lib/trade/hide-pnl"
import { cn } from "@/lib/utils"

/**
 * True inside a public page. The Hide P&L switch is about somebody's own
 * screen, and a public profile's figures are published on purpose, so they
 * are never blurred there, even for a signed-in visitor with the switch on.
 */
const PublicFigures = React.createContext(false)

export function ShowPublicFigures({ children }: { children: React.ReactNode }) {
  return (
    <PublicFigures.Provider value={true}>{children}</PublicFigures.Provider>
  )
}

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
  const hiddenClass = useHiddenPnlClass()
  const published = React.useContext(PublicFigures)
  return (
    <span
      className={cn(className, published ? undefined : hiddenClass)}
      {...props}
    >
      {children}
    </span>
  )
}
