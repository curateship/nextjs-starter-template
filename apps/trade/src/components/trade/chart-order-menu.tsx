import * as React from "react"
import { LayersIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { formatPrice } from "@/lib/trade/format"
import type { PaperSide } from "@/lib/trade/paper"

/**
 * The little menu a right-click on the chart puts under the pointer.
 *
 * Buy at the level clicked, sell at it — and under a "Smart order" heading,
 * the presets that place a whole plan at once, starting with the DCA ladder.
 * The price is the whole point of right-clicking rather than opening a form —
 * the level you pointed at is the level the order hangs from — so it is
 * printed on the rows rather than left to be typed in afterwards.
 */

export type ChartMenuState = { price: number; x: number; y: number }

/** The presets the Smart order group offers. Grid would be one more entry. */
export type SmartOrderPreset = "dca"

/** Roughly what the menu measures, so it can be kept on screen. */
const MENU_WIDTH = 200
const MENU_HEIGHT = 164

export function ChartOrderMenu({
  menu,
  onPick,
  onPickSmart,
  onClose,
}: {
  menu: ChartMenuState
  onPick: (side: PaperSide) => void
  onPickSmart: (preset: SmartOrderPreset) => void
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
        <div
          role="presentation"
          className="mx-2 my-1 border-t border-foreground/10"
        />
        {/* A labelled group, not a stray heading: everything inside a menu has
            to be a menu item or a group, or the heading reads as one. */}
        <div role="group" aria-label="Smart order">
          <p
            role="presentation"
            className="px-2 pb-0.5 text-[11px] font-medium text-muted-foreground"
          >
            Smart order
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => onPickSmart("dca")}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <LayersIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">DCA ladder</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {formatPrice(menu.price)}
            </span>
          </button>
        </div>
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
