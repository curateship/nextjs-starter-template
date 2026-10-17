import * as React from "react"
import { useRouterState } from "@tanstack/react-router"

/** A page that arrives inside this long never shows the bar at all. */
export const PAGE_LOADING_BAR_DELAY_MS = 200

/**
 * The thin line across the very top of the window while the next page loads.
 *
 * The router keeps the old page on screen until the new one has its data, so
 * without this a click on a slow page looks like it did nothing. Only a
 * change of address counts: `router.invalidate()` after a save also sets the
 * router pending, but the page is not changing, and a bar then would say
 * something is loading that the person never asked for.
 *
 * The line grows most of the way on its own and only reaches the far edge
 * when the page is ready, then fades. It is drawn with the Web Animations API
 * because the keyframes would otherwise have to live in the shell's
 * stylesheet. Reduced motion gets a still line that appears and disappears.
 *
 * `pointer-events-none` because it sits over the header's own controls. It
 * is drawn once, from the root route, so signed-out pages get it too.
 */
export function PageLoadingBar() {
  const changingPage = useRouterState({
    select: (state) =>
      state.status === "pending" &&
      state.location.href !== state.resolvedLocation?.href,
  })
  const bar = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const element = bar.current
    if (!element || !changingPage) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let growing: Animation | undefined
    const show = window.setTimeout(() => {
      growing = element.animate(
        still
          ? [{ opacity: 1, transform: "scaleX(1)" }]
          : [
              { opacity: 1, transform: "scaleX(0)" },
              { opacity: 1, transform: "scaleX(0.9)" },
            ],
        {
          duration: still ? 0 : 8000,
          easing: "cubic-bezier(0.1, 0.6, 0.3, 1)",
          fill: "forwards",
        }
      )
    }, PAGE_LOADING_BAR_DELAY_MS)

    return () => {
      window.clearTimeout(show)
      if (!growing) return
      const reached = getComputedStyle(element).transform
      growing.cancel()
      if (still) return
      element.animate(
        [
          { opacity: 1, transform: reached },
          { opacity: 1, transform: "scaleX(1)", offset: 0.4 },
          { opacity: 0, transform: "scaleX(1)" },
        ],
        { duration: 400, easing: "ease-out" }
      )
    }
  }, [changingPage])

  return (
    <div
      ref={bar}
      aria-hidden
      data-testid="page-loading-bar"
      className="pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 origin-left bg-primary opacity-0"
    />
  )
}
