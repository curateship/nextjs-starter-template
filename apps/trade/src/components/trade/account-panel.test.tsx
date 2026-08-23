// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ActiveWalletsView, KindBadge } from "@/components/trade/account-panel"
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
        onRetry={() => {}}
      />
    </TooltipProvider>
  )
}

describe("the active wallet picker", () => {
  it("uses the table words and colours for each kind of money", async () => {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <KindBadge wallet={wallets[1]} />
          <KindBadge wallet={{ ...wallets[0], network: "testnet" }} />
          <KindBadge wallet={wallets[0]} />
        </TooltipProvider>
      )
    )

    expect(host.textContent).toBe("PracticeTestnetReal")
    expect(host.textContent).not.toContain("Live")
    expect(host.querySelector(".text-sky-700")).not.toBeNull()
    expect(host.querySelector(".text-amber-700")).not.toBeNull()
  })

  it("lists every active wallet and switches the wallet in use with one click", async () => {
    await act(async () => root.render(<WalletPicker />))

    expect(host.textContent).toContain("Main")
    expect(host.textContent).toContain("Scalper")
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
    expect(host.querySelector('[aria-label="Trade with Main"]')).not.toBeNull()
  })

  it("keeps each wallet's figures behind its own toggle", async () => {
    await act(async () => root.render(<WalletPicker />))

    expect(host.textContent).not.toContain("$4,000.00")
    expect(host.textContent).not.toContain("$9,000.00")

    const showScalper = host.querySelector<HTMLElement>(
      '[aria-label="Show Scalper figures"]'
    )
    await act(async () => showScalper?.click())

    expect(host.textContent).toContain("$9,000.00")
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
            onRetry={() => {}}
          />
        </TooltipProvider>
      )
    )

    await act(async () =>
      host
        .querySelector<HTMLElement>('[aria-label="Show Main figures"]')
        ?.click()
    )
    expect(host.textContent).toContain("Trading key expires in 30 days.")
    expect(host.textContent).not.toContain("unknown")
  })

  it("opens wallet settings from the expanded figures", async () => {
    const onOpenWallet = vi.fn()
    await act(async () =>
      root.render(<WalletPicker onOpenWallet={onOpenWallet} />)
    )

    await act(async () =>
      host
        .querySelector<HTMLElement>('[aria-label="Show Scalper figures"]')
        ?.click()
    )
    await act(async () =>
      [...host.querySelectorAll<HTMLElement>("button")]
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
      host.querySelector('[aria-label="Show Scalper figures"]')
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
            onRetry={() => {}}
          />
        </TooltipProvider>
      )
    )

    expect(host.textContent).toContain("Two-sided. Change to one-way mode")
    await act(async () =>
      host
        .querySelector<HTMLElement>('[aria-label="Show Main figures"]')
        ?.click()
    )
    expect(host.textContent).toContain("Change Position Mode to One-way Mode")
    expect(host.textContent).not.toContain("Free")
  })
})
