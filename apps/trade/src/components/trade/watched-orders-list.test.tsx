// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { WatchedOrdersList } from "@/components/trade/watched-orders-list"
import type { LiveRefusal } from "@/lib/trade/live"
import type { MarketRow } from "@/lib/protocols/contracts"
import type { TradeOrder, TradePosition } from "@/lib/trade/paper"
import type { SmartOrder } from "@/lib/trade/smart-plan"

/**
 * The Manual orders panel's four answers, told apart.
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
  positions: [],
  smartOrders: [],
  markets: [],
  cacheScope: "test:hyperliquid",
  refusals: new Map(),
  walletName: () => "Main",
  onRetry: () => {},
  onSelectMarket: () => {},
  selectedKey: null,
}

const waitingLevel: TradeOrder = {
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

const xmrMarket = {
  key: "hyperliquid:mainnet:XMR",
  marketId: "XMR",
  symbol: "XMR",
  quoteAsset: "USDC",
  subExchange: null,
  category: "crypto",
  sizeDecimals: 3,
  priceTick: null,
  minOrderValueUsd: null,
  maxLeverage: 20,
  isolatedOnly: false,
  iconUrl: null,
  price: 100,
  change24h: 0,
  volume24hUsd: 1_000_000,
  fundingHourly: null,
  openInterestUsd: null,
} satisfies MarketRow

const heldCoin: TradePosition = {
  id: "p1",
  walletId: "w1",
  marketKey: "hyperliquid:mainnet:SOL",
  szi: 4,
  entryPx: 90,
  leverage: 2,
  maxLeverage: 20,
  targets: [],
  tpPx: null,
  slPx: null,
  feesPaid: 1,
  updatedAt: 1,
}

const solMarket = {
  ...xmrMarket,
  key: heldCoin.marketKey,
  marketId: "SOL",
  symbol: "SOL",
  price: 100,
} satisfies MarketRow

function draw(state: {
  orders: readonly TradeOrder[]
  positions?: readonly TradePosition[]
  smartOrders?: readonly SmartOrder[]
  markets?: readonly MarketRow[]
  settled: boolean
  failed: boolean
  refusals?: ReadonlyMap<string, LiveRefusal>
  selectedKey?: string | null
}): string {
  return renderToStaticMarkup(
    <WatchedOrdersList
      {...shared}
      {...state}
      refusals={state.refusals ?? shared.refusals}
    />
  )
}

describe("the Manual orders list", () => {
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

  it("shows retry progress as information and a persistent refusal as an error", () => {
    const key = waitingLevel.id
    const refusal = {
      walletId: waitingLevel.walletId,
      marketKey: waitingLevel.marketKey,
      smartOrderId: waitingLevel.id,
      at: 2,
      note: "Trade is checking the price and trying again.",
      retrying: true,
    }
    const progress = draw({
      orders: [waitingLevel],
      settled: true,
      failed: false,
      refusals: new Map([[key, refusal]]),
    })
    expect(progress).toContain(refusal.note)
    expect(progress).toContain("lucide-info")
    expect(progress).not.toContain("text-destructive")
    const failed = draw({
      orders: [waitingLevel],
      settled: true,
      failed: false,
      refusals: new Map([
        [key, { ...refusal, retrying: false, note: "The order paused." }],
      ]),
    })
    expect(failed).toContain("The order paused.")
    expect(failed).toContain("text-destructive")
  })

  it("draws the levels it has", () => {
    const rows = draw({ orders: [waitingLevel], settled: true, failed: false })
    expect(rows).not.toContain(EMPTY)
    expect(rows).toContain("XMR")
    expect(rows).not.toContain("<img")
  })

  it("shows only the nearest order when one market has several", () => {
    const farther = { ...waitingLevel, id: "farther", px: 80, sz: 1 }
    const nearest = {
      ...waitingLevel,
      id: "nearest",
      px: 99,
      sz: 2,
      createdAt: 0,
    }
    const rows = draw({
      orders: [farther, nearest],
      markets: [xmrMarket],
      settled: true,
      failed: false,
    })

    expect(rows.match(/>XMR</g)).toHaveLength(1)
    expect(rows).toContain("$198")
    expect(rows).not.toContain("$80")
  })

  it("marks the row whose market is on the chart as the selected one", () => {
    const rows = draw({
      orders: [waitingLevel],
      settled: true,
      failed: false,
      selectedKey: waitingLevel.marketKey,
    })
    expect(rows).toContain('data-state="selected"')
  })

  it("draws the levels the landed half brought, without waiting for the other", () => {
    const half = draw({ orders: [waitingLevel], settled: false, failed: false })
    expect(half).toContain("XMR")
    expect(half).not.toContain(READING)
  })

  it("does not attach another order's refusal to a watch on the same coin", () => {
    // PONS, 18 Sep 2026: a filled sell's refusal, made after this watch
    // began, showed under it as a red error.
    const note = "A refusal from another order on this coin"
    const newWatch = waitingLevel
    const refusals = new Map([
      [
        "another-order",
        {
          walletId: newWatch.walletId,
          marketKey: newWatch.marketKey,
          smartOrderId: "another-order",
          note,
          at: newWatch.createdAt + 1,
        },
      ],
    ])

    expect(
      draw({ orders: [newWatch], settled: true, failed: false, refusals })
    ).not.toContain(note)
  })

  it("puts what you hold above what you are waiting for, with its profit", () => {
    // PnL sorts the list by default, and a waiting level has none, so it sits
    // below every holding whichever way the column points.
    const rows = draw({
      orders: [waitingLevel],
      positions: [heldCoin],
      markets: [xmrMarket, solMarket],
      settled: true,
      failed: false,
    })

    // 4 coins bought at $90, now $100, less $1 of fees.
    expect(rows).toContain("+$39.00")
    // Worth 4 × $100 today.
    expect(rows).toContain("$400")
    expect(rows.indexOf(">SOL<")).toBeLessThan(rows.indexOf(">XMR<"))
    // Type is what tells a holding from a level now that both are one table.
    expect(rows).toContain(">Long<")
    expect(rows).toContain(">Buy<")
  })

  it("says a losing holding in red and a winning one in green", () => {
    const losing = draw({
      orders: [],
      positions: [{ ...heldCoin, entryPx: 120 }],
      markets: [solMarket],
      settled: true,
      failed: false,
    })
    expect(losing).toContain("-$81.00")
    expect(losing).toContain("text-destructive")

    const winning = draw({
      orders: [],
      positions: [heldCoin],
      markets: [solMarket],
      settled: true,
      failed: false,
    })
    expect(winning).toContain("text-emerald-600")
  })

  it("leaves a coin a grid or ladder is running to the Smart orders panel", () => {
    const grid = {
      id: "g1",
      walletId: heldCoin.walletId,
      marketKey: heldCoin.marketKey,
      kind: "grid",
      flowRunId: null,
      plan: {},
    } as unknown as SmartOrder

    const rows = draw({
      orders: [],
      positions: [heldCoin],
      smartOrders: [grid],
      markets: [solMarket],
      settled: true,
      failed: false,
    })

    expect(rows).not.toContain(">SOL<")
    expect(rows).toContain(EMPTY)
  })

  it("keeps a coin an automation is running, which no panel here shows", () => {
    // A flow's ladder lives on its own run dashboard, not in the Smart orders
    // panel above, so dropping its coin took it off the screen altogether.
    const flowLadder = {
      id: "d1",
      walletId: heldCoin.walletId,
      marketKey: heldCoin.marketKey,
      kind: "dca",
      flowRunId: "run1",
      plan: {},
    } as unknown as SmartOrder

    const rows = draw({
      orders: [],
      positions: [heldCoin],
      smartOrders: [flowLadder],
      markets: [solMarket],
      settled: true,
      failed: false,
    })

    expect(rows).toContain(">SOL<")
  })

  it("keeps a coin whose only smart order is the watch waiting on it", () => {
    const watch = {
      id: "w9",
      walletId: heldCoin.walletId,
      marketKey: heldCoin.marketKey,
      kind: "watch",
      flowRunId: null,
      plan: {},
    } as unknown as SmartOrder

    const rows = draw({
      orders: [],
      positions: [heldCoin],
      smartOrders: [watch],
      markets: [solMarket],
      settled: true,
      failed: false,
    })

    expect(rows).toContain(">SOL<")
  })

  it("says nothing about waiting prices when a holding is on screen alone", () => {
    const rows = draw({
      orders: [],
      positions: [heldCoin],
      markets: [solMarket],
      settled: true,
      failed: false,
    })
    expect(rows).not.toContain(EMPTY)
  })

  it("shows a refusal made while this watch was active", () => {
    const note = "The exchange refused this watch"
    const refusals = new Map([
      [
        waitingLevel.id,
        {
          walletId: waitingLevel.walletId,
          marketKey: waitingLevel.marketKey,
          smartOrderId: waitingLevel.id,
          note,
          at: waitingLevel.createdAt + 1,
        },
      ],
    ])

    expect(
      draw({ orders: [waitingLevel], settled: true, failed: false, refusals })
    ).toContain(note)
  })
})

/**
 * The panel is the Smart orders panel's twin, one panel down. Tyler asked on
 * 14 Sep 2026 for the rows to read the same way: the side as a toned badge,
 * Held quiet, and no pill on a level the price has already come to.
 */
