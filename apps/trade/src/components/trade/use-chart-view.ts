import * as React from "react"

import { saveRememberedChartView } from "@/lib/api/chart-view"
import { sameView, type ChartView } from "@/lib/trade/chart-view"

/** How long the chart must sit still before the view is written down. */
const SETTLE_MS = 800

/**
 * The chart's zoom and scroll, remembered against the account.
 *
 * It starts as whatever the page loaded with — read in the route's loader, so
 * the first chart drawn is already at the right zoom rather than framing its
 * whole history and jumping a beat later.
 *
 * Nothing here is React state, on purpose. The view changes on every frame of
 * a pan, and the one thing that needs it — a chart being framed as it opens —
 * asks for it at that moment through `readView`. Holding it in state instead
 * would re-render the panel a hundred times per gesture to tell the chart
 * something it is already showing.
 *
 * Saving waits for the chart to sit still, because a pan is a hundred small
 * movements and this database is a long way off. Nothing on screen waits for
 * it either: the view is already where it is, so a write that fails loses the
 * memory and nothing else, and a toast about it would interrupt somebody
 * mid-gesture who did not ask for anything.
 */
export function useRememberedChartView(initial: ChartView | null) {
  const viewRef = React.useRef(initial)
  const savedRef = React.useRef(initial)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const write = React.useCallback((next: ChartView) => {
    if (sameView(savedRef.current, next)) return
    savedRef.current = next
    saveRememberedChartView(next).catch(() => {
      // The next movement tries again; nothing on screen is wrong meanwhile.
      savedRef.current = null
    })
  }, [])

  // Leaving the page with a movement still waiting out its pause would throw
  // that movement away — and the last thing somebody did before navigating is
  // exactly the thing they expect to come back to. So it goes now instead.
  React.useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      if (viewRef.current) write(viewRef.current)
    }
  }, [write])

  const readView = React.useCallback(() => viewRef.current, [])

  const onViewChange = React.useCallback(
    (next: ChartView) => {
      viewRef.current = next
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        write(next)
      }, SETTLE_MS)
    },
    [write]
  )

  return { readView, onViewChange }
}
