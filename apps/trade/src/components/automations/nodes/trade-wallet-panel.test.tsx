import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { tradeWalletNode } from "@/lib/automations/nodes/trade-wallet"
import type { AutomationNode } from "@/lib/automations/graph"

/**
 * Which half of the wallet panel gets drawn, and what it says.
 *
 * The panel has two shapes and one switch between them, and picking the wrong
 * shape is the failure that matters: a step set to spend a real account must
 * never draw itself as a backtest pot. That is a decision made while
 * rendering, so it is checked by rendering.
 *
 * This is the server render — the first thing the app does anyway. It proves
 * the words and the figures. The wallet list arrives in an effect, which a
 * static render never runs, so everything here is the state before that
 * lands; the list itself is a browser check.
 */

vi.mock("@/lib/api/wallets", () => ({
  loadWalletAccounts: () => new Promise(() => {}),
  getWalletErrorMessage: () => "Could not read your wallets.",
}))

const { default: TradeWalletFields } = await import(
  "@/components/automations/nodes/trade-wallet-panel"
)

function walletNode(patch: Record<string, unknown> = {}): AutomationNode {
  return {
    id: "wallet-1",
    kind: tradeWalletNode.kind,
    x: 0,
    y: 0,
    settings: {
      ...tradeWalletNode.createSettings(),
      ...patch,
    } as AutomationNode["settings"],
  }
}

function draw(node: AutomationNode): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <TradeWalletFields node={node} onChange={() => {}} />
    </TooltipProvider>
  )
}

describe("the wallet panel with pretend money", () => {
  const html = draw(walletNode())

  it("keeps the pot and the costs", () => {
    expect(html).toContain("The pot")
    expect(html).toContain("Starting money")
    expect(html).toContain("What trading costs")
    expect(html).toContain("Taker fee")
  })

  it("does not ask how much of a wallet to spend", () => {
    expect(html).not.toContain("Money this flow may use")
  })

  it("says nothing can move a cent", () => {
    expect(html).toContain("nothing here can move a cent")
  })
})

describe("the wallet panel with a wallet named", () => {
  const html = draw({
    ...walletNode({
      walletId: "w1",
      walletLabel: "Account #1",
      walletKind: "live",
      spendCapUsd: 250,
    }),
  })

  it("asks how much of that wallet the flow may spend", () => {
    expect(html).toContain("Money this flow may use")
    expect(html).toContain("Most it may spend")
    expect(html).toContain('value="250"')
  })

  it("drops the pot and the fee boxes", () => {
    // A real exchange charges what it charges. A box that appeared to change
    // that would be a lie in the one place lies cost money.
    expect(html).not.toContain("The pot")
    expect(html).not.toContain("What trading costs")
    expect(html).not.toContain("Taker fee")
  })

  it("names the wallet and calls real money what it is", () => {
    expect(html).toContain("Account #1")
    expect(html).toContain("real money")
    expect(html).not.toContain("nothing here can move a cent")
  })

  it("says the money is not set aside", () => {
    expect(html).toContain("Nothing is set aside")
  })
})

describe("a practice wallet", () => {
  it("is named as practice, not as real", () => {
    const html = draw(
      walletNode({
        walletId: "w2",
        walletLabel: "Practice 2",
        walletKind: "paper",
        spendCapUsd: 500,
      })
    )

    expect(html).toContain("practice money")
    expect(html).not.toContain("real money")
  })
})

describe("a step with a number on it that will not parse", () => {
  it("still draws as the trading step it is", () => {
    // Parsing the whole step drops every field back to its default when any
    // one of them is out of range — and the one thing that must never be
    // hidden that way is that this flow spends a real account. A panel that
    // quietly drew a backtest here would be the worst possible wrong.
    const html = draw(
      walletNode({
        startingUsd: 0,
        walletId: "w1",
        walletLabel: "Account #1",
        walletKind: "live",
        spendCapUsd: 250,
      })
    )

    expect(html).toContain("Money this flow may use")
    expect(html).toContain("Account #1")
    expect(html).not.toContain("What trading costs")
  })
})
