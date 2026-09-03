import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { formatDateTime } from "@/lib/format/format-time"
import { drawingAlertArmed, type Drawing } from "@/lib/trade/drawings"
import { formatPrice } from "@/lib/trade/format"

/**
 * The small window a picked-out trendline opens: one switch, Alert, and where
 * the line is right now in dollars.
 *
 * It hangs off a point on the chart rather than a button, because both ways
 * in — the cog and a double-click on the line — mean the same line, and the
 * line's middle is the one place that is the same for both.
 */
export function LineAlertPopover({
  drawing,
  linePrice,
  currentPrice,
  svg,
  at,
  open,
  onOpenChange,
  onSetAlert,
}: {
  drawing: Drawing
  /** Where the line was when the window opened, or null for a vertical line. */
  linePrice: number | null
  /** The live price when the window opened, or null before the first tick. */
  currentPrice: number | null
  /** The paint layer the point below is measured in. */
  svg: React.RefObject<SVGSVGElement | null>
  /** Where in that layer the window hangs from. */
  at: { x: number; y: number }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSetAlert: (on: boolean) => void
}) {
  // A pretend element for the popover to hang off: a zero-size box at one
  // point, measured off the layer each time the popover asks.
  const virtualRef = React.useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => {
          const box = svg.current?.getBoundingClientRect()
          const left = (box?.left ?? 0) + at.x
          const top = (box?.top ?? 0) + at.y
          return {
            x: left,
            y: top,
            left,
            top,
            right: left,
            bottom: top,
            width: 0,
            height: 0,
            toJSON: () => undefined,
          } as DOMRect
        },
      },
    }),
    [svg, at.x, at.y]
  )

  const armed = drawingAlertArmed(drawing.alert)
  const fired = drawing.alert?.firedAt ?? null
  const noPrice = linePrice === null || currentPrice === null
  const reason =
    linePrice === null
      ? "A straight-up-and-down line has no one price to watch."
      : "Waiting for a live price before the alert can be set."
  const switchId = `line-alert-${drawing.id}`

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor virtualRef={virtualRef} />
      <PopoverContent
        className="w-64"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <PopoverHeader>
          <PopoverTitle>Trendline</PopoverTitle>
          <p className="text-muted-foreground">
            {linePrice === null
              ? "This line is straight up and down."
              : `The line is at ${formatPrice(linePrice)} right now.`}
          </p>
        </PopoverHeader>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={switchId} className="text-sm">
            Alert
          </label>
          <DisabledReason reason={reason} disabled={noPrice && !armed}>
            <Switch
              id={switchId}
              checked={armed}
              disabled={noPrice && !armed}
              onCheckedChange={onSetAlert}
            />
          </DisabledReason>
        </div>
        <p className="text-xs text-muted-foreground">
          {armed
            ? `Rings once when the price crosses ${drawing.alert?.direction === "above" ? "up through" : "down through"} the line, then switches itself off.`
            : fired !== null
              ? `Fired ${formatDateTime(new Date(fired))}. Switch it on again to watch the line once more.`
              : "Rings the bell once when the price crosses the line."}
        </p>
      </PopoverContent>
    </Popover>
  )
}
