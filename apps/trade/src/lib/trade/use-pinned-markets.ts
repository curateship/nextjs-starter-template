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
    async refresh() {
      if (state.busy) return
      const readingVersion = ++version
      publish({ ...state, quotes: withoutPrices(state.quotes) })
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
