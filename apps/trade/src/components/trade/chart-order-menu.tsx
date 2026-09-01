import * as React from "react"
import {
  BellRingIcon,
  Grid2x2Icon,
  LayersIcon,
  ShieldAlertIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react"

import type { TradeSide } from "@/lib/trade/paper"
import { LOST_MONEY, MADE_MONEY } from "@/lib/trade/money-tone"
import type { RecentOrderType } from "@/lib/trade/recent-order-types"
import { formatPrice } from "@/lib/trade/format"
import { TouchOrderFrame } from "@/components/trade/touch-order-frame"
import { cn } from "@/lib/utils"

/**
 * The little menu a right-click on the chart puts under the pointer.
 *
 * Buy at the level clicked, sell at it — and under a "Smart order" heading,
 * the presets that place a whole plan at once, starting with the DCA ladder.
 *
 * With a position open on this market and room for another exit, a
 * "Take profit" or "Stop loss" row sits above everything: the fastest way to
 * put that exit where the pointer is. The target appears on the winning side
 * of the entry and the stop appears on the losing side.
 *
 * Order rows leave the price to the crosshair and axis beside the menu. The
 * alert row names the price because picking it saves that exact line without
 * opening a window where it can still be changed.
 */

export type ChartMenuState = { price: number; x: number; y: number }

/** The presets the Smart order group offers. */
export type SmartOrderPreset = "dca" | "grid"

/** How close to the window's edge the menu may sit. */
const EDGE = 8

export function ChartOrderMenu({
  menu,
  wide = true,
  orders,
  smartOrders,
  recentOrderTypes,
  onPick,
  onPickSmart,
  onPickTakeProfit,
  onPickStopLoss,
  onPickAlert,
  onClose,
}: {
  menu: ChartMenuState
  /** The chart passes the shell's 1280px layout answer. Tests default wide. */
  wide?: boolean
  /** No wallet means the chart still offers alerts, but no order rows. */
  orders: boolean
  /** Whether the smart-order presets apply to the active wallet at all. */
  smartOrders: boolean
  /** Unique kinds actually placed by this account, newest first. */
  recentOrderTypes: readonly RecentOrderType[]
  onPick: (side: TradeSide) => void
  onPickSmart: (preset: SmartOrderPreset) => void
  /**
   * Adds a target to the open position at the level clicked, or null when
   * there is nothing to put one on, all three targets are used, or the click
   * is on the losing side of the entry.
   */
  onPickTakeProfit: (() => void) | null
  /**
   * Puts a stop on the open position at the level clicked, or null when there
   * is nothing to put one on.
   */
  onPickStopLoss: (() => void) | null
  onPickAlert: () => void
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
  }, [
    menu.x,
    menu.y,
    orders,
    smartOrders,
    recentOrderTypes.length,
    onPickTakeProfit,
    onPickStopLoss,
  ])

  const recent = orders
    ? recentOrderTypes.filter(
        (orderType) =>
          smartOrders || orderType === "buy" || orderType === "sell"
      )
    : []

  return (
    <TouchOrderFrame
      label="Actions at this price"
      wide={wide}
      role="menu"
      desktopRef={boxRef}
      // As wide as its longest row. There is no column of figures to line up
      // any more, so a fixed width would only be empty space to the right of
      // short labels.
      desktopClassName="fixed z-50 w-max overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
      sheetClassName="py-1"
      desktopStyle={{ left: at.left, top: at.top }}
      onClose={onClose}
    >
      {orders && onPickTakeProfit ? (
        <IconRow
          label="Take profit"
          icon={<TargetIcon className={cn("size-4", MADE_MONEY)} />}
          onPick={onPickTakeProfit}
        />
      ) : null}
      {orders && onPickStopLoss ? (
        <IconRow
          label="Stop loss"
          icon={<ShieldAlertIcon className={cn("size-4", LOST_MONEY)} />}
          onPick={onPickStopLoss}
        />
      ) : null}
      {orders && (onPickTakeProfit || onPickStopLoss) ? (
        <div role="presentation" className="my-1 border-t" />
      ) : null}
      {orders && recent.length > 0 ? (
        <>
          <div role="group" aria-label="Recent">
            <p
              role="presentation"
              className="px-2 pb-0.5 text-xs font-medium text-muted-foreground"
            >
              Recent
            </p>
            {recent.map((orderType) => (
              <OrderTypeRow
                key={orderType}
                orderType={orderType}
                onPick={onPick}
                onPickSmart={onPickSmart}
              />
            ))}
          </div>
          <div role="presentation" className="my-1 border-t" />
        </>
      ) : null}
      {orders ? (
        <>
          <MenuRow side="buy" onPick={() => onPick("buy")} />
          <MenuRow side="sell" onPick={() => onPick("sell")} />
        </>
      ) : null}
      {orders && smartOrders ? (
        <>
          <div role="presentation" className="my-1 border-t" />
          {/* A labelled group, not a stray heading: everything inside a menu
                has to be a menu item or a group, or the heading reads as one. */}
          <div role="group" aria-label="Smart order">
            <p
              role="presentation"
              className="px-2 pb-0.5 text-xs font-medium text-muted-foreground"
            >
              Smart order
            </p>
            <IconRow
              label="DCA ladder"
              icon={<LayersIcon className="size-4 text-muted-foreground" />}
              onPick={() => onPickSmart("dca")}
            />
            <IconRow
              label="Grid"
              icon={<Grid2x2Icon className="size-4 text-muted-foreground" />}
              onPick={() => onPickSmart("grid")}
            />
          </div>
        </>
      ) : null}
      {orders ? <div role="presentation" className="my-1 border-t" /> : null}
      <IconRow
        label={`Alert at ${formatPrice(menu.price)}`}
        icon={<BellRingIcon className="size-4 text-muted-foreground" />}
        onPick={onPickAlert}
      />
    </TouchOrderFrame>
  )
}

function OrderTypeRow({
  orderType,
  onPick,
  onPickSmart,
}: {
  orderType: RecentOrderType
  onPick: (side: TradeSide) => void
  onPickSmart: (preset: SmartOrderPreset) => void
}) {
  if (orderType === "buy" || orderType === "sell") {
    return <MenuRow side={orderType} onPick={() => onPick(orderType)} />
  }
  if (orderType === "dca") {
    return (
      <IconRow
        label="DCA ladder"
        icon={<LayersIcon className="size-4 text-muted-foreground" />}
        onPick={() => onPickSmart("dca")}
      />
    )
  }
  return (
    <IconRow
      label="Grid"
      icon={<Grid2x2Icon className="size-4 text-muted-foreground" />}
      onPick={() => onPickSmart("grid")}
    />
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
      className="flex min-h-11 w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none min-[1280px]:min-h-0"
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  )
}

function MenuRow({ side, onPick }: { side: TradeSide; onPick: () => void }) {
  const buy = side === "buy"
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      className="flex min-h-11 w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none min-[1280px]:min-h-0"
    >
      {buy ? (
        <TrendingUpIcon className={cn("size-4", MADE_MONEY)} />
      ) : (
        <TrendingDownIcon className={cn("size-4", LOST_MONEY)} />
      )}
      <span className="font-medium">{buy ? "Long" : "Short"}</span>
    </button>
  )
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}
