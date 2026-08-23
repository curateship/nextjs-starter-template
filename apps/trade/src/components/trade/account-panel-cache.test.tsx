// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { AccountPanel } from "@/components/trade/account-panel"
import type { TradeAccount } from "@/components/trade/use-trade-account"
import { writeWalletPanelCache } from "@/lib/trade/dashboard-cache"

it("uses cached wallets only to draw while the real account is loading", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  const switchWallet = vi.fn()
  writeWalletPanelCache("person:hyperliquid", {
    wallets: [
      {
        id: "wallet",
        label: "Main wallet",
        kind: "paper",
        status: "active",
        protocol: "hyperliquid",
        network: "mainnet",
        startingBalance: 1_000,
        address: null,
        hasKey: false,
        keyValidUntil: null,
      },
    ],
    summaries: [{ walletId: "wallet", state: "inactive" }],
    lastWalletId: null,
  })
  const account: TradeAccount = {
    loading: true,
    failed: false,
    wallets: [],
    summaryOf: () => null,
    activeWallet: null,
    refresh: async () => {},
    switchWallet,
  }
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(
      <AccountPanel
        account={account}
        positions={[]}
        fallbackMarks={new Map()}
        cacheScope="person:hyperliquid"
        onAddWallet={() => {}}
        onOpenWallet={() => {}}
      />
    )
  })

  expect(host.textContent).toContain("Main wallet")
  expect(host.textContent).not.toContain("Reading your wallets")
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[role="checkbox"]')?.click()
  })
  expect(switchWallet).not.toHaveBeenCalled()

  await act(async () => root.unmount())
  host.remove()
})