it("wears the Smart orders row: a toned side badge, a quiet Held, no reached pill", () => {
  const rows = draw({
    orders: [waitingLevel],
    positions: [heldCoin],
    markets: [xmrMarket, solMarket],
    settled: true,
    failed: false,
  })

  // Long is green and Buy is green, each in the shared badge shape.
  expect(rows).toContain("rounded-md px-1.5 py-0.5 text-xs font-medium")
  expect(rows.match(/emerald/g)?.length).toBeGreaterThan(1)
  // Held sits in the muted colour, PnL keeps the money colour.
  expect(rows).toContain('<span class="text-muted-foreground">$400</span>')
})

it("draws no distance on a level the price has already reached", () => {
  // The mark sits at the buy level, so the old pill would have read "reached".
  const rows = draw({
    orders: [waitingLevel],
    markets: [{ ...xmrMarket, price: waitingLevel.px }],
    settled: true,
    failed: false,
  })

  expect(rows).not.toContain("reached")
  expect(rows).toContain(">XMR<")
})

/**
 * Where a waiting level's distance lives, and where its row sits.
 *
 * Tyler asked on 14 Sep 2026 for the distance to move into the PnL column in
 * a light grey, so it reads as "not a profit" at a glance, and for waiting
 * levels to stay under the holdings no matter which column is sorted.
 */
