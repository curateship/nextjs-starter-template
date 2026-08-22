import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SmartOrdersPanel } from "@/components/trade/smart-orders-panel"
import { ladderPlanSchema } from "@/lib/trade/dca"
import type { SmartOrder } from "@/lib/trade/smart-plan"

/**
 * The Smart orders panel's three answers, told apart.
 *
 * "Nothing of yours is working", "still reading" and "could not read" are
 * different answers, and only the first is safe to act on. The panel used to
 * give the first one whatever had happened, so a ladder holding real money
 * read as no ladder at all for as long as the exchange took to answer.
 *
 * **Still reading includes half-read.** The trading read lands in two halves,
 * practice and real, and either may be first. A person whose ladders are all
 * on real wallets holds an empty practice half for a second or two, and that
 * half is not an answer. `settled` is both halves being in.
 */

const EMPTY = "No ladder or grid of your own is working"
const READING = "Reading your smart orders"

const shared = {
  positions: [],
  fills: [],
  trades: [],
  markets: new Map(),
  walletName: () => "Main",
  onRetry: () => {},
  onSelectMarket: () => {},
}

/** One hand-placed ladder with a single rung still waiting. */
const ladder: SmartOrder = {
  id: "one",
  walletId: "w1",
  marketKey: "hyperliquid:mainnet:XMR",
  status: "active",
  kind: "dca",
  flowRunId: null,
  createdAt: 1,
  updatedAt: 1,
  // Parsed rather than written out, so the schema fills every field this
  // panel does not read and the fixture cannot drift from the real shape.
  plan: ladderPlanSchema.parse({
    anchorPx: 100,
    sizeDecimals: 2,
    maxLeverage: 20,
    rungs: [
      {
        px: 95,
        sz: 1,
        status: "waiting",
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      },
    ],
    takeProfit: null,
    stopLoss: null,
    aimedTpPx: null,
    aimedSlPx: null,
    twoGreen: false,
    greenInterval: null,
    green: null,
  }),
}

function draw(state: {
  smartOrders: readonly SmartOrder[]
  settled: boolean
  failed: boolean
}): string {
  return renderToStaticMarkup(<SmartOrdersPanel {...shared} {...state} />)
}

describe("the Smart orders panel", () => {
  it("says nothing is working only once both halves have answered", () => {
    const answered = draw({ smartOrders: [], settled: true, failed: false })
    expect(answered).toContain(EMPTY)
    expect(answered).toContain("none working")
  })

  it("keeps reading before both halves have landed", () => {
    const half = draw({ smartOrders: [], settled: false, failed: false })
    expect(half).not.toContain(EMPTY)
    expect(half).not.toContain("none working")
    expect(half).toContain(READING)
  })

  it("says the read refused rather than claiming nothing is working", () => {
    const refused = draw({ smartOrders: [], settled: true, failed: true })
    expect(refused).not.toContain(EMPTY)
    expect(refused).toContain("could not be read")
  })

  it("draws the orders the landed half brought, without waiting for the other", () => {
    const half = draw({ smartOrders: [ladder], settled: false, failed: false })
    expect(half).toContain("XMR")
    expect(half).not.toContain(READING)
  })
})
