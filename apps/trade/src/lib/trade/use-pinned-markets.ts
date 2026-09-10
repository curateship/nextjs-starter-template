import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"

import {
  loadHeaderPinnedMarkets,
  saveHeaderPinnedMarket,
} from "@/lib/api/trade/pinned-markets"
import {
  changePinnedMarkets,
  type PinnedMarketQuote,
} from "@/lib/trade/pinned-markets"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
type State = {
  pins: string[]
  quotes: PinnedMarketQuote[]
  loaded: boolean
  busy: boolean
  failed: boolean
}
const empty: State = {
  pins: [],
  quotes: [],
  loaded: false,
  busy: false,
  failed: false,
}

function withoutPrices(quotes: PinnedMarketQuote[]) {
  return quotes.map((quote) => ({ ...quote, price: null, change24h: null }))
}

function createStore() {
  let state = empty
  let version = 0
  const listeners = new Set<() => void>()
  const publish = (next: State) => {
    state = next
    listeners.forEach((notify) => notify())
  }
  return {
    getSnapshot: () => state,
    subscribe: (notify: () => void) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    clearPrices: () => {
      version += 1
      publish({ ...state, quotes: withoutPrices(state.quotes) })
    },
    /**
     * A refresh LEAVES THE FIGURES ON SCREEN while it waits.
     *
     * It used to blank them the moment a read started, so every fifteen
     * seconds each chip lost its percentage, shrank to the width of a dash,
     * and grew back when the answer landed. The row jumped on a clock. The
     * number a chip shows is at most fifteen seconds old either way, and a
     * reader cannot tell a blank from a dead market — so the old figure
     * stays until a new one replaces it.
     *
     * A read that FAILS still blanks them, because that is the case where
     * the age of the number is genuinely unknown.
     */
    async refresh() {
      if (state.busy) return
      const readingVersion = ++version
      try {
        const answer = await loadHeaderPinnedMarkets()
        if (version === readingVersion)
          publish({ ...state, ...answer, loaded: true, failed: false })
      } catch {
        if (version === readingVersion)
          publish({ ...state, quotes: withoutPrices(state.quotes), failed: true })
      }
    },
    async setPin(key: string, pinned: boolean) {
      if (!state.loaded || state.busy) return
      const before = state
      let pins: string[]
      try {
        pins = changePinnedMarkets(state.pins, key, pinned)
      } catch (error) {
        showErrorToast(error instanceof Error ? error.message : "The pin could not be changed.")
        return
      }
      version += 1
      publish({ ...state, pins, busy: true })
      try {
        const answer = await saveHeaderPinnedMarket(key, pinned)
        publish({ ...state, pins: answer.pins, busy: false })
        if (answer.error) showErrorToast(answer.error)
      } catch {
        publish({ ...before, quotes: withoutPrices(before.quotes), busy: false })
        showErrorToast("The header pin could not be saved. Try again.")
      }
    },
  }
}
const stores = new Map<string, ReturnType<typeof createStore>>()

export function usePinnedMarkets() {
  const { user } = authenticatedRoute.useLoaderData()
  let store =
    typeof window === "undefined" ? createStore() : stores.get(user.id)
  if (!store) {
    store = createStore()
    stores.set(user.id, store)
  }
  const state = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => empty
  )
  return { ...state, store }
}
