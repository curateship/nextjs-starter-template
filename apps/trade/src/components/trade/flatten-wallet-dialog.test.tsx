// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { FlattenWalletDialog } from "@/components/trade/flatten-wallet-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradeWallet } from "@/lib/trade/wallets"
import type { TradePosition } from "@/lib/trade/paper"

vi.mock("@/lib/trade/live-market", () => ({ useLiveMarks: () => new Map() }))

const wallet: TradeWallet = {
  id: "paper",
  label: "Practice",
  kind: "paper",
  status: "active",
  protocol: "hyperliquid",
  network: "mainnet",
  startingBalance: 1000,
  address: null,
  hasKey: false,
  keyValidUntil: null,
}
const position: TradePosition = {
  id: "position",
  walletId: "paper",
  marketKey: "hyperliquid:mainnet:BTC",
  szi: 1,
  entryPx: 100,
  leverage: 1,
  maxLeverage: 10,
  targets: [],
  tpPx: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 1,
}
let host: HTMLDivElement
let root: Root
const confirm = vi.fn()
const dismiss = vi.fn()

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
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
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
async function render(positions: TradePosition[], busy = false) {
  await act(async () =>
    root.render(
      <TooltipProvider delayDuration={0}>
        <FlattenWalletDialog
          wallet={wallet}
          positions={positions}
          smartOrders={[]}
          busy={busy}
          onConfirm={confirm}
          onDismiss={dismiss}
        />
      </TooltipProvider>
    )
  )
}
function button(text: string) {
  return [...document.querySelectorAll("button")].find(
    (one) => one.textContent === text
  )!
}

it("blocks an empty wallet, explains why on keyboard focus, and allows Cancel", async () => {
  await render([{ ...position, walletId: "another-wallet" }])
  const empty = button("Empty the wallet")
  expect(empty.disabled).toBe(true)
  await act(async () => empty.click())
  expect(confirm).not.toHaveBeenCalled()
  await act(async () => button("Cancel").focus())
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    )
    empty.parentElement!.focus()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
    "Practice holds nothing and has nothing waiting, so there is nothing to empty."
  )
  expect(button("Cancel").disabled).toBe(false)
  await act(async () => button("Cancel").click())
  expect(dismiss).toHaveBeenCalledOnce()
})

it("confirms a wallet holding a position and blocks repeat clicks while busy", async () => {
  await render([position])
  expect(button("Empty the wallet").disabled).toBe(false)
  await act(async () => button("Empty the wallet").click())
  expect(confirm).toHaveBeenCalledWith(wallet)
  await render([position], true)
  expect(button("Empty the wallet").disabled).toBe(true)
  expect(button("Cancel").disabled).toBe(true)
})
