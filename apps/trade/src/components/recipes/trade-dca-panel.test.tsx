import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import TradeDcaFields from "@/components/recipes/trade-dca-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"

vi.mock("@/lib/recipes/trade-wallet-accounts", () => {
  const answer = {
    at: 1,
    wallets: [
      {
        id: "paper-1",
        label: "Practice",
        kind: "paper",
        status: "active",
        protocol: "hyperliquid",
        network: "mainnet",
        startingBalance: 8_000,
        address: null,
        hasKey: false,
        keyValidUntil: null,
      },
    ],
    summaries: [
      {
        walletId: "paper-1",
        state: "ok",
        equity: 10_000,
        free: 10_000,
        inTrades: 0,
        openProfit: 0,
        madeOrLost: 0,
        settled: 0,
        unpricedFills: 0,
      },
    ],
  }
  return {
    readRecipeWalletAccounts: () => answer,
    loadRecipeWalletAccounts: async () => answer,
  }
})

/**
 * What the ladder panel actually puts on screen.
 *
 * Rendered rather than reasoned about. Both of the things checked here are
 * numbers a person reads and then acts on — how much each buy spends, and
 * whether the wait they typed is the wait that will run — and both were wrong
 * or missing until recently. A panel that quietly shows the wrong figure is
 * worse than one that fails to draw.
 *
 * This is the server render, which is what the app does first anyway. It proves
 * the words and the figures; it says nothing about widths, which needs a real
 * browser.
 */

function dcaNode(params: Record<string, unknown> = {}): AutomationNode {
  const base = tradeDcaNode.createSettings() as {
    params: Record<string, unknown>
  }
  return {
    id: "dca-1",
    kind: tradeDcaNode.kind,
    x: 0,
    y: 0,
    settings: {
      ...base,
      params: { ...base.params, ...params },
    } as AutomationNode["settings"],
  }
}

function graphWith(startingUsd: number, node: AutomationNode): AutomationGraph {
  return {
    nodes: [
      {
        id: "wallet-1",
        kind: tradeWalletNode.kind,
        x: 0,
        y: 0,
        settings: {
          ...tradeWalletNode.createSettings(),
          startingUsd,
        } as AutomationNode["settings"],
      },
      node,
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function graphWithNamedWallet(node: AutomationNode): AutomationGraph {
  return {
    nodes: [
      {
        id: "wallet-1",
        kind: tradeWalletNode.kind,
        x: 0,
        y: 0,
        settings: {
          ...tradeWalletNode.createSettings(),
          walletId: "paper-1",
          walletLabel: "Practice",
          walletKind: "paper",
        } as AutomationNode["settings"],
      },
      node,
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function draw(node: AutomationNode, graph?: AutomationGraph): string {
  // The provider the real page puts above every panel; the field hints are
  // tooltips and refuse to render without it.
  return renderToStaticMarkup(
    <TooltipProvider>
      <TradeDcaFields node={node} graph={graph} onChange={() => {}} />
    </TooltipProvider>
  )
}

describe("what each buy spends", () => {
  it("shows the money, not a share of a share", () => {
    // Nine rungs, 3% of a $10,000 pot, each buy twice the one above: the shares
    // run from 0.01% to 3%, which nobody can read as money in their head.
    const node = dcaNode({
      rungs: Array.from({ length: 9 }, () => ({ deviation: 5 })),
      maxPositionPct: 3,
      sizeMultiplier: 2,
    })
    const html = draw(node, graphWith(10_000, node))

    expect(html).toContain("Buy size")
    // The deepest rung takes half the lot, the one above it a quarter, and so
    // on — and they add up to the $300 the card says at the top.
    expect(html).toContain("$150")
    expect(html).toContain("$75.15")
    expect(html).toContain("$0.59")
    expect(html).toContain("$300")
  })

  it("takes the pot from the money step in the same flow", () => {
    const node = dcaNode({
      rungs: [{ deviation: 5 }],
      maxPositionPct: 10,
      sizeMultiplier: 1,
    })
    // One rung at 10% of $50,000 is the whole $5,000.
    expect(draw(node, graphWith(50_000, node))).toContain("$5,000")
  })

  it("shows the coin bought after borrowing, not only the account money", () => {
    const node = dcaNode({
      rungs: Array.from({ length: 7 }, (_, index) => ({
        deviation: 20 + index * 3,
      })),
      maxPositionPct: 20,
      sizeMultiplier: 2,
      leverage: 2,
    })
    const html = draw(node, graphWith(10_000, node))

    // The ladder uses $2,000 of the account to buy $4,000 of coin. Its seven
    // buys split that $4,000 in a 1:2 ramp, just like the saved ladder does.
    expect(html).toContain("$4,000")
    expect(html).toContain("$31.50")
    expect(html).toContain("$2,016")
  })

  it("shows borrowed buying power in dollars for a named wallet", () => {
    const node = dcaNode({
      rungs: [{ deviation: 20 }],
      maxPositionPct: 20,
      sizeMultiplier: 1,
      leverage: 2,
    })
    const html = draw(node, graphWithNamedWallet(node))

    expect(html).toContain("$4,000")
    expect(html).toContain("uses $2,000 of account money")
    expect(html).not.toContain("% of wallet")
  })

  it("uses the wallet's starting amount for fixed sizing", () => {
    const node = dcaNode({
      rungs: [{ deviation: 20 }],
      maxPositionPct: 25,
      sizeMultiplier: 1,
      compound: false,
    })

    expect(draw(node, graphWithNamedWallet(node))).toContain("$2,000")
  })

  it("offers compound and fixed sizing", () => {
    const html = draw(dcaNode({ compound: false }))

    expect(html).toContain("Bet sizing")
    expect(html).toContain(
      "Every later ladder stays based on this starting pot."
    )
  })
})

describe("what counts as a base", () => {
  it("offers the two numbers that decide where the floor is", () => {
    const html = draw(dcaNode())

    expect(html).toContain("What counts as a base")
    expect(html).toContain("Candles to search back")
    expect(html).toContain("Candles it must hold")
  })

  it("says so when the wait is longer than the search", () => {
    // The Base indicator's own rule, said in the same words in both places.
    // Waiting 40 candles for a low found in the last 10 is a question with no
    // answer, and the run quietly shortens it to 9.
    const html = draw(
      dcaNode({ baseDetection: { searchBars: 10, holdBars: 40 } })
    )

    expect(html).toContain("acting as 9 candles")
  })

  it("stays quiet when the wait fits", () => {
    const html = draw(
      dcaNode({ baseDetection: { searchBars: 36, holdBars: 8 } })
    )

    expect(html).not.toContain("acting as")
  })
})

/**
 * Borrowing, and the one thing that must never be silent about it.
 *
 * One is cash. A higher choice reaches backtests, practice wallets and real
 * wallets, while the market's own lower maximum still wins.
 */
describe("the borrowing box", () => {
  it("says nothing extra while the ladder buys with cash", () => {
    const html = draw(dcaNode())

    expect(html).toContain("Borrowing")
    expect(html).not.toContain("Backtests only")
  })

  it("says the chosen borrowing reaches every wallet", () => {
    const html = draw(dcaNode({ leverage: 2 }))

    expect(html).toContain("practice wallets and real")
    expect(html).not.toContain("Backtests only")
    expect(html).toContain('value="2"')
  })
})
