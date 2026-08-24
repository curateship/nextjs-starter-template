// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SmartOrdersPanel } from "@/components/trade/smart-orders-panel"
import { writeSmartOrdersCache } from "@/lib/trade/dashboard-cache"
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
  cacheScope: "test:hyperliquid",
  positions: [],
  fills: [],
  trades: [],
  markets: new Map(),
  wallets: [],
  walletName: () => "Main",
  selectedMarketKey: null,
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

const grid = {
  ...ladder,
  id: "grid",
  kind: "grid",
  plan: {
    levels: [
      { status: "waiting", heldSz: 0, buyPx: 10 },
      { status: "waiting", heldSz: 0, buyPx: 20 },
      { status: "waiting", heldSz: 0, buyPx: 30 },
      ...Array.from({ length: 7 }, () => ({
        status: "holding",
        heldSz: 1,
        buyPx: 10,
      })),
    ],
  },
} as unknown as SmartOrder

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

  it("draws the last complete answer while the new read is still landing", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    writeSmartOrdersCache(shared.cacheScope, [ladder])
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[]}
          settled={false}
          failed={false}
        />
      )
    })

    expect(host.textContent).toContain("XMR")
    expect(host.textContent).not.toContain(READING)
    await act(async () => root.unmount())
  })

  it("puts the three-dot detail button at the right of the market row", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[ladder]}
          settled
          failed={false}
        />
      )
    })

    const details = host.querySelector(
      'button[aria-label="Open XMR smart order details"]'
    )
    expect(details?.previousElementSibling?.textContent).toContain("XMR")
    expect(details?.previousElementSibling?.className).toContain("min-h-10")
    expect(
      details?.previousElementSibling?.querySelector(".text-sm")?.textContent
    ).toBe("XMR")
    expect(
      host.querySelector('[data-slot="workspace-panel-header"]')?.className
    ).toContain("h-[3.15rem]")
    expect(details?.querySelector(".lucide-ellipsis-vertical")).not.toBeNull()
    expect(details?.parentElement?.className).toContain("hover:bg-muted/40")
    await act(async () => root.unmount())
    host.remove()
  })

  it("keeps the charted smart order selected across the whole row", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    function SelectedSmartOrder() {
      const [selectedMarketKey, setSelectedMarketKey] = useState<string | null>(
        null
      )
      return (
        <SmartOrdersPanel
          {...shared}
          smartOrders={[ladder]}
          selectedMarketKey={selectedMarketKey}
          settled
          failed={false}
          onSelectMarket={setSelectedMarketKey}
        />
      )
    }

    await act(async () => root.render(<SelectedSmartOrder />))
    const details = host.querySelector(
      'button[aria-label="Open XMR smart order details"]'
    )
    await act(async () =>
      (details?.previousElementSibling as HTMLButtonElement | null)?.click()
    )

    expect(details?.parentElement?.className).toContain("bg-muted/60")
    expect(details?.parentElement?.className).toContain("hover:bg-muted/60")
    await act(async () => root.unmount())
    host.remove()
  })

  it("moves grid progress and held funds into the popover", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SmartOrdersPanel
          {...shared}
          smartOrders={[grid]}
          settled
          failed={false}
        />
      )
    })
    expect(host.textContent).not.toContain("3 waiting · 7 completed")
    expect(host.textContent).not.toContain("$70.00")

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Open XMR smart order details"]'
        )
        ?.click()
    })

    expect(document.body.textContent).toContain("3 waiting · 7 completed")
    expect(document.body.textContent).toContain("Held to sell$70.00")
    await act(async () => root.unmount())
    host.remove()
  })

  it("says an active smart order cannot act after its key expires", () => {
    const markup = renderToStaticMarkup(
      <SmartOrdersPanel
        {...shared}
        smartOrders={[ladder]}
        wallets={[
          {
            id: "w1",
            label: "Main",
            kind: "live",
            status: "active",
            protocol: "hyperliquid",
            network: "mainnet",
            startingBalance: 1_000,
            address: "0x1",
            hasKey: true,
            keyValidUntil: Date.now() - 1,
          },
        ]}
        settled
        failed={false}
      />
    )
    expect(markup).toContain("Trading key expired. This ladder will not act.")
    expect(markup).not.toContain("1 rung waiting")
  })
})
