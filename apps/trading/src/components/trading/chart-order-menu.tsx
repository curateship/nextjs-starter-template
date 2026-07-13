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
 * Right-click menu on the price chart: exposes actions for the clicked price.
 * Rendered fixed at the cursor; closes on outside click or Escape.
 */
export function ChartOrderMenu({
  menu,
  market,
  oneClickActions,
  onResetView,
  onClose,
}: {
  menu: ChartMenuState | null
  market: string
  oneClickActions: React.ReactNode
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
        className="fixed z-50 grid w-max min-w-44 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-1 text-sm shadow-md"
        style={{
          left: Math.min(menu.x, window.innerWidth - 200),
          top: Math.min(menu.y, window.innerHeight - 200),
        }}
      >
        {/* First row sits right under the cursor — keep Reset View there. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => {
            onResetView()
            onClose()
          }}
        >
          Reset View
        </Button>
        <div className="my-1 border-t" />
        <div className="px-2 py-1.5 font-mono text-xs text-muted-foreground tabular-nums">
          {market} @ {formatPriceDisplay(menu.px)}
        </div>
        {oneClickActions}
      </div>
    </>
  )
}
