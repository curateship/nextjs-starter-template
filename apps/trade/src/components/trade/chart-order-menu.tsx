import * as React from "react"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { formatPrice } from "@/lib/trade/format"
import type { PaperSide } from "@/lib/trade/paper"

/**
 * The little menu a right-click on the chart puts under the pointer.
 *
 * Two rows and nothing else: buy at the level clicked, or sell at it. The
 * price is the whole point of right-clicking rather than opening a form — the
 * level you pointed at is the level the order goes to — so it is printed on
 * both rows rather than left to be typed in afterwards.
 */

export type ChartMenuState = { price: number; x: number; y: number }

/** Roughly what the menu measures, so it can be kept on screen. */
const MENU_WIDTH = 200
const MENU_HEIGHT = 96

export function ChartOrderMenu({
  menu,
  onPick,
  onClose,
}: {
  menu: ChartMenuState
  onPick: (side: PaperSide) => void
  onClose: () => void
}) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <>
      {/* Catches the next press anywhere, including the right-click that opens
          the menu somewhere else, so it can never be left behind. */}
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        role="menu"
        aria-label="Order at this price"
        className="fixed z-50 w-48 overflow-hidden rounded-md border border-foreground/10 bg-popover py-1 text-popover-foreground shadow-md"
        style={{
          left: Math.min(menu.x, window.innerWidth - MENU_WIDTH),
          top: Math.min(menu.y, window.innerHeight - MENU_HEIGHT),
        }}
      >
        <MenuRow
          side="buy"
          price={menu.price}
          onPick={() => onPick("buy")}
        />
        <MenuRow
          side="sell"
          price={menu.price}
          onPick={() => onPick("sell")}
        />
      </div>
    </>
  )
}

function MenuRow({
  side,
  price,
  onPick,
}: {
  side: PaperSide
  price: number
  onPick: () => void
}) {
  const buy = side === "buy"
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      {buy ? (
        <TrendingUpIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <TrendingDownIcon className="size-4 text-red-600 dark:text-red-400" />
      )}
      <span className="font-medium">{buy ? "Buy limit" : "Sell limit"}</span>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
        {formatPrice(price)}
      </span>
    </button>
  )
}
