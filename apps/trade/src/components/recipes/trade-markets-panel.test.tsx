import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"

/**
 * Which shape the Markets step draws, and what it is allowed to offer.
 *
 * The step means two different things depending on the Wallet step beside it.
 * With pretend money it picks a stretch of history to walk. With a wallet named
 * there is no history — the flow goes forwards from the moment it is switched
 * on — and the coins have to be ones that wallet could really trade.
 *
 * Both of those are decided while rendering, so both are checked by rendering.
 * This is the server render; the market list arrives in an effect a static
 * render never runs, so the coin list itself is a browser check.
 */

vi.mock("@/lib/api/trade/backtests", () => ({
  loadTestableMarkets: () => new Promise(() => {}),
  loadBacktestMarkets: () => new Promise(() => {}),
}))

vi.mock("@/app/options", () => ({ appOptions: {} }))

const { default: TradeMarketsFields } =
  await import("@/components/recipes/trade-markets-panel")

function marketsNode(): AutomationNode {
  return {
    id: "markets-1",
    kind: tradeMarketsNode.kind,
    x: 0,
    y: 0,
    settings: {
      ...tradeMarketsNode.createSettings(),
      // Pinned, so these stay about the wallet rather than about whichever
      // exchange a new step happens to start on.
      protocol: "hyperliquid",
      marketKeys: ["hyperliquid:mainnet:BTC"],
    } as AutomationNode["settings"],
  }
}

function graphWith(
  walletPatch: Record<string, unknown> | null
): AutomationGraph {
  return {
    nodes: [
      {
        id: "wallet-1",
        kind: tradeWalletNode.kind,
        x: 0,
        y: 0,
        settings: {
          ...tradeWalletNode.createSettings(),
          ...(walletPatch ?? {}),
        } as AutomationNode["settings"],
      },
      marketsNode(),
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function draw(walletPatch: Record<string, unknown> | null): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <TradeMarketsFields
        node={marketsNode()}
        graph={graphWith(walletPatch)}
        onChange={() => {}}
      />
    </TooltipProvider>
  )
}

const HYPERLIQUID = {
  walletId: "w1",
  walletLabel: "Account #1",
  walletKind: "live",
  walletProtocol: "hyperliquid",
  walletNetwork: "mainnet",
}

describe("the Markets step with pretend money", () => {
  const html = draw(null)

  it("still asks how far back to test", () => {
    expect(html).toContain("How far back")
    expect(html).toContain("Days to test")
  })

  it("says nothing about a wallet", () => {
    expect(html).not.toContain("When it trades")
    expect(html).not.toContain("Follows")
  })

  it("offers no exchange to pick", () => {
    // One list of every venue's markets, each on its history source. An
    // exchange picker here would be a choice with no meaning.
    expect(html).not.toContain("Markets from")
    expect(html).not.toContain("Binance")
  })
})

describe("the Markets step with a wallet named", () => {
  const html = draw(HYPERLIQUID)

  it("drops the window entirely", () => {
    // Not greyed out — gone. A disabled date range still reads as a setting
    // that matters, and somebody will spend a minute working out why it will
    // not move.
    expect(html).not.toContain("How far back")
    expect(html).not.toContain("Days to test")
    expect(html).not.toContain("Between two dates")
  })

  it("says when it trades instead, and that it is not blind", () => {
    // Hiding the window must not read as "it buys the moment it starts". The
    // ladder is measured from a confirmed base, and confirming one takes past
    // candles.
    expect(html).toContain("When it trades")
    expect(html).toContain("switched on, forwards")
    expect(html).toContain("base before it may buy")
  })

  it("ties the exchange to the wallet", () => {
    expect(html).toContain("Follows Account #1")
  })
})

describe("a wallet on the practice network", () => {
  it("says the money there is pretend", () => {
    const html = draw({ ...HYPERLIQUID, walletNetwork: "testnet" })
    expect(html).toContain("practice network")
  })
})

describe("coins saved from an exchange the wallet cannot reach", () => {
  it("says the flow will not run, and how to put it right", () => {
    const html = draw({ ...HYPERLIQUID, walletProtocol: "aster" })
    expect(html).toContain("trades on Aster")
    expect(html).toContain("picked on Hyperliquid")
    expect(html).toContain("will not run as it stands")
    expect(html).toContain("pick the coins again")
  })
})

describe("a wallet named before the step learned to follow one", () => {
  it("asks for the Wallet step to be opened rather than guessing an exchange", () => {
    // Guessing would point a real wallet at coins it cannot trade. Opening the
    // Wallet step once fills it in, which is why no migration was needed.
    const html = draw({
      walletId: "w1",
      walletLabel: "Account #1",
      walletKind: "live",
    })

    expect(html).toContain("Open the Wallet step once")
    expect(html).not.toContain("How far back")
  })
})
