// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { AutomationGraph } from "@/lib/automations/graph"
import { tradeMarketsNode } from "@/lib/automations/nodes/trade-markets"
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
 * lands. The last test mounts the real component and exercises that list.
 */

const { loadWalletAccounts, successToast } = vi.hoisted(() => ({
  loadWalletAccounts: vi.fn(() => new Promise(() => {})),
  successToast: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: successToast } }))

vi.mock("@/lib/api/trade/wallets", () => ({
  loadWalletAccounts,
  getWalletErrorMessage: () => "Could not read your wallets.",
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      aria-label="Money"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

const { default: TradeWalletFields } =
  await import("@/components/automations/nodes/trade-wallet-panel")

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
    }),
  })

  it("does not ask for a spending cap", () => {
    expect(html).not.toContain("Money this flow may use")
    expect(html).not.toContain("Most it may spend")
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
      })
    )

    expect(html).toContain("Account #1")
    expect(html).not.toContain("What trading costs")
  })
})

describe("picking an Aster wallet", () => {
  it("moves the Markets step to Aster and clears the old coins", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    loadWalletAccounts.mockResolvedValueOnce({
      wallets: [
        {
          id: "aster-wallet",
          label: "Aster main",
          kind: "live",
          status: "active",
          protocol: "aster",
          network: "mainnet",
          startingBalance: 100,
          address: "0x1234",
          hasKey: true,
          keyValidUntil: null,
        },
      ],
      summaries: [],
    })
    const wallet = walletNode()
    const markets: AutomationNode = {
      id: "markets-1",
      kind: tradeMarketsNode.kind,
      x: 100,
      y: 0,
      settings: {
        ...tradeMarketsNode.createSettings(),
        protocol: "binance",
        marketKeys: ["binance:mainnet:BTC"],
      },
    }
    const graph: AutomationGraph = {
      nodes: [wallet, markets],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }
    const onChange = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <TradeWalletFields node={wallet} graph={graph} onChange={onChange} />
        </TooltipProvider>
      )
    })
    const select = host.querySelector<HTMLSelectElement>("select")!
    expect(select.textContent).toContain("Aster main")

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value"
      )?.set
      setValue?.call(select, "aster-wallet")
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith({
      ...markets,
      settings: {
        ...markets.settings,
        protocol: "aster",
        folderId: null,
        folderName: null,
        folderCount: null,
        marketKeys: [],
      },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...wallet,
      settings: {
        ...wallet.settings,
        walletId: "aster-wallet",
        walletLabel: "Aster main",
        walletKind: "live",
        walletProtocol: "aster",
        walletNetwork: "mainnet",
      },
    })
    expect(successToast).toHaveBeenCalledWith(
      "Markets moved to Aster to match Aster main. Its 1 coin was cleared — pick them again."
    )

    await act(async () => root.unmount())
    host.remove()
  })
})
