import * as React from "react"

import { formatPriceDisplay } from "@/components/trading/format"
import { Button } from "@/components/ui/button"

export type ChartMenuState = {
  price: number
  /** Rounded price string actually used for the order. */
  px: string
  x: number
  y: number
}

/**
 * Right-click menu on the price chart: prefills the ticket with a limit
 * order at the clicked price. Rendered fixed at the cursor; closes on
 * outside click or Escape.
 */
export function ChartOrderMenu({
  menu,
  market,
  onAction,
  onResetView,
  onClose,
}: {
  menu: ChartMenuState | null
  market: string
  onAction: (side: "buy" | "sell", px: string) => void
  onResetView: () => void
  onClose: () => void
}) {
  React.useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menu, onClose])

  if (!menu) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-50 min-w-44 rounded-md border bg-popover p-1 text-sm shadow-md"
        style={{
          left: Math.min(menu.x, window.innerWidth - 200),
          top: Math.min(menu.y, window.innerHeight - 120),
        }}
      >
        <div className="px-2 py-1.5 font-mono text-xs text-muted-foreground tabular-nums">
          {market} @ {formatPriceDisplay(menu.px)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-emerald-600 hover:text-emerald-700"
          onClick={() => onAction("buy", menu.px)}
        >
          Buy limit @ {formatPriceDisplay(menu.px)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-red-500 hover:text-red-600"
          onClick={() => onAction("sell", menu.px)}
        >
          Sell limit @ {formatPriceDisplay(menu.px)}
        </Button>
        <div className="my-1 border-t" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            onResetView()
            onClose()
          }}
        >
          Reset View
        </Button>
      </div>
    </>
  )
}
