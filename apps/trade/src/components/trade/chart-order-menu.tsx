import * as React from "react"
import {
  BellRingIcon,
  ChevronRightIcon,
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
 * Buy at the level clicked, sell at it — or the presets that place a whole
 * plan at once, the DCA ladder and the grid. The two kinds are two fold-out
 * rows, "Manual order" and "Smart order", drawn the way the Folders panel
 * draws a folder: a chevron on the right that turns when the row is open, and
 * the choices under it. Both start closed. Clicking one opens it, clicking
 * it again closes it, and opening one closes the other, the way the Folders
 * panel works.
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

/** Which fold-out row is open: plain Long and Short, or the smart presets. */
type OrderFold = "manual" | "smart"

export function ChartOrderMenu({
  menu,
  wide = true,
  orders,
  /** True on a venue whose orders are swaps: the rows say Buy and Sell. */
  swaps = false,
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
  swaps?: boolean
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
  // Both closed until one is clicked. Nothing is saved: the Recent list
  // above already remembers what was placed.
  const [open, setOpen] = React.useState<OrderFold | null>(null)
  const toggle = (fold: OrderFold) =>
    setOpen((current) => (current === fold ? null : fold))

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
    open,
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
                swaps={swaps}
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
      {orders && smartOrders ? (
        <>
          <FoldRow
            label="Manual order"
            open={open === "manual"}
            onToggle={() => toggle("manual")}
          >
            <MenuRow side="buy" swaps={swaps} onPick={() => onPick("buy")} />
            <MenuRow side="sell" swaps={swaps} onPick={() => onPick("sell")} />
          </FoldRow>
          <FoldRow
            label="Smart order"
            open={open === "smart"}
            onToggle={() => toggle("smart")}
          >
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
          </FoldRow>
        </>
      ) : orders ? (
        <>
          <MenuRow side="buy" swaps={swaps} onPick={() => onPick("buy")} />
          <MenuRow side="sell" swaps={swaps} onPick={() => onPick("sell")} />
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
  swaps,
  onPick,
  onPickSmart,
}: {
  orderType: RecentOrderType
  swaps: boolean
  onPick: (side: TradeSide) => void
  onPickSmart: (preset: SmartOrderPreset) => void
}) {
  if (orderType === "buy" || orderType === "sell") {
    return (
      <MenuRow
        side={orderType}
        swaps={swaps}
        onPick={() => onPick(orderType)}
      />
    )
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

/**
 * A row that opens to show its choices, drawn like a folder in the Folders
 * panel: the name, a chevron on the right that turns when open, and the open
 * row wearing the same gray fill so which one is open never depends on the
 * chevron alone.
 */
function FoldRow({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div role="group" aria-label={label}>
      <button
        type="button"
        role="menuitem"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 px-2 py-1.5 text-left text-sm font-medium focus-visible:outline-none min-[1280px]:min-h-0",
          open ? "bg-muted" : "hover:bg-accent focus-visible:bg-accent"
        )}
      >
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronRightIcon
          className={cn("size-4 transition-transform", open && "rotate-90")}
        />
      </button>
      {open ? (
        <div className="bg-muted/30 [&>button]:pl-4">{children}</div>
      ) : null}
    </div>
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

function MenuRow({
  side,
  swaps,
  onPick,
}: {
  side: TradeSide
  swaps: boolean
  onPick: () => void
}) {
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
      <span className="font-medium">
        {swaps ? (buy ? "Buy" : "Sell") : buy ? "Long" : "Short"}
      </span>
    </button>
  )
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}
