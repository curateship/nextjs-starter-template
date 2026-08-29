// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ActiveWalletsView,
  AllWalletsView,
  KindBadge,
  WalletDetailsDialog,
  WalletManagement,
} from "@/components/trade/account-panel"
import type { TradeAccount } from "@/components/trade/use-trade-account"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradeWallet, WalletAccountSummary } from "@/lib/trade/wallets"

const wallets: TradeWallet[] = [
  {
    id: "main",
    label: "Main",
    kind: "live",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 5_000,
    address: "0x1",
    hasKey: true,
    keyValidUntil: null,
  },
  {
    id: "scalper",
    label: "Scalper",
    kind: "paper",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
    address: null,
    hasKey: false,
    keyValidUntil: null,
  },
]

const summaries = new Map<string, WalletAccountSummary>([
  [
    "main",
    {
      walletId: "main",
      state: "ok",
      equity: 5_100,
      free: 4_000,
      inTrades: 1_100,
      openProfit: 50,
      settled: 25,
      madeOrLost: 75,
      unpricedFills: 0,
    },
  ],
  [
    "scalper",
    {
      walletId: "scalper",
      state: "ok",
      equity: 10_200,
      free: 9_000,
      inTrades: 1_200,
      openProfit: 125,
      settled: 75,
      madeOrLost: 200,
      unpricedFills: 0,
    },
  ],
])

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function WalletPicker({
  onOpenWalletDetails = () => {},
}: {
  onOpenWalletDetails?: (wallet: TradeWallet) => void
}) {
  const [activeWalletId, setActiveWalletId] = React.useState("main")
  return (
    <TooltipProvider>
      <ActiveWalletsView
        wallets={wallets}
        summaryOf={(walletId) => summaries.get(walletId) ?? null}
        activeWalletId={activeWalletId}
        onUseWallet={setActiveWalletId}
        onOpenWalletDetails={onOpenWalletDetails}
      />
    </TooltipProvider>
  )
}

describe("the active wallet picker", () => {
  it("keeps practice labels and leaves the real-money chip out", async () => {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <KindBadge wallet={wallets[1]} />
          <KindBadge wallet={{ ...wallets[0], network: "testnet" }} />
          <KindBadge wallet={wallets[0]} />
        </TooltipProvider>
      )
    )

    expect(host.textContent).toBe("PracticeTestnet")
    expect(host.textContent).not.toContain("Real")
    expect(host.textContent).not.toContain("Live")
  })

  it("switches wallets from the row and opens details from the three-dot button", async () => {
    const onOpenWalletDetails = vi.fn()
    await act(async () =>
      root.render(<WalletPicker onOpenWalletDetails={onOpenWalletDetails} />)
    )

    const mainRow = host
      .querySelector('[aria-label="Main is the wallet in use"]')
      ?.closest("label")
    expect(mainRow?.textContent).toContain("MainConnected$5,100.00+$75.00")
    expect(mainRow?.parentElement?.className).toContain("min-h-12")
    expect(mainRow?.parentElement?.className).not.toContain("rounded")
    expect(mainRow?.parentElement?.className).toContain("bg-muted/60")
    expect(mainRow?.parentElement?.parentElement?.className).not.toContain(
      "px-2"
    )

    await act(async () =>
      host
        .querySelector<HTMLElement>('[aria-label="Trade with Scalper"]')
        ?.click()
    )
    expect(
      host.querySelector('[aria-label="Scalper is the wallet in use"]')
    ).not.toBeNull()

    await act(async () =>
      host
        .querySelector<HTMLElement>(
          '[aria-label="Open Scalper wallet details"]'
        )
        ?.click()
    )
    expect(onOpenWalletDetails).toHaveBeenCalledWith(wallets[1])
    expect(document.body.textContent).not.toContain("$9,000.00")
  })

  it("names an exchange refusal in the row", async () => {
    const refusal = new Map(summaries)
    refusal.set("main", {
      walletId: "main",
      state: "unreachable",
      reason:
        "This Aster account can hold a long and a short in the same coin. Trade works with one direction at a time. Change Position Mode to One-way Mode on Aster, then refresh.",
    })

    await act(async () =>
      root.render(
        <TooltipProvider>
          <ActiveWalletsView
            wallets={[{ ...wallets[0], protocol: "aster" }]}
            summaryOf={(walletId) => refusal.get(walletId) ?? null}
            activeWalletId="main"
            onUseWallet={() => {}}
            onOpenWalletDetails={() => {}}
          />
        </TooltipProvider>
      )
    )

    expect(host.textContent).toContain("Two-sided. Change to one-way mode")
  })
})

