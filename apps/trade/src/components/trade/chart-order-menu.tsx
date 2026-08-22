import * as React from "react"
import {
  Grid2x2Icon,
  LayersIcon,
  ShieldAlertIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react"

import type { PaperSide } from "@/lib/trade/paper"

/**
 * The little menu a right-click on the chart puts under the pointer.
 *
 * Buy at the level clicked, sell at it — and under a "Smart order" heading,
 * the presets that place a whole plan at once, starting with the DCA ladder.
 *
 * With a position open on this market and no exit set at the clicked side, a
 * "Take profit" or "Stop loss" row sits above everything: the fastest way to
 * put that exit where the pointer is. The target appears on the winning side
 * of the entry and the stop appears on the losing side.
 *
 * The price is not printed on the rows. Every row uses the level the pointer
 * is on, so copies of it would say nothing the crosshair and price axis were
 * not already saying beside the menu. The window each row opens shows the
 * price it is working from, which is where it can still be changed.
 */

export type ChartMenuState = { price: number; x: number; y: number }

/** The presets the Smart order group offers. */
export type SmartOrderPreset = "dca" | "grid"

/** How close to the window's edge the menu may sit. */
const EDGE = 8

export function ChartOrderMenu({
  menu,
  smartOrders,
  onPick,
  onPickSmart,
  onPickTakeProfit,
  onPickStopLoss,
  onClose,
}: {
  menu: ChartMenuState
  /** Whether the smart-order presets apply to the active wallet at all. */
  smartOrders: boolean
  onPick: (side: PaperSide) => void
  onPickSmart: (preset: SmartOrderPreset) => void
  /**
   * Puts a target on the open position at the level clicked, or null when
   * there is nothing to put one on — no position here, a target already set,
   * or the click on the losing side of the entry.
   */
  onPickTakeProfit: (() => void) | null
  /**
   * Puts a stop on the open position at the level clicked, or null when there
   * is nothing to put one on.
   */
  onPickStopLoss: (() => void) | null
  onClose: () => void
}) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  /**
   * Where it ends up, once it knows how big it is.
   *
   * The menu is as wide as its longest row and no wider, so nothing here can
   * be told in advance what it measures — it is asked. It is drawn at the
   * pointer first and moved inside the window before the browser paints, so
   * there is no frame where a menu hangs off the edge.
   */
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const [at, setAt] = React.useState({ left: menu.x, top: menu.y })

  React.useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const { width, height } = box.getBoundingClientRect()
    setAt({
      left: clamp(menu.x, EDGE, window.innerWidth - width - EDGE),
      top: clamp(menu.y, EDGE, window.innerHeight - height - EDGE),
    })
  }, [menu.x, menu.y, smartOrders, onPickTakeProfit, onPickStopLoss])

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
        ref={boxRef}
        role="menu"
        aria-label="Order at this price"
        // As wide as its longest row. There is no column of figures to line up
        // any more, so a fixed width would only be empty space to the right of
        // short labels.
        className="fixed z-50 w-max overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
        style={{ left: at.left, top: at.top }}
      >
        {onPickTakeProfit ? (
          <IconRow
            label="Take profit"
            icon={<TargetIcon className="size-4 text-emerald-600 dark:text-emerald-400" />}
            onPick={onPickTakeProfit}
          />
        ) : null}
        {onPickStopLoss ? (
          <IconRow
            label="Stop loss"
            icon={
              <ShieldAlertIcon className="size-4 text-red-600 dark:text-red-400" />
            }
            onPick={onPickStopLoss}
          />
        ) : null}
        {onPickTakeProfit || onPickStopLoss ? (
          <div role="presentation" className="mx-2 my-1 border-t" />
        ) : null}
        <MenuRow side="buy" onPick={() => onPick("buy")} />
        <MenuRow side="sell" onPick={() => onPick("sell")} />
        {smartOrders ? (
          <>
            <div
              role="presentation"
              className="mx-2 my-1 border-t"
            />
            {/* A labelled group, not a stray heading: everything inside a menu
                has to be a menu item or a group, or the heading reads as one. */}
            <div role="group" aria-label="Smart order">
              <p
                role="presentation"
                className="px-2 pb-0.5 text-[11px] font-medium text-muted-foreground"
              >
                Smart order
              </p>
              <IconRow
                label="DCA ladder"
                icon={<LayersIcon className="size-4 text-emerald-600 dark:text-emerald-400" />}
                onPick={() => onPickSmart("dca")}
              />
              <IconRow
                label="Grid"
                icon={<Grid2x2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />}
                onPick={() => onPickSmart("grid")}
              />
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

/** One row that is just an icon and a name — the presets, and Take profit. */
function IconRow({
  label,
  icon,
  onPick,
}: {
  label: string
  icon: React.ReactNode
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  )
}

function MenuRow({
  side,
  onPick,
}: {
  side: PaperSide
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
    </button>
  )
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}
