import * as React from "react"

import {
  loadActiveTradesHeader,
  loadLastHeaderFigures,
} from "@/lib/api/trade/active-trades-header"
import {
  getPanelLayoutErrorMessage,
  loadHiddenTradeColumns,
  saveHiddenTradeColumns,
} from "@/lib/api/trade/panel-layouts"
import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import {
  activeTradesFigures,
  mergeActiveTradesSnapshot,
} from "@/lib/trade/dashboard/active-trades"
import type {
  HiddenTradeColumns,
  TradesPopoverKind,
} from "@/lib/trade/trades-popover-columns"
import { showErrorToast } from "@/lib/toast/error-toast"

const REFRESH_MS = 15_000

type Figures = NonNullable<ReturnType<typeof activeTradesFigures>>

type ActiveTradesState = {
  snapshot: ActiveTradesSnapshot | null
  /**
   * **The button keeps the figures it last had until better ones arrive**
   * (Tyler, 29 Sep 2026). A read where one exchange does not answer has no
   * total to draw, and blanking both figures to dashes for a few seconds made
   * the button flicker empty while nothing was wrong with the trades. Dashes
   * are now only the first read, before any total has ever landed.
   */
  figures: Figures | null
  failed: boolean
}

const NOTHING_YET: ActiveTradesState = {
  snapshot: null,
  figures: null,
  failed: false,
}

/**
 * Every open trade across the person's wallets, read once for the whole page.
 *
 * The header's Active trades button and the bottom bar's Positions panel under
 * 1280px show the same list (Tyler, 13 Nov 2026: "the positions tab is
 * supposed to use the active trades table in navigation"), so they share this
 * one read every 15 seconds rather than asking the exchanges twice. The read
 * starts with the first thing that shows the list and stops, forgetting what
 * it held, when the last one goes.
 */
const activeTrades = (() => {
  let state = NOTHING_YET
  const listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  let timer: number | null = null
  // Bumped when the last reader goes, so an answer to a read made before that
  // never lands in the next reader's empty list.
  let generation = 0

  const publish = (next: Partial<ActiveTradesState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const refresh = (): Promise<void> => {
    if (inFlight) return inFlight
    const asked = generation
    const request = (async () => {
      try {
        const fresh = await loadActiveTradesHeader()
        if (asked !== generation) return
        const merged = state.snapshot
          ? mergeActiveTradesSnapshot(state.snapshot, fresh.snapshot)
          : fresh.snapshot
        publish({
          snapshot: merged,
          figures: activeTradesFigures(merged) ?? state.figures,
          failed: false,
        })
      } catch {
        if (asked === generation) publish({ failed: true })
      }
    })()
    inFlight = request
    void request.finally(() => {
      if (inFlight === request) inFlight = null
    })
    return request
  }

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }
  const schedule = () => {
    if (listeners.size === 0 || document.visibilityState !== "visible") return
    clearTimer()
    timer = window.setTimeout(run, REFRESH_MS)
  }
  function run() {
    clearTimer()
    if (listeners.size === 0 || document.visibilityState !== "visible") return
    void refresh().finally(schedule)
  }
  const onVisibilityChange = () => {
    clearTimer()
    if (document.visibilityState === "visible") run()
  }

  const start = () => {
    const asked = generation
    // The figures the button last managed to say, fetched beside the real read
    // and back in a fraction of the time, because it touches no exchange.
    // Tyler, 4 October 2026: "Just show the old numbers until theres a new
    // one." It only ever fills figures that are still empty, so an answer that
    // arrives late can never put an old total back over a fresh one.
    void loadLastHeaderFigures()
      .then((last) => {
        if (asked !== generation || !last || state.figures) return
        publish({ figures: last })
      })
      .catch(() => {
        // Nothing to say. The real read is already on its way.
      })
    run()
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  const stop = () => {
    clearTimer()
    document.removeEventListener("visibilitychange", onVisibilityChange)
    generation += 1
    inFlight = null
    state = NOTHING_YET
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    read: () => state,
    refresh,
  }
})()

const readNothing = () => NOTHING_YET

/** The shared list of open trades, its header figures, and a way to retry. */
export function useActiveTrades() {
  const state = React.useSyncExternalStore(
    activeTrades.subscribe,
    activeTrades.read,
    readNothing
  )
  return { ...state, refresh: activeTrades.refresh }
}

/**
 * The columns hidden in the panel's two tables, from the ⋮ beside its Filter,
 * shared by every place the panel is drawn. Read once when the first of them
 * mounts and saved on the account, never in the browser, because the embedded
 * preview drops localStorage writes. Until the read lands, every column shows;
 * a failed read leaves them all showing.
 */
const hiddenColumns = (() => {
  let hidden: HiddenTradeColumns = {}
  let changed = false
  let writeQueue: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()
  let generation = 0

  const publish = (next: HiddenTradeColumns) => {
    hidden = next
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) {
        const asked = generation
        void loadHiddenTradeColumns()
          .then((saved) => {
            // A press made before the read landed wins over what was saved.
            if (asked === generation && !changed) publish(saved)
          })
          .catch(() => {
            // Every column showing is a safe way to be wrong.
          })
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        generation += 1
        changed = false
        hidden = {}
      }
    },
    read: () => hidden,
    change(kind: TradesPopoverKind, columns: string[]) {
      changed = true
      publish({ ...hidden, [kind]: columns })
      // In press order, so a slow earlier save cannot land after a newer one.
      const write = writeQueue.then(() => saveHiddenTradeColumns(kind, columns))
      writeQueue = write.then(
        () => undefined,
        () => undefined
      )
      void write.catch((error: unknown) =>
        showErrorToast(getPanelLayoutErrorMessage(error))
      )
    },
  }
})()

const NONE_HIDDEN: HiddenTradeColumns = {}
const readNoneHidden = () => NONE_HIDDEN

export function useHiddenTradeColumns() {
  const hidden = React.useSyncExternalStore(
    hiddenColumns.subscribe,
    hiddenColumns.read,
    readNoneHidden
  )
  return { hidden, change: hiddenColumns.change }
}
