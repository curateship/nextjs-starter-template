import * as React from "react"
import { PinIcon, PinOffIcon, XIcon } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Where a dragged popover was left, in this browser, for every run. */
const OFFSET_KEY = "bots-trades-popover-offset"

type Offset = { x: number; y: number }

/**
 * The tallest the trades list inside may be: the popover's own cap less its
 * 57px header. Set on the list's scroll box itself, because a list inside a
 * box that only has a maximum grows to its rows and is cut off rather than
 * scrolling.
 */
export const TRADES_POPOVER_LIST_MAX = "max-h-[calc(min(34rem,100vh-2rem)-57px)]"

/** Kept this far inside the window's edge, so it can always be grabbed again. */
const EDGE = 8

function readOffset(): Offset {
  if (typeof window === "undefined") return { x: 0, y: 0 }
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(OFFSET_KEY) ?? "null")
    if (
      value &&
      typeof value === "object" &&
      "x" in value &&
      "y" in value &&
      typeof value.x === "number" &&
      typeof value.y === "number"
    ) {
      return { x: value.x, y: value.y }
    }
  } catch {
    // A broken saved value only means it opens where it is anchored.
  }
  return { x: 0, y: 0 }
}

/**
 * How far an offset has to move so the box stays inside the window, given
 * where the box is drawn now with the offset it has now.
 */
function keptInside(offset: Offset, box: DOMRect): Offset {
  const width = window.innerWidth
  const height = window.innerHeight
  let { x, y } = offset
  if (box.right > width - EDGE) x -= box.right - (width - EDGE)
  if (box.left + (x - offset.x) < EDGE) x += EDGE - (box.left + (x - offset.x))
  if (box.bottom > height - EDGE) y -= box.bottom - (height - EDGE)
  if (box.top + (y - offset.y) < EDGE) y += EDGE - (box.top + (y - offset.y))
  return { x, y }
}

/**
 * A coin's trades, opened by pressing the coin in the right panel's Trades
 * card, in place of the trades panel that sat under the chart (Tyler, 10 Nov
 * 2026: "Clicking the market in the card open up a popup showing trades within
 * that market and with the ability to pin the popover and able to drag it
 * around and remove the bottom panel").
 *
 * - It opens beside the card it is anchored to, over the chart. It is as big
 *   as its trades and no bigger, up to 34rem tall (Tyler, 10 Nov 2026:
 *   "Increase popover height by 30%", from 26rem) and 52rem wide, then
 *   scrolls (Tyler, the same day: "The popover height and width should have
 *   a max size but it should grow and shrink with the amount of content").
 * - Its ⋮ hides columns, kept on the account per table.
 * - **Pin** keeps it open while the chart, the cards or anything else is
 *   pressed; unpinned, a press outside it closes it, as any popover does.
 * - Its header drags it. Where it was left is kept in this browser and used
 *   the next time it opens, pulled back inside the window if the window has
 *   since got smaller.
 *
 * The content is the run's own trades panel, whose header carries the Pin and
 * close buttons (`headerAction`).
 */
