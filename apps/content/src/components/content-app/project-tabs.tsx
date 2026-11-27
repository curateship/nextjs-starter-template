import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { underlineTabClassName, useDashboardTabStyle } from "@/components/shared/dashboard-tabs"
import { TabsTrigger } from "@/components/ui/tabs"
import { slidingPillMotionClassName } from "@/lib/hooks/use-sliding-pill"
import { cn } from "@/lib/utils"

type Box = { left: number; top: number; width: number; height: number }

/**
 * Where the line or pill was when a project tab was last pressed. Each of
 * Content, Research and Promote draws a header of its own, so a press draws
 * these tabs afresh; the new ones start their line here and slide it to the
 * tab pressed, as one row of tabs would (Tyler, 27 Nov 2026: "the tabs are
 * missing the transition animation"). Kept for a moment only, so a page
 * opened later places its line at once.
 *
 * A row drawn while another's line is still sliding carries on from where
 * that line has got to, rather than starting over from the tab left (Tyler,
 * 27 Nov 2026: "CLicking on promote tab has a bug that flashes the tab", then
 * "fix the tabs. it kept flashging"). That happens when a list finishes
 * reading and draws its header again, and when Research's page arrives half
 * a second after the press. The other row may still be on the page then
 * (`liveLines`), or already gone, leaving its line's place in `lastPress`.
 */
let lastPress: { box: Box; at: number } | null = null
const PRESS_FRESH_MS = 1500

/** The lines of the rows on the page now. */
const liveLines = new Set<HTMLElement>()

/** Where a line drawn now starts: the last press's, if it was a moment ago. */
function freshPress(): Box | null {
  return lastPress && Date.now() - lastPress.at < PRESS_FRESH_MS ? lastPress.box : null
}

/** Where a placed line is drawn this frame, partway through a slide; `fallback` for what it can't say. */
function drawnBox(line: HTMLElement, fallback: Box): Box {
  const drawn = getComputedStyle(line)
  const at = (value: string, otherwise: number) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : otherwise)
  return {
    left: at(drawn.left, fallback.left),
    top: at(drawn.top, fallback.top),
    width: at(drawn.width, fallback.width),
    height: at(drawn.height, fallback.height),
  }
}

/**
 * Content, Research and Promote, in the style Settings → Styling → Dashboard
 * tabs picks, the shell's own classes. Not the shell's `DashboardTabs`, for
 * two reasons:
 *
 * - **The line sits on the header's divider.** The shell's row reaches the
 *   header's edges by stretching from its parent, and here the parent is the
 *   back arrow's row, so it stopped 3px short (Tyler: "fix the gap here").
 *   This row is the header's full 56px itself.
 * - **The line slides between headers** (`lastPress` above).
 */
