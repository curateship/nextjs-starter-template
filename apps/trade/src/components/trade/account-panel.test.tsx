// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ActiveWalletsView,
  AllWalletsView,
  KindBadge,
} from "@/components/trade/account-panel"
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
  onOpenWallet = () => {},
}: {
  onOpenWallet?: (wallet: TradeWallet) => void
}) {
  const [activeWalletId, setActiveWalletId] = React.useState("main")
  return (
    <TooltipProvider>
      <ActiveWalletsView
        wallets={wallets}
        summaryOf={(walletId) => summaries.get(walletId) ?? null}
        activeWalletId={activeWalletId}
        onUseWallet={setActiveWalletId}
        onOpenWallet={onOpenWallet}
        onFlattenWallet={() => {}}
        onRetry={() => {}}
        healthOf={(walletId) =>
          walletId === "main"
            ? {
                marginUsed: 1_100,
                nearest: {
                  marketKey: "hyperliquid:mainnet:ETH",
                  away: 0.12,
                },
              }
            : null
        }
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
    expect(host.querySelector(".text-sky-700")).not.toBeNull()
  })

  it("lists every active wallet and switches the wallet in use with one click", async () => {
    await act(async () => root.render(<WalletPicker />))

    expect(host.textContent).toContain("Main")
    expect(host.textContent).toContain("Scalper")
    expect(host.textContent).not.toContain("Hyperliquid")
    const mainRow = host
      .querySelector('[aria-label="Main is the wallet in use"]')
      ?.closest("label")
    expect(mainRow?.textContent).toContain("MainConnected$5,100.00+$75.00")
    expect(mainRow?.querySelector(".sr-only")?.textContent).toBe("Connected")
    expect(mainRow?.parentElement?.className).toContain("px-3")
    expect(mainRow?.parentElement?.className).toContain("min-h-10")
    expect(mainRow?.parentElement?.className).toContain("bg-muted/60")
    expect(mainRow?.className).toContain("grid-cols-")
    expect(mainRow?.parentElement?.parentElement?.className).not.toContain(
      "py-2"
    )
    expect(mainRow?.querySelector(".font-mono")?.textContent).toBe("$5,100.00")
    expect(
      host.querySelector('[aria-label="Main is the wallet in use"]')
    ).not.toBeNull()

    const scalperRow = host
      .querySelector('[aria-label="Trade with Scalper"]')
      ?.closest("label")
    expect(scalperRow).not.toBeNull()
    await act(async () => (scalperRow as HTMLElement | null)?.click())

    expect(
      host.querySelector('[aria-label="Scalper is the wallet in use"]')
    ).not.toBeNull()
    expect(
      host
        .querySelector('[aria-label="Scalper is the wallet in use"]')
        ?.closest("label")?.parentElement?.className
    ).toContain("bg-muted/60")
    expect(host.querySelector('[aria-label="Trade with Main"]')).not.toBeNull()
  })

  it("opens each wallet's figures in its three-dot popover", async () => {
    await act(async () => root.render(<WalletPicker />))

    expect(host.textContent).not.toContain("$4,000.00")
    expect(host.textContent).not.toContain("$9,000.00")

    const showScalper = host.querySelector<HTMLElement>(
      '[aria-label="Open Scalper wallet details"]'
    )
    await act(async () => showScalper?.click())

    expect(document.body.textContent).toContain("$9,000.00")
    expect(document.body.textContent).toContain("Margin used—")
    expect(document.body.textContent).not.toContain("Wallet details")
  })

  it("shows every stated key expiry and warns as it gets close", async () => {
    const expiring = [
      { ...wallets[0], keyValidUntil: Date.now() + 30 * 86_400_000 },
      { ...wallets[1], keyValidUntil: null },
    ]
    await act(async () =>
      root.render(
        <TooltipProvider>
          <ActiveWalletsView
            wallets={expiring}
            summaryOf={(walletId) => summaries.get(walletId) ?? null}
            activeWalletId="main"
            onUseWallet={() => {}}
            onOpenWallet={() => {}}
            onFlattenWallet={() => {}}
            onRetry={() => {}}
            healthOf={() => null}
          />
        </TooltipProvider>
      )
    )

    await act(async () =>
      host
        .querySelector<HTMLElement>('[aria-label="Open Main wallet details"]')
        ?.click()
    )
    expect(document.body.textContent).toContain(
      "Trading key expires in 30 days."
    )
    expect(document.body.textContent).not.toContain("unknown")
  })

  it("opens wallet settings from the expanded figures", async () => {
    const onOpenWallet = vi.fn()
    await act(async () =>
      root.render(<WalletPicker onOpenWallet={onOpenWallet} />)
    )

    await act(async () =>
      host
        .querySelector<HTMLElement>(
          '[aria-label="Open Scalper wallet details"]'
        )
        ?.click()
    )
    await act(async () =>
      [...document.body.querySelectorAll<HTMLElement>("button")]
        .find((button) => button.textContent?.includes("Edit wallet"))
        ?.click()
    )

    expect(onOpenWallet).toHaveBeenCalledWith(wallets[1])
  })

  it("leaves figures collapsed when that wallet is selected", async () => {
    await act(async () => root.render(<WalletPicker />))

    const scalper = host.querySelector<HTMLElement>(
      '[aria-label="Trade with Scalper"]'
    )
    await act(async () => scalper?.click())

    expect(host.textContent).not.toContain("$9,000.00")
    expect(
      host.querySelector('[aria-label="Open Scalper wallet details"]')
    ).not.toBeNull()
  })

  it("names the Aster position-mode fix without showing position figures", async () => {
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
            onOpenWallet={() => {}}
            onFlattenWallet={() => {}}
            onRetry={() => {}}
            healthOf={() => null}
          />
        </TooltipProvider>
      )
    )

    expect(host.textContent).toContain("Two-sided. Change to one-way mode")
    await act(async () =>
      host
        .querySelector<HTMLElement>('[aria-label="Open Main wallet details"]')
        ?.click()
    )
    expect(document.body.textContent).toContain(
      "Change Position Mode to One-way Mode"
    )
    expect(document.body.textContent).not.toContain("Free")
  })
})

