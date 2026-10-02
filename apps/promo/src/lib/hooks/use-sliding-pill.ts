import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Luma's switcher curve and duration. Shared so the pill and the labels that
 * change colour underneath it move together.
 */
export const slidingPillMotionClassName =
  "duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"

type PillBox = { left: number; top: number; width: number; height: number }

function readPill(track: HTMLElement, selected: string): PillBox | null {
  const chosen = track.querySelector<HTMLElement>(selected)
  if (!chosen) return null
  // offsetLeft, not getBoundingClientRect: a control inside a dialog is first
  // measured while the dialog is still scaling up, and a rect would come back
  // shrunk by that scale and leave the pill too small and too far left.
  return {
    left: chosen.offsetLeft,
    top: chosen.offsetTop,
    width: chosen.offsetWidth,
    height: chosen.offsetHeight,
  }
}

/**
 * The raised white background of a segmented control, as one element that
 * slides to whichever choice is on rather than a background that blinks from
 * one choice to the next. Luma's switcher does the same thing.
 *
 * The caller puts the returned ref on the track, spreads `pillProps` onto a
 * `<span>` inside it, and drops the background off the chosen button. The
 * track needs `relative`, and the buttons need `relative` so they draw above
 * the pill.
 *
 * `selected` finds the chosen button, `observe` finds all of them, and
 * `attributes` names the attribute that marks the choice, so the pill moves
 * the moment it changes.
 */
export function useSlidingPill<T extends HTMLElement>({
  selected,
  observe,
  attributes,
  className,
}: {
  selected: string
  observe: string
  attributes: string[]
  className?: string
}) {
  const trackRef = React.useRef<T | null>(null)
  const [pill, setPill] = React.useState<PillBox | null>(null)
  // The first placement jumps into position. Only later moves slide, otherwise
  // the pill flies in from the left edge every time the control mounts.
  const [slides, setSlides] = React.useState(false)

  React.useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return

    // jsdom has no ResizeObserver, and a component test that renders one of
    // these controls should not fail over the pill following a resize.
    const sizes =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => setPill(readPill(track, selected)))
        : null
    const watchButtons = () => {
      if (!sizes) return
      sizes.disconnect()
      sizes.observe(track)
      for (const button of track.querySelectorAll(observe)) sizes.observe(button)
    }

    const choice = new MutationObserver(() => {
      watchButtons()
      setPill(readPill(track, selected))
    })
    choice.observe(track, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: attributes,
    })

    watchButtons()
    setPill(readPill(track, selected))
    const settle = requestAnimationFrame(() => setSlides(true))

    return () => {
      cancelAnimationFrame(settle)
      choice.disconnect()
      sizes?.disconnect()
    }
    // The selectors are constants written at the call site, and re-running on a
    // new array identity would restart the observers on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    trackRef,
    // Until the pill has been measured there is nothing to draw, and the
    // server cannot measure anything. The track says so, and the chosen button
    // wears its own background for that stretch through an `in-data-[pill=…]`
    // class, so a page arrives with the right button already raised. On a dev
    // build the tabs are on screen about two seconds before the browser has
    // run enough JavaScript to place the pill.
    trackProps: { "data-pill": pill ? "placed" : "pending" },
    pillProps: {
      "aria-hidden": true as const,
      // A theme change freezes every transition on the page for two frames.
      // The colour-mode switcher moves this pill at exactly that moment, so
      // the pill says it keeps its own motion. See `light-dark-switcher.tsx`.
      "data-keep-motion": "" as const,
      className: cn(
        "pointer-events-none absolute z-0 bg-background shadow-sm",
        pill ? "opacity-100" : "opacity-0",
        slides && "transition-[left,top,width,height,opacity]",
        slidingPillMotionClassName,
        className
      ),
      style: pill
        ? {
            left: pill.left,
            top: pill.top,
            width: pill.width,
            height: pill.height,
          }
        : undefined,
    },
  }
}