export function TradesPopover({
  open,
  onOpenChange,
  anchor,
  menu,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What it opens beside: the Trades card. */
  anchor: React.ReactNode
  /** Before Pin: the ⋮ that hides columns. */
  menu?: React.ReactNode
  /** The trades panel, handed the Pin and close buttons for its header. */
  children: (headerAction: React.ReactNode) => React.ReactNode
}) {
  const [pinned, setPinned] = React.useState(false)
  // Placed beside where the card was when it opened, and left there: anchored
  // to the card itself, scrolling the list beside it carried the popover along
  // (Tyler, 10 Nov 2026: "when i scroll the trades list, the popover also
  // scrolls with it"), and moved it out from under a drag.
  const anchorRef = React.useRef<HTMLDivElement | null>(null)
  const openedAt = React.useRef<DOMRect | null>(null)
  const virtualAnchor = React.useRef({
    getBoundingClientRect: () =>
      openedAt.current ?? anchorRef.current?.getBoundingClientRect() ?? new DOMRect(),
  })
  React.useLayoutEffect(() => {
    openedAt.current = open ? (anchorRef.current?.getBoundingClientRect() ?? null) : null
  }, [open])
  const [offset, setOffset] = React.useState<Offset>(readOffset)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  // While dragging: where it started, and how far it may go each way, worked
  // out once on the press from where it was drawn. Measuring again on every
  // move read a box the browser had not finished placing, and near an edge
  // that pushed it back and forth (Tyler, 10 Nov 2026: "if I drag the
  // popover to the edge, it kept getting bounced around").
  const drag = React.useRef<{
    pointer: number
    startX: number
    startY: number
    from: Offset
    min: Offset
    max: Offset
    last: Offset
  } | null>(null)

  const keep = React.useCallback((next: Offset) => {
    setOffset(next)
    try {
      window.localStorage.setItem(OFFSET_KEY, JSON.stringify(next))
    } catch {
      // Not kept for next time; it still moves now.
    }
  }, [])

  // A window made smaller after it was placed: pull it back inside.
  React.useEffect(() => {
    if (!open) return
    const onResize = () => {
      const box = contentRef.current?.getBoundingClientRect()
      if (!box) return
      setOffset((current) => keptInside(current, box))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return
    // Only the header drags it, and never a press on one of its buttons.
    if (!event.target.closest('[data-slot="dashboard-card-header"]') || event.target.closest("button")) return
    const box = event.currentTarget.getBoundingClientRect()
    // Where it sits with no offset at all, beside the card.
    const baseLeft = box.left - offset.x
    const baseTop = box.top - offset.y
    drag.current = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      from: offset,
      min: { x: EDGE - baseLeft, y: EDGE - baseTop },
      max: { x: window.innerWidth - EDGE - box.width - baseLeft, y: window.innerHeight - EDGE - box.height - baseTop },
      last: offset,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const now = drag.current
    if (!now || now.pointer !== event.pointerId) return
    const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high))
    const next = {
      x: clamp(now.from.x + event.clientX - now.startX, now.min.x, now.max.x),
      y: clamp(now.from.y + event.clientY - now.startY, now.min.y, now.max.y),
    }
    now.last = next
    // Moved on the box itself, not through React: drawing the whole trades
    // table again on every pointer move lagged behind the mouse and kept
    // catching up after it let go. The spot is handed to React once, on
    // release.
    event.currentTarget.style.translate = `${next.x}px ${next.y}px`
  }
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const now = drag.current
    if (now?.pointer !== event.pointerId) return
    drag.current = null
    keep(now.last)
  }

  const headerAction = (
    <div className="flex items-center gap-0.5">
      {menu}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={pinned ? "Unpin the trades" : "Pin the trades open"}
            aria-pressed={pinned}
            onClick={() => setPinned((was) => !was)}
            className={cn(pinned && "text-foreground")}
          >
            {pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{pinned ? "Unpin: close when I press elsewhere" : "Pin: stay open while I press elsewhere"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close the trades" onClick={() => onOpenChange(false)}>
            <XIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Close the trades</TooltipContent>
      </Tooltip>
    </div>
  )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor virtualRef={virtualAnchor} />
      <div ref={anchorRef} data-trades-anchor="">
        {anchor}
      </div>
      <PopoverContent
        ref={contentRef}
        side="left"
        align="start"
        sideOffset={12}
        // Placed beside the card and left there: the library's own flipping
        // and sliding away from the window's edge fought the drag, which
        // moves it from that spot, and bounced it about near an edge (Tyler,
        // 10 Nov 2026: "if I drag the popover to the edge, it kept getting
        // bounced around"). `keptInside` alone keeps it in the window.
        avoidCollisions={false}
        // No transition: the shared popover eases every change over 0.1s,
        // which turned a drag into a string of short slides that trailed the
        // mouse. Its fade in and out is an animation and stays.
        // Its width is the table's, or the header's name and buttons if
        // they are wider. The count after the name is left out of the sum
        // (width 0, then it grows into what is left), so it never spreads
        // the columns apart (Tyler, 10 Nov 2026: "still too much space") and
        // shortens before the name ever does. Any spare width
        // is shared out between the columns, never an empty strip at the
        // right (Tyler: "there's a gap", "still a gap here"), and with a few columns hidden the
        // popover shrinks to them rather than leaving a wide empty strip
        // (Tyler, 10 Nov 2026: "now theres a huge gap here").
        // `translate` adds to the transform the popover is placed with, so
        // the drag moves it from where it is anchored.
        style={{ translate: `${offset.x}px ${offset.y}px` }}
        className="flex max-h-[min(34rem,calc(100vh-2rem))] w-max max-w-[min(52rem,calc(100vw-2rem))] [&_[data-slot=dashboard-card-header]>h2]:shrink-0 [&_[data-slot=dashboard-card-header]>h2+div:not(.ml-auto)]:w-0 [&_[data-slot=dashboard-card-header]>h2+div:not(.ml-auto)]:grow transition-none flex-col gap-0 overflow-hidden p-0 [&_[data-slot=dashboard-card-header]]:cursor-move"
        // The trades take the keyboard only when somebody moves into them.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          // Measured once it has been placed beside the card, a frame or two
          // after it opens, then pulled inside the window if the saved spot
          // came from a bigger one.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const box = contentRef.current?.getBoundingClientRect()
              if (box) setOffset((current) => keptInside(current, box))
            })
          )
        }}
        onInteractOutside={(event) => {
          // The ⋮'s menu draws outside the popover, and pressing another
          // coin in the Trades card switches what it shows: neither is
          // leaving it.
          const target = event.target instanceof Element ? event.target : null
          if (pinned || target?.closest('[data-slot="dropdown-menu-content"], [data-trades-anchor]')) event.preventDefault()
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children(headerAction)}
      </PopoverContent>
    </Popover>
  )
}