describe("the other wallet tabs", () => {
  it("uses the same compact rows in All without an old summary block", async () => {
    const onOpenWallet = vi.fn()
    await act(async () =>
      root.render(
        <TooltipProvider>
          <AllWalletsView
            wallets={wallets}
            summaryOf={(walletId) => summaries.get(walletId) ?? null}
            activeWalletId="main"
            onOpenWallet={onOpenWallet}
          />
        </TooltipProvider>
      )
    )

    expect(host.textContent).not.toContain("Total value")
    const main = host.querySelector<HTMLElement>(
      '[aria-label="Main — the wallet in use — open wallet settings"]'
    )
    expect(main?.className).toContain("grid-cols-")
    expect(main?.parentElement?.className).toContain("min-h-10")
    expect(main?.parentElement?.className).toContain("px-3")
    expect(main?.parentElement?.className).not.toContain("border-b")
    expect(main?.firstElementChild?.firstElementChild?.className).toContain(
      "size-4"
    )
    expect(main?.parentElement?.className).not.toContain("py-2")
    expect(
      host.querySelector('[aria-label="Open Main wallet settings"]')
    ).not.toBeNull()

    const scalper = host.querySelector<HTMLElement>(
      '[aria-label="Scalper — open wallet settings"]'
    )
    await act(async () => scalper?.click())
    expect(onOpenWallet).toHaveBeenCalledWith(wallets[1])

    await act(async () =>
      host
        .querySelector<HTMLElement>(
          '[aria-label="Open Scalper wallet settings"]'
        )
        ?.click()
    )
    expect(onOpenWallet).toHaveBeenCalledTimes(2)
  })

  it("uses the same compact rows in Inactive", async () => {
    const inactiveWallet = { ...wallets[1], status: "inactive" as const }
    const inactiveSummary: WalletAccountSummary = {
      walletId: inactiveWallet.id,
      state: "inactive",
    }
    await act(async () =>
      root.render(
        <TooltipProvider>
          <AllWalletsView
            wallets={[inactiveWallet]}
            summaryOf={() => inactiveSummary}
            activeWalletId={null}
            onOpenWallet={() => {}}
          />
        </TooltipProvider>
      )
    )

    expect(host.textContent).not.toContain("Total value")
    const row = host.querySelector<HTMLElement>(
      '[aria-label="Scalper — open wallet settings"]'
    )
    expect(row?.parentElement?.className).toContain("min-h-10")
    expect(
      host.querySelector('[aria-label="Open Scalper wallet settings"]')
    ).not.toBeNull()
    expect(row?.textContent).toContain("Not switched on")
  })
})