describe("wallet management in the chart header", () => {
  it("opens the tabs and adds from the plus in the tab row", async () => {
    const onAddWallet = vi.fn()
    const onOpenWalletDetails = vi.fn()
    const account: TradeAccount = {
      loading: false,
      failed: false,
      wallets,
      activeWallet: wallets[0],
      summaryOf: (walletId) => summaries.get(walletId) ?? null,
      refresh: async () => {},
      switchWallet: () => {},
    }

    await act(async () =>
      root.render(
        <TooltipProvider>
          <WalletManagement
            account={account}
            cacheScope="person:hyperliquid"
            detailsOpen={false}
            onAddWallet={onAddWallet}
            onOpenWalletDetails={onOpenWalletDetails}
          />
        </TooltipProvider>
      )
    )

    const trigger = host.querySelector<HTMLElement>(
      '[aria-label="Manage wallets. Main is in use."]'
    )
    expect(trigger?.textContent).toContain("Main- $5,100.00+$75.00")
    await act(async () => trigger?.click())

    expect(document.body.textContent).toContain("ActiveAllInactive")
    // No footer any more: no total across wallets in the menu.
    expect(document.body.textContent).not.toContain("$15,300.00")
    expect(
      document.body.querySelector<HTMLElement>('[data-slot="popover-content"]')
        ?.className
    ).toContain("max-w-sm")
    expect(
      document.body.querySelector<HTMLElement>('[data-slot="popover-content"]')
        ?.className
    ).toContain("overflow-hidden")
    await act(async () =>
      document.body
        .querySelector<HTMLElement>('[aria-label="Open Main wallet details"]')
        ?.click()
    )
    expect(onOpenWalletDetails).toHaveBeenCalledWith(wallets[0])
    expect(
      document.body.querySelector('[data-slot="popover-content"]')
    ).not.toBeNull()
    const add = document.body.querySelector<HTMLElement>(
      'button[aria-label="Add wallet"]'
    )
    await act(async () => add?.click())
    expect(onAddWallet).toHaveBeenCalledOnce()
  })
})

describe("the wallet details window", () => {
  it("shows figures and key expiry, then hands off its two actions", async () => {
    const onClose = vi.fn()
    const onOpenWallet = vi.fn()
    const onFlattenWallet = vi.fn()
    const expiring = {
      ...wallets[0],
      keyValidUntil: Date.now() + 30 * 86_400_000,
    }

    await act(async () =>
      root.render(
        <TooltipProvider>
          <WalletDetailsDialog
            wallet={expiring}
            summary={summaries.get("main") ?? null}
            positions={[]}
            fallbackMarks={new Map()}
            onClose={onClose}
            onOpenWallet={onOpenWallet}
            onFlattenWallet={onFlattenWallet}
            onRetry={() => {}}
          />
        </TooltipProvider>
      )
    )

    expect(document.body.textContent).toContain(
      "Trading key expires in 30 days."
    )
    expect(document.body.textContent).toContain("Free$4,000.00")
    expect(document.body.textContent).toContain("Margin used—")
    expect(document.body.textContent).toContain("Made or lost+$75.00")

    const edit = [
      ...document.body.querySelectorAll<HTMLElement>("button"),
    ].find((button) => button.textContent?.includes("Edit wallet"))
    await act(async () => edit?.click())
    expect(onClose).toHaveBeenCalledOnce()
    expect(onOpenWallet).toHaveBeenCalledWith(expiring)

    onClose.mockClear()
    await act(async () =>
      root.render(
        <TooltipProvider>
          <WalletDetailsDialog
            wallet={expiring}
            summary={summaries.get("main") ?? null}
            positions={[]}
            fallbackMarks={new Map()}
            onClose={onClose}
            onOpenWallet={onOpenWallet}
            onFlattenWallet={onFlattenWallet}
            onRetry={() => {}}
          />
        </TooltipProvider>
      )
    )
    const empty = [
      ...document.body.querySelectorAll<HTMLElement>("button"),
    ].find((button) => button.textContent?.includes("Empty wallet"))
    await act(async () => empty?.click())
    expect(onClose).toHaveBeenCalledOnce()
    expect(onFlattenWallet).toHaveBeenCalledWith(expiring)
  })

  it("explains an inactive wallet without stale expiry or figures", async () => {
    const inactive = {
      ...wallets[0],
      status: "inactive" as const,
      keyValidUntil: Date.now() + 30 * 86_400_000,
    }
    await act(async () =>
      root.render(
        <TooltipProvider>
          <WalletDetailsDialog
            wallet={inactive}
            summary={{ walletId: inactive.id, state: "inactive" }}
            positions={[]}
            fallbackMarks={new Map()}
            onClose={() => {}}
            onOpenWallet={() => {}}
            onFlattenWallet={() => {}}
            onRetry={() => {}}
          />
        </TooltipProvider>
      )
    )

    expect(document.body.textContent).toContain(
      "This wallet is not switched on"
    )
    expect(document.body.textContent).not.toContain("Trading key expires")
    expect(document.body.textContent).not.toContain("Free")
  })
})

describe("the other wallet tabs", () => {
  it("uses the same edge-to-edge rows and opens details from the three-dot button", async () => {
    const onOpenWalletDetails = vi.fn()
    await act(async () =>
      root.render(
        <TooltipProvider>
          <AllWalletsView
            wallets={wallets}
            summaryOf={(walletId) => summaries.get(walletId) ?? null}
            activeWalletId="main"
            onOpenWalletDetails={onOpenWalletDetails}
          />
        </TooltipProvider>
      )
    )

    const details = host.querySelector<HTMLElement>(
      '[aria-label="Open Scalper wallet details"]'
    )
    expect(details?.parentElement?.className).toContain("min-h-12")
    expect(details?.parentElement?.className).not.toContain("rounded")
    expect(details?.parentElement?.parentElement?.className).not.toContain(
      "px-2"
    )
    await act(async () => details?.click())
    expect(onOpenWalletDetails).toHaveBeenCalledWith(wallets[1])
  })
})
