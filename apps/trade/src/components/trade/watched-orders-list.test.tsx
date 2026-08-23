import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { WatchedOrdersList } from "@/components/trade/watched-orders-list"
import type { PaperOrder } from "@/lib/trade/paper"

/**
 * The Watched tab's four answers, told apart.
 *
 * "Nothing is waiting", "still reading" and "could not read" are different
 * answers and only the first is safe to act on. The fourth is the one that
 * caused the bug this file exists for: HALF a read is not an answer either.
 *
 * The trading read comes back in two halves, practice and real, and either may
 * land first. A person whose waiting levels are all on real wallets has an
 * empty practice half in their hands for a second or two, and for that second
 * the tab used to say nothing was waiting — on every dashboard, every time the
 * tab was opened, because the empty half was also written to the cache the tab
 * opens from. `settled` is the fact it waits for now.
 */

const EMPTY = "Nothing is waiting at a price"
const READING = "Reading your watched prices"

const shared = {
  cacheScope: "test:hyperliquid",
  refusals: new Map(),
  walletName: () => "Main",
  onRetry: () => {},
  onSelectMarket: () => {},
}

const waitingLevel: PaperOrder = {
  id: "one",
  walletId: "w1",
  marketKey: "hyperliquid:mainnet:XMR",
  side: "buy",
  px: 90,
  sz: 1,
  leverage: 5,
  maxLeverage: 20,
  reduceOnly: false,
  tpPx: null,
  slPx: null,
  createdAt: 1,
  updatedAt: 1,
  watched: true,
}

function draw(state: {
  orders: readonly PaperOrder[]
  settled: boolean
  failed: boolean
}): string {
  return renderToStaticMarkup(<WatchedOrdersList {...shared} {...state} />)
}

describe("the Watched tab", () => {
  it("says nothing is waiting only once both halves have answered", () => {
    expect(draw({ orders: [], settled: true, failed: false })).toContain(EMPTY)
  })

  it("keeps reading while only one half has landed", () => {
    const half = draw({ orders: [], settled: false, failed: false })
    expect(half).not.toContain(EMPTY)
    expect(half).toContain(READING)
  })

  it("keeps reading before either half has landed", () => {
    const none = draw({ orders: [], settled: false, failed: false })
    expect(none).toContain(READING)
  })

  it("keeps reading when one half refused and the other brought nothing", () => {
    // `failed` is only both halves refusing. One refusing on its own leaves
    // its levels unread, and unread must never be drawn as none.
    const halfRefused = draw({ orders: [], settled: false, failed: false })
    expect(halfRefused).not.toContain(EMPTY)
    expect(halfRefused).toContain(READING)
  })

  it("says the read refused rather than claiming nothing is waiting", () => {
    const refused = draw({ orders: [], settled: true, failed: true })
    expect(refused).not.toContain(EMPTY)
    expect(refused).toContain("could not be read")
  })

  it("draws the levels it has", () => {
    const rows = draw({ orders: [waitingLevel], settled: true, failed: false })
    expect(rows).not.toContain(EMPTY)
    expect(rows).toContain("XMR")
    expect(rows).not.toContain("<img")
  })

  it("draws the levels the landed half brought, without waiting for the other", () => {
    const half = draw({ orders: [waitingLevel], settled: false, failed: false })
    expect(half).toContain("XMR")
    expect(half).not.toContain(READING)
  })
})
