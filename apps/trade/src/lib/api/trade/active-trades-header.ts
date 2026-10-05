import { createServerFn } from "@tanstack/react-start"

import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import {
  activeTradesFigures,
  type ActiveTradesFigures,
} from "@/lib/trade/dashboard/active-trades"
import { adminGet } from "@/server/guards"
import {
  readHeaderFigures,
  saveHeaderFigures,
} from "@/server/trade/header-figures"
import { loadActiveTradesSnapshot } from "@/server/trade/trading-overview"

export type ActiveTradesHeaderSnapshot = {
  snapshot: ActiveTradesSnapshot
}

const loadActiveTradesHeaderFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ActiveTradesHeaderSnapshot> => {
    const snapshot = await loadActiveTradesSnapshot(context.user.id)
    // Remembered only when the read came out whole, so the next page load has
    // something true to draw while it waits for its own read. A failure here
    // is not worth losing the snapshot over: the button still gets its
    // figures, and the next read in fifteen seconds writes them again.
    const figures = activeTradesFigures(snapshot)
    if (figures) {
      try {
        await saveHeaderFigures(context.user.id, figures)
      } catch {
        // Left as it was on purpose.
      }
    }
    return { snapshot }
  })

export function loadActiveTradesHeader() {
  return loadActiveTradesHeaderFn()
}

/**
 * The figures the button last managed to say, answered without touching an
 * exchange.
 *
 * Asked for alongside the real read and lands in a fraction of the time, so
 * the button shows the last known numbers immediately instead of two dashes
 * for the several seconds the exchanges take.
 */
const loadLastHeaderFiguresFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ActiveTradesFigures | null> => {
    return readHeaderFigures(context.user.id)
  })

export function loadLastHeaderFigures() {
  return loadLastHeaderFiguresFn()
}