it("puts the distance in the PnL column, muted, never in the money colours", () => {
  const rows = draw({
    orders: [waitingLevel],
    positions: [heldCoin],
    markets: [xmrMarket, solMarket],
    settled: true,
    failed: false,
  })

  // The distance sits in the last cell of its row, muted and a size smaller
  // than the money around it.
  expect(rows).toContain(
    '<span class="text-[10px] text-muted-foreground">11.11% away</span>'
  )
  // And it is not wearing the old green pill any more.
  expect(rows).not.toContain("11.11% away</span></span>")
})

it("keeps waiting levels under the holdings whichever column is sorted", () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <WatchedOrdersList
        {...shared}
        orders={[waitingLevel]}
        positions={[heldCoin]}
        markets={[xmrMarket, solMarket]}
        settled
        failed={false}
      />
    )
  )

  // XMR is the waiting level and SOL the holding. Sorting by Ticker would put
  // SOL after XMR on its own, and by Held would put XMR first on value.
  for (const column of ["Ticker", "Type", "Value", "PnL"]) {
    for (const press of [1, 2]) {
      const heading = [...host.querySelectorAll("button")].find((node) =>
        node.textContent?.startsWith(column)
      )!
      act(() => heading.click())
      // The ticker's own cell, past the coin art's fallback letter.
      const order = [...host.querySelectorAll("tbody tr")].map(
        (row) =>
          row.querySelector("td")?.querySelector("span.truncate")
            ?.textContent ?? ""
      )
      expect(order, `${column} press ${press}`).toEqual(["SOL", "XMR"])
    }
  }
  act(() => root.unmount())
  host.remove()
})
