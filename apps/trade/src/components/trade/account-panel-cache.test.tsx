// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { WalletMenuContent } from "@/components/trade/account-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradeAccount } from "@/components/trade/use-trade-account"
import {
  readWalletPanelCache,
  writeWalletPanelCache,
} from "@/lib/trade/dashboard-cache"

it("uses cached wallets only to draw while the real account is loading", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
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
      <TooltipProvider>
        <WalletMenuContent
          account={account}
          cacheScope="person:hyperliquid"
          onAddWallet={() => {}}
          onOpenWalletDetails={() => {}}
        />
      </TooltipProvider>
    )
  })

  expect(host.textContent).toContain("Main wallet")
  expect(host.textContent).not.toContain("Reading your wallets")
  expect(
    host.querySelector<HTMLButtonElement>('[role="checkbox"]')?.disabled
  ).toBe(true)
  const details = host.querySelector<HTMLButtonElement>(
    '[aria-label="Open Main wallet wallet details"]'
  )!
  expect(details.disabled).toBe(true)
  expect(details.parentElement?.tabIndex).toBe(0)
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    )
    details.parentElement?.focus()
  })
  expect(document.body.textContent).toContain(
    "These wallets are from last visit. Waiting for a successful read."
  )
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[role="checkbox"]')?.click()
  })
  expect(switchWallet).not.toHaveBeenCalled()

  await act(async () => {
    root.render(
      <TooltipProvider>
        <WalletMenuContent
          account={{ ...account, loading: false, failed: true }}
          cacheScope="person:hyperliquid"
          onAddWallet={() => {}}
          onOpenWalletDetails={() => {}}
        />
      </TooltipProvider>
    )
  })
  expect(
    host.querySelector<HTMLButtonElement>('[role="checkbox"]')?.disabled
  ).toBe(true)
  expect(host.textContent).toContain("Try again")

  await act(async () =>
    root.render(
      <TooltipProvider>
        <WalletMenuContent
          account={{
            ...account,
            loading: false,
            wallets: readWalletPanelCache("person:hyperliquid")!.wallets,
          }}
          cacheScope="person:hyperliquid"
          onAddWallet={() => {}}
          onOpenWalletDetails={() => {}}
        />
      </TooltipProvider>
    )
  )
  const checkbox = host.querySelector<HTMLButtonElement>('[role="checkbox"]')!
  expect(checkbox.disabled).toBe(false)
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Open Main wallet wallet details"]'
    )?.disabled
  ).toBe(false)
  await act(async () => checkbox.click())
  expect(switchWallet).toHaveBeenCalledWith("wallet")
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
