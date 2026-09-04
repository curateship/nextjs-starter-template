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
import { Textarea } from "@/components/ui/textarea"
import { formatTimeAgo } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  drawingAlertArmed,
  MAX_DRAWING_BUFFER_PCT,
  MAX_DRAWING_DESCRIPTION_LENGTH,
  readDrawingBuffer,
  type Drawing,
} from "@/lib/trade/drawings"
import { formatPrice } from "@/lib/trade/format"

/**
 * The small window a picked-out line opens: a header saying which line and
 * where it is in dollars, then a switch, Alert, on a trendline a second
 * switch that carries the line on to the right edge, and a description for
 * the line.
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
  onSetBuffer,
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
  /** The description typed for the line, trimmed; blank removes it. */
  onSetName: (name: string) => void
  /** The percentage past the line before it fires, or null for none. */
  onSetBuffer: (buffer: number | null) => void
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
      onSetBuffer={onSetBuffer}
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
  onSetBuffer,
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
  onSetBuffer: (buffer: number | null) => void
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
  const descriptionId = `line-description-${drawing.id}`
  const bufferId = `line-buffer-${drawing.id}`
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
          Paused in Settings. No line alert fires until the Line alerts
          switch there goes back on.
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
      {/* Only offered while the alert is on, because that is the record the
          dollars are kept on. */}
      {armed && drawing.alert ? (
        <BufferField
          id={bufferId}
          noun={noun}
          // Prefixed, because the field below is keyed the same way and two
          // siblings both keyed "" is a collision React resolves by drawing
          // one of them twice.
          key={`buffer-${drawing.alert.buffer ?? ""}`}
          buffer={drawing.alert.buffer}
          direction={drawing.alert.direction}
          onSetBuffer={onSetBuffer}
        />
      ) : null}
      {/* Only once there is something to say. A line with no alert used to
          carry a sentence explaining what the switch above it would do, which
          is what the switch itself says. */}
      {armed ? (
        <p className="text-xs text-muted-foreground">
          {`Fires once when the price crosses ${drawing.alert?.direction === "above" ? "up through" : "down through"} the ${noun}, then switches itself off.`}
        </p>
      ) : fired !== null ? (
        <p className="text-xs text-muted-foreground">
          {`Fired ${formatTimeAgo(new Date(fired))}${firedPrice === undefined ? "" : ` at ${formatPrice(firedPrice)}`}. Switch it on again to watch the ${noun} once more.`}
        </p>
      ) : null}
      <DescriptionField
        id={descriptionId}
        key={`name-${shape.name ?? ""}`}
        name={shape.name ?? ""}
        onSetName={onSetName}
      />
    </>
  )
}

/**
 * How far past the line the price has to go before the alert fires, as a
 * percentage, so a wick that only kisses the line stays quiet. Blank is none.
 *
 * Beside the box it says that percentage and which side of the line it sits
 * on, read from what is being typed rather than from what is saved. It used
 * to work the percentage out into a price and show that instead, which is a
 * number nobody needs to read off this field.
 */
function BufferField({
  id,
  noun,
  buffer,
  direction,
  onSetBuffer,
}: {
  id: string
  /** What this drawing is called in a sentence: "line" or "level". */
  noun: string
  /** The saved percentage, or undefined for none. */
  buffer: number | undefined
  direction: "above" | "below"
  onSetBuffer: (buffer: number | null) => void
}) {
  const saved = buffer ?? null
  const [draft, setDraft] = React.useState(
    buffer === undefined ? "" : String(buffer)
  )
  const typed = readDrawingBuffer(draft)
  const unreadable = typed === false

  const commit = () => {
    if (unreadable) {
      showErrorToast(
        `A break buffer is a percentage above zero and no more than ${MAX_DRAWING_BUFFER_PCT}, or nothing at all.`
      )
      return
    }
    if (typed === saved) return
    onSetBuffer(typed)
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm">
        Break buffer
      </label>
      <div className="flex items-center gap-2">
        {/* Only as wide as the two or three characters a buffer ever is, with
            the percent sign inside the box rather than trailing after it. */}
        <div className="relative w-20 shrink-0">
          <Input
            id={id}
            className="pr-7"
            inputMode="decimal"
            value={draft}
            placeholder="None"
            autoComplete="off"
            aria-invalid={unreadable || undefined}
            aria-describedby={`${id}-fires`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commit()
              }
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
          >
            %
          </span>
        </div>
        {/* The percentage and which side of the line it is, not the price it
            works out to. Tyler, 3 Sep 2026: "It should say % at below or above
            line. At makes no sense and i dont need to read the price." */}
        <span
          id={`${id}-fires`}
          className="min-w-0 text-xs text-muted-foreground"
        >
          {typed === null || typed === false
            ? ""
            : `${typed}% ${direction} the ${noun}`}
        </span>
      </div>
    </div>
  )
}

/**
 * The line's description. Saved when the field is left, not on every
 * keystroke, because each save is a write of the whole line. The box grows as
 * words wrap and has room for a normal sentence. The same cap guards the
 * server function.
 */
function DescriptionField({
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
        Description
      </label>
      <Textarea
        id={id}
        rows={1}
        value={draft}
        maxLength={MAX_DRAWING_DESCRIPTION_LENGTH}
        placeholder="For example, price must stay above this line"
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
    </div>
  )
}
