// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WalletSettingsDialog } from "@/components/trade/wallet-dialogs"
import { updateWallet } from "@/lib/api/trade/wallets"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { TradeWallet } from "@/lib/trade/wallets"

vi.mock("@/lib/api/trade/wallets", () => ({
  createWallet: vi.fn(),
  deleteWallet: vi.fn(),
  updateWallet: vi.fn(),
  getWalletErrorMessage: () => "Could not save wallet",
}))
vi.mock("@/lib/api/trade/protocols", () => ({ loadProtocolsOnce: vi.fn() }))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

const wallet: TradeWallet = {
  id: "paper",
  label: "Practice",
  kind: "paper",
  status: "active",
  protocol: "hyperliquid",
  network: "testnet",
  startingBalance: 1000,
  address: null,
  hasKey: false,
  keyValidUntil: null,
}
let root: Root
let host: HTMLDivElement
const onClose = vi.fn()
const onChanged = vi.fn()
beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.resetAllMocks()
})
async function render(current = wallet) {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <WalletSettingsDialog
          wallet={current}
          active
          onClose={onClose}
          onChanged={onChanged}
          onUse={vi.fn()}
        />
      </TooltipProvider>
    )
  )
}
async function enter(id: string, value: string) {
  await act(async () => {
    const input = document.getElementById(id) as HTMLInputElement
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value)
    input.dispatchEvent(new InputEvent("input", { bubbles: true }))
  })
}
async function save() {
  await act(async () => document.querySelector("form")!.requestSubmit())
}
it("opens old wallets with blank fields and saves both distances", async () => {
  await render()
  expect(
    (document.getElementById("wallet-warning-usd") as HTMLInputElement).value
  ).toBe("")
  expect(
    (document.getElementById("wallet-warning-pct") as HTMLInputElement)
      .placeholder
  ).toBe("Use account setting")
  await enter("wallet-warning-usd", "50")
  await enter("wallet-warning-pct", "5")
  await save()
  expect(updateWallet).toHaveBeenCalledWith({
    id: wallet.id,
    liquidationWarning: { usd: 50, pct: 5 },
  })
  expect(onChanged).toHaveBeenCalledOnce()
  expect(onClose).toHaveBeenCalledOnce()
})
it("clears saved distances back to account settings", async () => {
  await render({ ...wallet, liquidationWarning: { usd: 50, pct: 5 } })
  expect(
    (document.getElementById("wallet-warning-usd") as HTMLInputElement).value
  ).toBe("50")
  await enter("wallet-warning-usd", "")
  await enter("wallet-warning-pct", "")
  await save()
  expect(updateWallet).toHaveBeenCalledWith({
    id: wallet.id,
    liquidationWarning: { usd: null, pct: null },
  })
})
it.each([
  ["wallet-warning-usd", "0"],
  ["wallet-warning-usd", "-5"],
  ["wallet-warning-usd", "NaN"],
  ["wallet-warning-usd", "1000000001"],
  ["wallet-warning-pct", "101"],
])("refuses invalid %s value %s without losing the edit", async (id, value) => {
  await render()
  await enter(id, value)
  await save()
  expect(updateWallet).not.toHaveBeenCalled()
  expect(document.getElementById(id)?.getAttribute("aria-invalid")).toBe("true")
  expect((document.getElementById(id) as HTMLInputElement).value).toBe(value)
  expect(showErrorToast).toHaveBeenCalledOnce()
  expect(onClose).not.toHaveBeenCalled()
})
it("preserves the fields and keeps the window open after a failed save", async () => {
  vi.mocked(updateWallet).mockRejectedValueOnce(new Error("offline"))
  await render()
  await enter("wallet-warning-usd", "50")
  await save()
  expect(showErrorToast).toHaveBeenCalledWith("Could not save wallet")
  expect(
    (document.getElementById("wallet-warning-usd") as HTMLInputElement).value
  ).toBe("50")
  expect(onClose).not.toHaveBeenCalled()
})