export function ProjectTabs({
  value,
  onValueChange,
  choices,
}: {
  value: string
  onValueChange: (value: string) => void
  choices: { value: string; label: string }[]
}) {
  const style = useDashboardTabStyle()
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const markerRef = React.useRef<HTMLSpanElement | null>(null)
  // Placed from the first draw: an unplaced row has its chosen tab draw a line of its own (the shell's
  // stand-in), which showed beside this one as it slid in (Tyler: "it kept flashging").
  const [box, setBox] = React.useState<Box | null>(freshPress)
  // The first placement jumps into position; later moves slide.
  const [slides, setSlides] = React.useState(false)
  // The tab pressed shows at once, before the page it opens has loaded (Research takes half a second),
  // then the value given takes over again when it changes.
  const [pressedValue, setPressedValue] = React.useState<string | null>(null)
  const [givenValue, setGivenValue] = React.useState(value)
  if (givenValue !== value) {
    setGivenValue(value)
    setPressedValue(null)
  }
  const shown = pressedValue ?? value

  const measure = React.useCallback((): Box | null => {
    const chosen = trackRef.current?.querySelector<HTMLElement>('[data-project-tab][data-state="active"]')
    return chosen ? { left: chosen.offsetLeft, top: chosen.offsetTop, width: chosen.offsetWidth, height: chosen.offsetHeight } : null
  }, [])

  React.useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const marker = markerRef.current
    // After a press, start where the line is now: another row's still on the page, or the place a row
    // that has gone left behind (after this one drew, so read here, still before the first paint).
    const pressed = freshPress()
    const other = [...liveLines].find((line) => line !== marker && line.isConnected && line.style.left)
    const from = pressed && other ? drawnBox(other, pressed) : pressed
    const fromPress = from !== null
    const place = () => setBox(measure())
    const start = () => setBox(from)
    if (!fromPress) place()
    else if (from !== box) start()
    if (marker) liveLines.add(marker)
    // One frame later the slide is switched on, and a line that started where the last header's was
    // moves to the tab pressed in the same frame, so it slides.
    let drawnOnce = false
    const frame = requestAnimationFrame(() => {
      drawnOnce = true
      setSlides(true)
      if (fromPress) place()
    })
    const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null
    sizes?.observe(track)
    return () => {
      cancelAnimationFrame(frame)
      sizes?.disconnect()
      if (marker) liveLines.delete(marker)
      const press = lastPress
      if (!press || Date.now() - press.at >= PRESS_FRESH_MS) return
      // Taken down before its first frame (React's development check does this to every row, and a page
      // can draw twice as it arrives): its line has not moved, so it hands on the place it was given.
      if (!drawnOnce) {
        if (from) lastPress = { at: press.at, box: from }
        return
      }
      // Still on the page while this runs: its line's place this frame, partway through a slide.
      if (marker?.style.left) lastPress = { at: press.at, box: drawnBox(marker, press.box) }
    }
    // Measured once on arrival; a new value is followed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useLayoutEffect(() => {
    const place = () => setBox(measure())
    if (slides) place()
    // Only the tab showing moves the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  const press = (next: string) => {
    const now = measure()
    if (now) lastPress = { box: now, at: Date.now() }
    setPressedValue(next)
    onValueChange(next)
  }

  const underline = style === "underline"
  const marker = cn(
    "pointer-events-none absolute z-0",
    underline ? "bottom-0 h-0.5 bg-foreground" : "rounded-md bg-background shadow-sm",
    box ? "opacity-100" : "opacity-0",
    // Until its first frame the line jumps, so its first places never show as a slide: the duration below
    // alone would animate every change, the first one included.
    slides ? "transition-[left,top,width,height,opacity]" : "transition-none",
    slidingPillMotionClassName
  )
  const markerStyle = box ? (underline ? { left: box.left, width: box.width } : box) : undefined

  return (
    // The header's full 56px inside its 12px padding, taking no more room than a 32px control, so the
    // line sits on the header's divider whatever the row around it.
    <TabsPrimitive.Root value={shown} onValueChange={press} className={cn("-my-3 flex h-14 shrink-0", underline ? "items-stretch" : "items-center")}>
      {underline ? (
        <div ref={trackRef} data-pill={box ? "placed" : "pending"} className="relative flex h-full items-stretch gap-5 px-1">
          <span ref={markerRef} aria-hidden className={marker} style={markerStyle} />
          <TabsPrimitive.List className="flex items-stretch gap-5">
            {choices.map((choice) => (
              <TabsPrimitive.Trigger key={choice.value} value={choice.value} data-project-tab="" className={underlineTabClassName}>
                {choice.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </div>
      ) : (
        <div
          ref={trackRef}
          data-pill={box ? "placed" : "pending"}
          className="relative inline-flex h-8 w-fit items-center rounded-lg bg-muted/60 p-0.5 text-muted-foreground"
        >
          <span ref={markerRef} aria-hidden className={marker} style={markerStyle} />
          <TabsPrimitive.List className="flex items-center">
            {choices.map((choice) => (
              <TabsTrigger key={choice.value} value={choice.value} data-project-tab="">
                {choice.label}
              </TabsTrigger>
            ))}
          </TabsPrimitive.List>
        </div>
      )}
    </TabsPrimitive.Root>
  )
}
