import * as React from "react"
import {
  ListIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react"

import { useActiveTrades } from "@/components/trade/use-active-trades"
import { cn } from "@/lib/utils"

/**
 * The four panels a screen under 1280px reaches from the bar along its bottom
 * edge (Tyler, 13 Nov 2026: "4 sticky buttons in the bottom. Left panel,
 * positions, browse market, right panel."). The chart is what shows with all
 * of them shut.
 */
export type NarrowPanel = "left" | "positions" | "browse" | "right"

const BUTTONS: Record<NarrowPanel, { label: string; icon: LucideIcon }> = {
  left: { label: "Left panel", icon: PanelLeftIcon },
  positions: { label: "Positions", icon: ListIcon },
  browse: { label: "Browse", icon: SearchIcon },
  right: { label: "Right panel", icon: PanelRightIcon },
}

const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
}

function buttonId(panel: NarrowPanel) {
  return `narrow-panel-button-${panel}`
}

function sheetId(panel: NarrowPanel) {
  return `narrow-panel-${panel}`
}

/**
 * The bar itself. A press opens that panel over the chart, a press on the
 * open one shuts it, and a press on another swaps straight across. It sits
 * clear of an iPhone's home line through the safe-area inset.
 */
export function NarrowPanelBar({
  panels,
  open,
  onToggle,
}: {
  /** Only the panels this view has: Overview has no Right panel. */
  panels: readonly NarrowPanel[]
  open: NarrowPanel | null
  onToggle: (panel: NarrowPanel) => void
}) {
  // Positions carries the count of active trades the panel lists, from the
  // read the header's Active trades button shares, and no number before the
  // first read lands.
  const positionsCount = useActiveTrades().snapshot?.activeTrades.length
  if (panels.length === 0) return null
  return (
    <nav
      aria-label="Dashboard panels"
      className={cn(
        "grid shrink-0 gap-2 pt-2 pb-[max(0px,env(safe-area-inset-bottom))]",
        COLUMNS[panels.length]
      )}
    >
      {panels.map((panel) => {
        const { label, icon: Icon } = BUTTONS[panel]
        const count = panel === "positions" ? positionsCount : undefined
        return (
          <button
            key={panel}
            id={buttonId(panel)}
            type="button"
            aria-pressed={open === panel}
            aria-controls={sheetId(panel)}
            onClick={() => onToggle(panel)}
            className="relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-card px-1 text-xs font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="max-w-full truncate">{label}</span>
            {count !== undefined ? (
              <span className="absolute top-1 right-1.5 rounded-md bg-muted px-1 text-[0.625rem] leading-4 text-muted-foreground tabular-nums">
                {count}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

/** How far a drag on the handle has to travel before letting go shuts it. */
const SWIPE_CLOSE_PX = 64

/**
 * The panels themselves, sliding up over the chart from the bar.
 *
 * Every panel stays mounted while shut, the same as the three panels side by
 * side on a wide screen, so the left page, the tables and the open trade never
 * reload for being looked at again. Only Browse is drawn fresh each
 * time, so its search starts empty.
 *
 * Not the shell's `Sheet`: that one unmounts what it holds when it shuts, and
 * as a modal dialog it treats a window opened from a table row as a press
 * outside itself. This one is plain markup over the chart, shut by its bar
 * button, the dimmed chart, a swipe down on its handle, or Escape.
 */
export function NarrowPanelLayer({
  open,
  onClose,
  panels,
}: {
  open: NarrowPanel | null
  onClose: () => void
  /** What each panel holds; a panel with nothing is never drawn. */
  panels: Record<NarrowPanel, React.ReactNode>
}) {
  // The panel sliding away keeps its contents until it is out of sight.
  const [lastOpen, setLastOpen] = React.useState(open)
  if (open !== null && open !== lastOpen) setLastOpen(open)
  const shown = open ?? lastOpen

  const sheetRef = React.useRef<HTMLElement | null>(null)
  const [drag, setDrag] = React.useState<{ from: number; by: number } | null>(
    null
  )

  // Focus goes into the panel as it opens, so a screen reader and the
  // keyboard land in it, and back to its bar button as it shuts.
  const wasOpen = React.useRef(open)
  React.useEffect(() => {
    const before = wasOpen.current
    wasOpen.current = open
    if (open !== null && open !== before) {
      sheetRef.current?.focus({ preventScroll: true })
      return
    }
    if (open === null && before !== null) {
      const sheet = sheetRef.current
      if (sheet && sheet.contains(document.activeElement)) {
        document.getElementById(buttonId(before))?.focus({ preventScroll: true })
      }
    }
  }, [open])

  // Escape shuts the panel, heard on the page rather than through React: the
  // tables are drawn into this panel from another part of the page, so React
  // would not pass their keys up here, and a list opened from the panel (a
  // filter's dropdown) sits outside it on the page, so its Escape stays its own.
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  React.useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet || open === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      onCloseRef.current()
    }
    sheet.addEventListener("keydown", onKey)
    return () => sheet.removeEventListener("keydown", onKey)
  }, [open])

  const release = (by: number) => {
    setDrag(null)
    if (by > SWIPE_CLOSE_PX) onClose()
  }

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden={open === null}
        aria-label="Close the panel"
        // Over the strip of chart the panel leaves showing, running just under
        // the card's rounded top corners. Never behind the rest of the card:
        // dim there showed as a grey wedge in its bottom corners.
        className={cn(
          "absolute inset-x-0 top-0 z-30 h-[calc(10%+1.5rem)] bg-black/30 transition-opacity duration-200 motion-reduce:transition-none",
          open === null ? "pointer-events-none opacity-0" : "opacity-100"
        )}
        onClick={onClose}
      />
      <section
        ref={sheetRef}
        data-slot="narrow-panel"
        id={shown ? sheetId(shown) : undefined}
        aria-labelledby={shown ? buttonId(shown) : undefined}
        tabIndex={-1}
        inert={open === null}
        className={cn(
          // No surface, corner or shadow of its own: the panel's card is the
          // surface, so its own corners are the only ones drawn (Tyler, 13 Nov
          // 2026, pointing at a grey wedge under the card's bottom corner).
          "absolute inset-x-0 top-[10%] bottom-0 z-40 flex flex-col outline-none",
          drag === null &&
            "transition-transform duration-200 motion-reduce:transition-none",
          open === null && "translate-y-[calc(100%+1rem)]"
        )}
        style={
          drag !== null && open !== null
            ? { transform: `translateY(${drag.by}px)` }
            : undefined
        }
      >
        {/* The handle, sitting on the panel's own header with no strip of its
            own (Tyler, 13 Nov 2026: "remove these paddings ... put the knob
            right on top of the panel header"). A drag down on it shuts the
            panel. Only the handle, so scrolling the list never shuts
            anything, and only the middle of the header, so the header's own
            buttons at either end keep their presses. */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 z-10 flex h-5 w-24 -translate-x-1/2 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            setDrag({ from: event.clientY, by: 0 })
          }}
          onPointerMove={(event) => {
            if (drag === null) return
            setDrag({ from: drag.from, by: Math.max(0, event.clientY - drag.from) })
          }}
          onPointerUp={() => release(drag?.by ?? 0)}
          onPointerCancel={() => setDrag(null)}
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {(Object.keys(panels) as NarrowPanel[]).map((panel) =>
          panels[panel] === null ? null : (
            <div
              key={panel}
              className={
                panel === shown
                  ? "flex min-h-0 flex-1 flex-col"
                  : "hidden"
              }
            >
              {panels[panel]}
            </div>
          )
        )}
      </section>
    </>
  )
}
