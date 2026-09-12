import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { OptionCard } from "@/components/trade/option-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TouchOrderFrame } from "@/components/trade/touch-order-frame"
import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { formatTimeAgo } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  CANDLE_INTERVALS,
  type CandleInterval,
} from "@/lib/protocols/contracts"
import {
  DEFAULT_DRAWING_VOLUME_MULTIPLE,
  DRAWING_EXPIRY_DAY_MS,
  MAX_DRAWING_EXPIRY_DAYS,
  type DrawingExpiry,
  drawingAlertArmed,
  drawingAlertFiresOn,
  describeDrawing,
  DRAWING_VOLUME_LOOKBACK,
  MAX_DRAWING_BUFFER_PCT,
  MAX_DRAWING_DESCRIPTION_LENGTH,
  MAX_DRAWING_VOLUME_MULTIPLE,
  readDrawingBuffer,
  readDrawingVolumeMultiple,
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
  onSetRules,
  onSetExpiry,
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
  onSetExpiry: (expiry: DrawingExpiry) => Promise<boolean>
  /**
   * What the alert waits for, sent whole: a timeframe whose finished candle
   * has to close past the line, and the volume that candle has to carry.
   */
  onSetRules: (rules: {
    closeInterval: CandleInterval | null
    volumeMultiple: number | null
  }) => void
}) {
  /*
    **Which way the window opens, decided once as it opens.**

    The library normally decides this for itself and revisits it whenever the
    content changes size — and this window does change size, because Close adds
    a timeframe and the volume switch adds a field. Pressing one made it flip
    from below the line to above it, which moved the whole window 563 pixels in
    one jump and put its header off the top of the screen. Whatever somebody
    was about to press had gone somewhere else.

    So the choice is made here, from where the line's point sits on the screen,
    and then held: below the point normally, above it when there is not room
    for a full window below and there is more room above. Collision handling is
    switched off so that nothing re-decides it afterwards, and the ceiling on
    the class below is what keeps the window on screen instead.

    Read as the window opens rather than on every render. `at` is the line's
    own point and does not move while the window is up.
  */
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

  const body = (headerClassName: string, scroll: boolean) => (
    <LineAlertBody
      drawing={drawing}
      linePrice={linePrice}
      currentPrice={currentPrice}
      paused={paused}
      headerClassName={headerClassName}
      scroll={scroll}
      onSetAlert={onSetAlert}
      onSetExtend={onSetExtend}
      onSetName={onSetName}
      onSetBuffer={onSetBuffer}
      onSetRules={onSetRules}
      onSetExpiry={onSetExpiry}
    />
  )

  if (!wide) {
    if (!open) return null
    return (
      <TouchOrderFrame
        label={
          drawing.shape.kind === "fib"
            ? "Fib retracement"
            : drawing.shape.kind === "level"
              ? "Level"
              : "Trendline"
        }
        wide={false}
        desktopClassName=""
        sheetClassName="p-4"
        onClose={() => onOpenChange(false)}
      >
        <div data-line-alert-sheet className="flex flex-col gap-2.5">
          {/* The divider reaches the sheet's own edges, which are 16 pixels
              out from its content. A line stopping short of them reads as a
              broken one. */}
          {body("-mx-4 border-b px-4 pb-2.5", false)}
        </div>
      </TouchOrderFrame>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor virtualRef={virtualRef} />
      <PopoverContent
        /*
          **A fixed height, and the body scrolls inside it — the same frame
          every order window on the chart uses.**

          The window hangs off a point on the chart, and its controls change
          how tall it wants to be: the close rule adds a timeframe, and the
          volume box adds a field. While its height followed its content, the
          library had to move the whole window to keep it on screen — 563
          pixels in one jump, with the header ending above the top of the
          screen and whatever somebody was about to press somewhere else.

          A window whose height never changes never has to be moved. 24rem is
          what that height is — shorter than the order windows, because this
          one is a handful of switches rather than a form, and a tall window
          over a chart covers the candles the line was drawn through. The room
          the screen has wins when it is less, and `ScrollArea` carries
          whatever does not fit, the way it does in the DCA and grid windows.
        */
        className="grid h-[min(24rem,var(--radix-popover-content-available-height))] w-72 grid-rows-[auto_minmax(0,1fr)] gap-0 p-0"
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
        {body("border-b p-2.5", true)}
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
  scroll,
  onSetAlert,
  onSetExtend,
  onSetName,
  onSetBuffer,
  onSetRules,
  onSetExpiry,
}: {
  drawing: Drawing
  linePrice: number | null
  currentPrice: number | null
  paused: boolean
  /** Pulls the header's divider out to whichever frame is holding it. */
  headerClassName: string
  /**
   * Put the fields in a scroll area under a header that stays put. True in
   * the popover, which is a fixed height; false in the bottom sheet, which
   * scrolls itself and would otherwise scroll twice.
   */
  scroll: boolean
  onSetAlert: (on: boolean) => void
  onSetExtend: (on: boolean) => void
  onSetName: (name: string) => void
  onSetBuffer: (buffer: number | null) => void
  onSetExpiry: (expiry: DrawingExpiry) => Promise<boolean>
  onSetRules: (rules: {
    closeInterval: CandleInterval | null
    volumeMultiple: number | null
  }) => void
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
  const firesOnId = `line-fires-on-${drawing.id}`
  const shape = drawing.shape
  const supportsAlert = shape.kind === "level" || shape.kind === "trendline"
  const noun = shape.kind === "level" ? "level" : "line"

  const fields = (
    <>
      {supportsAlert && paused ? (
        <p role="status" className="text-xs text-muted-foreground">
          Paused in Settings. No line alert fires until the Line alerts switch
          there goes back on.
        </p>
      ) : null}
      {supportsAlert ? (
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
      ) : null}
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
      {/* Only offered while the alert is on, because that is the record every
          one of these rules is kept on. Fire on comes first: it decides
          whether the volume condition below it means anything at all. */}
      {supportsAlert && armed && drawing.alert ? (
        <CloseRuleCard
          id={firesOnId}
          noun={noun}
          // Per line: opening another one starts from that line's own saved
          // rule rather than carrying this one's remembered choices across.
          key={firesOnId}
          alert={drawing.alert}
          onSetRules={onSetRules}
        />
      ) : null}
      {supportsAlert && armed && drawing.alert ? (
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
      {supportsAlert && armed && drawing.alert ? (
        <ExpiryField
          key={`expiry-${drawing.id}-${drawing.alert.expiresAt ?? "never"}`}
          id={`line-expiry-${drawing.id}`}
          drawing={drawing}
          onSetExpiry={onSetExpiry}
        />
      ) : null}
      {/* Only once there is something to say. A line with no alert used to
          carry a sentence explaining what the switch above it would do, which
          is what the switch itself says. */}
      {supportsAlert && armed ? (
        <p className="text-xs text-muted-foreground">
          {waitingWords(drawing.alert, noun)}
        </p>
      ) : supportsAlert && fired !== null ? (
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

  return (
    <>
      <PopoverHeader className={headerClassName}>
        <PopoverTitle>
          {shape.kind === "fib"
            ? "Fib retracement"
            : shape.kind === "level"
              ? "Level"
              : "Trendline"}
        </PopoverTitle>
        <p className="text-muted-foreground">
          {!supportsAlert
            ? describeDrawing(shape, formatPrice)
            : linePrice === null
              ? "This line is straight up and down."
              : `The ${noun} is at ${formatPrice(linePrice)} right now.`}
        </p>
      </PopoverHeader>
      {scroll ? (
        <ScrollArea className="min-h-0">
          <div className="grid gap-2.5 p-2.5">{fields}</div>
        </ScrollArea>
      ) : (
        fields
      )}
    </>
  )
}

/**
 * What an armed line is waiting for, in one sentence under the switches.
 *
 * Written from the saved rules rather than from a fixed string, so the line
 * says what it will actually do: a touch, a finished candle's close, and the
 * volume that candle has to carry.
 */
function waitingWords(alert: Drawing["alert"], noun: string): string {
  const crossing = alert?.direction === "above" ? "up through" : "down through"
  if (!alert || alert.closeInterval === undefined) {
    return `Fires once when the price crosses ${crossing} the ${noun}, then switches itself off.`
  }
  const volume =
    alert.volumeMultiple === undefined
      ? ""
      : ` on volume at least ${alert.volumeMultiple}x the average of the ${DRAWING_VOLUME_LOOKBACK} candles before it`
  return `Fires once when a finished ${alert.closeInterval} candle closes ${crossing} the ${noun}${volume}, then switches itself off.`
}

/**
 * The close rule, as one card that can be switched off wholesale: the
 * timeframe whose finished candle has to close past the line, and the volume
 * that candle has to carry.
 *
 * An `OptionCard`, the same as every rule on the DCA window. The box turns the
 * rule on and the chevron shows its settings, guidance sits behind the info
 * icon rather than under the controls, and the card says its own answer on the
 * right so a folded one still reads. Unchecked is the touch alert every line
 * had before this: the moment the price reaches the line, it fires.
 *
 * The volume condition lives inside this card rather than beside it, because a
 * live price carries no volume of its own — there is nothing for it to mean
 * until a candle is what fires the line.
 */
function CloseRuleCard({
  id,
  noun,
  alert,
  onSetRules,
}: {
  id: string
  /** What this drawing is called in a sentence: "line" or "level". */
  noun: string
  alert: NonNullable<Drawing["alert"]>
  onSetRules: (rules: {
    closeInterval: CandleInterval | null
    volumeMultiple: number | null
  }) => void
}) {
  const on = drawingAlertFiresOn(alert) === "close"
  // Kept so switching the card off and on does not lose the timeframe or the
  // multiple somebody picked a moment ago. Written only in the handlers below,
  // which are the only places either can change, and seeded from this line's
  // own saved rule. The card is keyed on the line, so opening another one
  // starts from that line's answer rather than from this one's.
  const [lastInterval, setLastInterval] = React.useState<CandleInterval>(
    alert.closeInterval ?? "1h"
  )
  const [lastMultiple, setLastMultiple] = React.useState<number>(
    alert.volumeMultiple ?? DEFAULT_DRAWING_VOLUME_MULTIPLE
  )

  const volumeId = `${id}-volume`
  const multipleId = `${id}-multiple`

  return (
    <OptionCard
      id={id}
      title="Wait for a close"
      hint={`A finished candle has to close on the far side of the ${noun}, instead of the alert firing the moment the price touches it. A close is what most people mean by a break; firing on the touch means being woken by every wick.`}
      foldWhenOff={false}
      // The card's own answer, so a folded one still says what it will do.
      summary={
        on
          ? alert.volumeMultiple === undefined
            ? alert.closeInterval
            : `${alert.closeInterval}, ${alert.volumeMultiple}×`
          : null
      }
      toggle={{
        checked: on,
        onChange: (next) =>
          onSetRules({
            closeInterval: next ? lastInterval : null,
            // A volume condition means nothing on a touch, so it comes off
            // with the rule rather than sitting there unread.
            volumeMultiple: null,
          }),
      }}
    >
      {on ? (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={`${id}-interval`}
              hint="Which candle has to close past the line. On 1h a new one finishes every hour, on 1d once a day. A shorter one tells you sooner and is wrong more often; a longer one asks the price to hold before you are told."
            >
              Timeframe
            </FieldLabel>
            <Select
              value={alert.closeInterval}
              onValueChange={(next) => {
                setLastInterval(next as CandleInterval)
                onSetRules({
                  closeInterval: next as CandleInterval,
                  volumeMultiple: alert.volumeMultiple ?? null,
                })
              }}
            >
              <SelectTrigger id={`${id}-interval`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANDLE_INTERVALS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={volumeId}
              checked={alert.volumeMultiple !== undefined}
              onCheckedChange={(next) =>
                onSetRules({
                  closeInterval: alert.closeInterval ?? lastInterval,
                  volumeMultiple: next === true ? lastMultiple : null,
                })
              }
            />
            <FieldLabel
              htmlFor={volumeId}
              hint={`A break on thin volume is often a fake. This asks the candle that closes past the ${noun} to have carried more trade than usual before the alert fires.`}
            >
              Only on above-average volume
            </FieldLabel>
          </div>
          {alert.volumeMultiple === undefined ? null : (
            <MultipleField
              id={multipleId}
              key={`multiple-${alert.volumeMultiple}`}
              multiple={alert.volumeMultiple}
              onSetMultiple={(multiple) => {
                if (multiple !== null) setLastMultiple(multiple)
                onSetRules({
                  closeInterval: alert.closeInterval ?? lastInterval,
                  // Emptying the box is the same as clearing the box above.
                  volumeMultiple: multiple,
                })
              }}
            />
          )}
        </div>
      ) : null}
    </OptionCard>
  )
}

/**
 * How many times its recent average the breaking candle's volume has to be.
 * Blank takes the condition off, which is the same thing the box above it
 * does — a break that has to beat nothing is not a volume-confirmed break.
 *
 * The unit is in the label, the way the DCA window's "Size ramp ×" carries
 * its own, rather than printed inside the box.
 */
function MultipleField({
  id,
  multiple,
  onSetMultiple,
}: {
  id: string
  multiple: number
  onSetMultiple: (multiple: number | null) => void
}) {
  const [draft, setDraft] = React.useState(String(multiple))
  const typed = readDrawingVolumeMultiple(draft)
  const unreadable = typed === false

  const commit = () => {
    if (unreadable) {
      showErrorToast(
        `A volume multiple is a number above zero and no more than ${MAX_DRAWING_VOLUME_MULTIPLE}, or nothing at all.`
      )
      return
    }
    if (typed === multiple) return
    onSetMultiple(typed)
  }

  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor={id}
        hint={`How many times the average of the ${DRAWING_VOLUME_LOOKBACK} candles before it. At 1.5 the breaking candle has to carry half as much again as usual.`}
      >
        Volume multiple ×
      </FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={draft}
        placeholder="None"
        autoComplete="off"
        aria-invalid={unreadable || undefined}
        className="bg-background"
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

function ExpiryField({
  id,
  drawing,
  onSetExpiry,
}: {
  id: string
  drawing: Drawing
  onSetExpiry: (expiry: DrawingExpiry) => Promise<boolean>
}) {
  const expiresAt = drawing.alert?.expiresAt
  const savedMode =
    expiresAt === undefined
      ? "never"
      : drawing.alert?.expiresAtLineEnd
        ? "line-end"
        : "days"
  const [openedAt] = React.useState(() => Date.now())
  const remaining =
    expiresAt === undefined
      ? null
      : Math.max(0, Math.ceil((expiresAt - openedAt) / DRAWING_EXPIRY_DAY_MS))
  const [mode, setMode] = React.useState(savedMode)
  const [draft, setDraft] = React.useState(
    savedMode === "days" ? String(remaining) : ""
  )
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const save = async (expiry: DrawingExpiry) => {
    setBusy(true)
    try {
      if (await onSetExpiry(expiry)) setMode(expiry.mode)
    } finally {
      setBusy(false)
    }
  }
  const commitDays = () => {
    if (busy) return
    dismissErrorToast()
    const days = Number(draft)
    if (!Number.isInteger(days) || days < 1 || days > MAX_DRAWING_EXPIRY_DAYS) {
      setInvalid(true)
      showErrorToast(
        `Enter a whole number of days between 1 and ${MAX_DRAWING_EXPIRY_DAYS}.`
      )
      return
    }
    setInvalid(false)
    if (savedMode === "days" && draft === String(remaining)) return
    void save({ mode: "days", days })
  }
  return (
    <div className="grid gap-4" aria-busy={busy}>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={id}
          hint="Switch the alert off silently after the days you enter. At line end uses the second point's time when saved. The drawing stays."
        >
          Expiry
        </FieldLabel>
        <Select
          value={mode}
          disabled={busy}
          onValueChange={(next) => {
            dismissErrorToast()
            if (next === "days") setMode(next)
            setInvalid(false)
            if (next === "never" || next === "line-end")
              void save({ mode: next })
          }}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="never">Never</SelectItem>
            <SelectItem value="days">After a number of days</SelectItem>
            {drawing.shape.kind === "trendline" ? (
              <SelectItem value="line-end">At line end</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>
      {mode === "days" ? (
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`${id}-days`}
            hint="Counted as 24-hour days from saving. Press Enter or leave the field to save."
          >
            Number of days
          </FieldLabel>
          <Input
            id={`${id}-days`}
            inputMode="numeric"
            value={draft}
            disabled={busy}
            aria-invalid={invalid || undefined}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDays}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitDays()
              }
            }}
          />
        </div>
      ) : null}
      {remaining !== null ? (
        <p role="status" className="text-xs text-muted-foreground">
          {remaining === 0
            ? "Expired. The engine will switch this alert off."
            : `Expires in ${remaining} ${remaining === 1 ? "day" : "days"}.`}
        </p>
      ) : null}
    </div>
  )
}
