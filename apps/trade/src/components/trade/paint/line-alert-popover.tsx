import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { TouchOrderFrame } from "@/components/trade/touch-order-frame"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { formatTimeAgo } from "@/lib/format/format-time"
import {
  drawingAlertArmed,
  MAX_DRAWING_NAME_LENGTH,
  type Drawing,
} from "@/lib/trade/drawings"
import { formatPrice } from "@/lib/trade/format"

/**
 * The small window a picked-out line opens: a header saying which line and
 * where it is in dollars, then a switch, Alert, on a trendline a second
 * switch that carries the line on to the right edge, and a name for the
 * line.
 *
 * It hangs off a point on the chart rather than a button, because every way
 * in — the cog, a double-click, Enter on the line, a long press on it — means
 * the same line, and the line's middle is the one place that is the same for
 * all of them. Below the 1280-pixel layout it opens in the bottom sheet the
 * order windows use instead, where a popover would hang off the edge.
 */
export function LineAlertPopover({
  drawing,
  linePrice,
  currentPrice,
  svg,
  at,
  open,
  wide,
  autoFocus,
  paused,
  onOpenChange,
  onSetAlert,
  onSetExtend,
  onSetName,
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
  /** The shell's 1280-pixel layout answer: a popover when wide, a sheet else. */
  wide: boolean
  /**
   * Move the keyboard into the window as it opens. Wanted when the window was
   * opened from the keyboard, so Tab reaches its switch; not when it was
   * opened with a pointer, where the chart keeps the pointer's business.
   */
  autoFocus: boolean
  /** The master switch in Settings is off. */
  paused: boolean
  onOpenChange: (open: boolean) => void
  onSetAlert: (on: boolean) => void
  /** Draw a trendline on to the right edge, or stop. Never asked of a level. */
  onSetExtend: (on: boolean) => void
  /** The name typed for the line, trimmed; blank means no name. */
  onSetName: (name: string) => void
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

  const body = (headerClassName: string) => (
    <LineAlertBody
      drawing={drawing}
      linePrice={linePrice}
      currentPrice={currentPrice}
      paused={paused}
      headerClassName={headerClassName}
      onSetAlert={onSetAlert}
      onSetExtend={onSetExtend}
      onSetName={onSetName}
    />
  )

  if (!wide) {
    if (!open) return null
    return (
      <TouchOrderFrame
        label={drawing.shape.kind === "level" ? "Level" : "Trendline"}
        wide={false}
        desktopClassName=""
        sheetClassName="p-4"
        onClose={() => onOpenChange(false)}
      >
        <div data-line-alert-sheet className="flex flex-col gap-2.5">
          {/* The divider reaches the sheet's own edges, which are 16 pixels
              out from its content. A line stopping short of them reads as a
              broken one. */}
          {body("-mx-4 border-b px-4 pb-2.5")}
        </div>
      </TouchOrderFrame>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor virtualRef={virtualRef} />
      <PopoverContent
        className="w-64"
        onOpenAutoFocus={(event) => {
          if (!autoFocus) event.preventDefault()
        }}
        // The cog that opens this window is a focusable shape on the chart,
        // not a trigger this window knows about. The browser focuses it as
        // part of the press, the window read that as somebody working
        // somewhere else, and it closed itself in the frame it opened in. A
        // press outside still closes it; only the focus rule is off.
        onFocusOutside={(event) => event.preventDefault()}
        // The layer puts the keyboard back on the line itself, which the
        // popover cannot: its anchor is a point on the chart, not an element.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {/* Ten pixels out to the popover's edges, matching its own padding. */}
        {body("-mx-2.5 border-b px-2.5 pb-2.5")}
      </PopoverContent>
    </Popover>
  )
}

/** What the window says, the same in the popover and in the sheet. */
function LineAlertBody({
  drawing,
  linePrice,
  currentPrice,
  paused,
  headerClassName,
  onSetAlert,
  onSetExtend,
  onSetName,
}: {
  drawing: Drawing
  linePrice: number | null
  currentPrice: number | null
  paused: boolean
  /** Pulls the header's divider out to whichever frame is holding it. */
  headerClassName: string
  onSetAlert: (on: boolean) => void
  onSetExtend: (on: boolean) => void
  onSetName: (name: string) => void
}) {
  const armed = drawingAlertArmed(drawing.alert)
  const fired = drawing.alert?.firedAt ?? null
  const firedPrice = drawing.alert?.firedPrice
  const noPrice = linePrice === null || currentPrice === null
  const reason =
    linePrice === null
      ? "A straight-up-and-down line has no one price to watch."
      : "Waiting for a live price before the alert can be set."
  const switchId = `line-alert-${drawing.id}`
  const extendId = `line-extend-${drawing.id}`
  const nameId = `line-name-${drawing.id}`
  const shape = drawing.shape
  const noun = shape.kind === "level" ? "level" : "line"

  return (
    <>
      <PopoverHeader className={headerClassName}>
        <PopoverTitle>
          {shape.kind === "level" ? "Level" : "Trendline"}
        </PopoverTitle>
        <p className="text-muted-foreground">
          {linePrice === null
            ? "This line is straight up and down."
            : `The ${noun} is at ${formatPrice(linePrice)} right now.`}
        </p>
      </PopoverHeader>
      {paused ? (
        <p role="status" className="text-xs text-muted-foreground">
          Paused in Settings. No line alert rings until the Line alerts switch
          there goes back on.
        </p>
      ) : null}
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
      {shape.kind === "trendline" ? (
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={extendId} className="text-sm">
            Continuous line
          </label>
          <Switch
            id={extendId}
            checked={shape.extendRight === true}
            onCheckedChange={onSetExtend}
          />
        </div>
      ) : null}
      {/* Only once there is something to say. A line with no alert used to
          carry a sentence explaining what the switch above it would do, which
          is what the switch itself says. */}
      {armed ? (
        <p className="text-xs text-muted-foreground">
          {`Rings once when the price crosses ${drawing.alert?.direction === "above" ? "up through" : "down through"} the ${noun}, then switches itself off.`}
        </p>
      ) : fired !== null ? (
        <p className="text-xs text-muted-foreground">
          {`Fired ${formatTimeAgo(new Date(fired))}${firedPrice === undefined ? "" : ` at ${formatPrice(firedPrice)}`}. Switch it on again to watch the ${noun} once more.`}
        </p>
      ) : null}
      <NameField
        id={nameId}
        key={shape.name ?? ""}
        name={shape.name ?? ""}
        onSetName={onSetName}
      />
    </>
  )
}

/**
 * The line's name. Saved when the field is left or Enter is pressed, not on
 * every keystroke, because each save is a write of the whole line. The field
 * stops at 24 characters itself, which is plainer than refusing the 25th
 * afterwards, and the same cap guards the server fn.
 */
function NameField({
  id,
  name,
  onSetName,
}: {
  id: string
  name: string
  onSetName: (name: string) => void
}) {
  const [draft, setDraft] = React.useState(name)

  const commit = () => {
    if (draft.trim() === name) return
    onSetName(draft)
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm">
        Name
      </label>
      <Input
        id={id}
        value={draft}
        maxLength={MAX_DRAWING_NAME_LENGTH}
        placeholder="For example, 4h base"
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}
