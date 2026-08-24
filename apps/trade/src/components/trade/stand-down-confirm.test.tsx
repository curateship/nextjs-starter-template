// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { StandDownConfirm } from "@/components/trade/activity-panel"
import type { TradePosition } from "@/lib/trade/paper"
import type { SmartGrid, SmartLadder } from "@/lib/trade/smart-plan"

/**
 * The question asked before every ladder and grid is stood down.
 *
 * These are about the WORDS, because the words are the whole safety of this
 * button. Somebody presses it in a fast market, reads one sentence, and presses
 * again. Two things it must say, and both are reasonable to assume the other
 * way round: nothing is sold, and a cancelled ladder loses its plan. Real money
 * has to carry its figure in the question itself.
 */

function order(id: string, kind: "dca" | "grid", walletId: string) {
  return {
    id,
    walletId,
    marketKey: `hyperliquid:mainnet:${id}`,
    status: "active",
    flowRunId: null,
    createdAt: 1,
    updatedAt: 1,
    kind,
    plan: {},
  } as unknown as SmartLadder | SmartGrid
}

function position(marketKey: string, walletId: string): TradePosition {
  return {
    id: `${walletId}:${marketKey}`,
    walletId,
    marketKey,
    // 100 coins at $1 each — $100 of cost, and no live price in the store, so
    // the entry price is what the dollars are worked out from.
    szi: 100,
    entryPx: 1,
    leverage: 1,
    maxLeverage: 10,
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function ask(input: {
  orders: (SmartLadder | SmartGrid)[]
  positions: TradePosition[]
  realWallets: string[]
}) {
  await act(async () => {
    root.render(
      <StandDownConfirm
        open
        onOpenChange={() => {}}
        orders={input.orders}
        positions={input.positions}
        markets={new Map()}
        realWallets={new Set(input.realWallets)}
        onConfirm={() => {}}
      />
    )
  })
  return {
    title: document.querySelector("h2")?.textContent?.trim() ?? "",
    body: document.body.textContent ?? "",
    confirmLabel:
      [...document.querySelectorAll("button")]
        .map((one) => one.textContent?.trim())
        .find((words) => words?.startsWith("Stop")) ?? "",
  }
}

describe("the confirm before every ladder and grid is stood down", () => {
  it("counts the ladders and the grids before they go", async () => {
    const said = await ask({
      orders: [
        order("BTC", "dca", "practice"),
        order("ETH", "dca", "practice"),
        order("SOL", "dca", "practice"),
        order("DOGE", "grid", "practice"),
        order("AVAX", "grid", "practice"),
      ],
      positions: [],
      realWallets: [],
    })

    expect(said.title).toContain("3 ladders and 2 grids")
    expect(said.confirmLabel).toBe("Stop all of them")
  })

  it("says what they are holding, and that all of it stays", async () => {
    const said = await ask({
      orders: [
        order("BTC", "dca", "practice"),
        order("ETH", "grid", "practice"),
      ],
      positions: [
        position("hyperliquid:mainnet:BTC", "practice"),
        position("hyperliquid:mainnet:ETH", "practice"),
      ],
      realWallets: [],
    })

    // $100 in each, at what they paid.
    expect(said.body).toContain("holding $200.00 of coins right now")
    expect(said.body).toContain("stays exactly where it is")
    expect(said.body).toContain("no position is closed")
  })

  it("says a cancelled ladder loses its plan", async () => {
    const withLadder = await ask({
      orders: [order("BTC", "dca", "practice")],
      positions: [],
      realWallets: [],
    })
    expect(withLadder.body).toContain("ends that ladder for good")
    expect(withLadder.confirmLabel).toBe("Stop it")

    // Grids alone have no rungs to throw away, so the sentence stays out.
    const gridsOnly = await ask({
      orders: [order("ETH", "grid", "practice")],
      positions: [],
      realWallets: [],
    })
    expect(gridsOnly.body).not.toContain("ends that ladder for good")
  })

  it("puts real money's figure in the question itself", async () => {
    const said = await ask({
      orders: [
        order("BTC", "dca", "live"),
        order("ETH", "grid", "practice"),
      ],
      positions: [
        position("hyperliquid:mainnet:BTC", "live"),
        position("hyperliquid:mainnet:ETH", "practice"),
      ],
      realWallets: ["live"],
    })

    // Only the real wallet's $100 is named as real, not the $200 total.
    expect(said.title).toContain("holding $100.00 of real money")
    expect(said.body).toContain("One of them is on real money")
  })

  it("still names real money when nothing has been bought yet", async () => {
    const said = await ask({
      orders: [order("BTC", "dca", "live"), order("ETH", "dca", "live")],
      positions: [],
      realWallets: ["live"],
    })

    expect(said.title).toContain("2 are on real money")
    expect(said.body).toContain("They are holding nothing right now")
  })

  it("never claims real money when none of it is", async () => {
    const said = await ask({
      orders: [order("BTC", "dca", "practice")],
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
      realWallets: [],
    })

    expect(said.title).toBe("Stop 1 ladder?")
    expect(said.body).not.toContain("real money")
  })
})
