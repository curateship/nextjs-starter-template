// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { DustSweepDialog } from "@/components/trade/dust-sweep-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  loadDustSweepPreview,
  sweepDustCoinApi,
} from "@/lib/api/trade/dust-sweep"
import type { DustSweepPreview } from "@/lib/trade/dust-sweep"
import type { TradeWallet } from "@/lib/trade/wallets"
import { showErrorToast } from "@/lib/toast/error-toast"

vi.mock("@/lib/api/trade/dust-sweep", () => ({
  loadDustSweepPreview: vi.fn(),
  sweepDustCoinApi: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
  useErrorToast: vi.fn(),
}))

const wallet: TradeWallet = {
  id: "sol",
  label: "Solana main",
  kind: "live",
  status: "active",
  protocol: "solana",
  network: "mainnet",
  startingBalance: 100,
  address: "addr",
  hasKey: true,
  keyValidUntil: null,
}

const leftover = (id: string, value: number, back: number) => ({
  marketKey: `solana:mainnet:${id}`,
  coins: 1,
  valueUsd: value,
  feeUsd: value - back,
  backUsd: back,
  verdict: "sweep" as const,
  reason: null,
})

const preview: DustSweepPreview = {
  dollarCoin: "USDC",
  realMoneyOn: true,
  rows: [
    leftover("BONK", 3.1, 3.08),
    leftover("WIF", 7.4, 7.38),
    {
      marketKey: "solana:mainnet:DUST",
      coins: 1,
      valueUsd: 0.01,
      feeUsd: 0.02,
      backUsd: 0,
      verdict: "skip",
      reason: "The fee, about $0.02, is more than half of the $0.01 it is worth.",
    },
  ],
}

const markets = new Map([
  ["solana:mainnet:BONK", { symbol: "BONK" }],
  ["solana:mainnet:WIF", { symbol: "WIF" }],
  ["solana:mainnet:DUST", { symbol: "DUST" }],
]) as never

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
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
  vi.mocked(loadDustSweepPreview).mockResolvedValue(preview)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

async function open(onSwept = vi.fn()) {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <DustSweepDialog
          wallet={wallet}
          markets={markets}
          onClose={() => {}}
          onSwept={onSwept}
        />
      </TooltipProvider>
    )
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
}

function sweepButton() {
  return [...document.body.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.startsWith("Sweep ")
  )
}

it("lists each leftover and offers to sweep only the ones that pass", async () => {
  await open()
  const text = document.body.textContent ?? ""
  expect(text).toContain("BONK")
  expect(text).toContain("Will swap")
  expect(text).toContain("Skipped. The fee, about $0.02")
  expect(text).toContain("2 coins worth $10.50 would bring back about $10.46 USDC. 1 skipped.")
  expect(sweepButton()?.textContent).toBe("Sweep 2 coins")
})

it("keeps going after a refused coin and shows each coin's result", async () => {
  vi.mocked(sweepDustCoinApi)
    .mockResolvedValueOnce({ status: "refused", reason: "Jupiter has no route for this coin." })
    .mockResolvedValueOnce({ status: "swept", backUsd: 7.37 })
  const onSwept = vi.fn()
  await open(onSwept)
  await act(async () => sweepButton()?.click())

  expect(sweepDustCoinApi).toHaveBeenCalledTimes(2)
  expect(vi.mocked(sweepDustCoinApi).mock.calls.map(([input]) => input.marketKey)).toEqual([
    "solana:mainnet:BONK",
    "solana:mainnet:WIF",
  ])
  const text = document.body.textContent ?? ""
  expect(text).toContain("Refused. Jupiter has no route for this coin.")
  expect(text).toContain("Swapped, $7.37 came back")
  expect(text).toContain("Swept 1 of 2. $7.37 USDC came back, against $7.38 quoted.")
  expect(onSwept).toHaveBeenCalledOnce()
})

it("sends nothing while real money is off and says why", async () => {
  vi.mocked(loadDustSweepPreview).mockResolvedValue({ ...preview, realMoneyOn: false })
  await open()
  expect(document.body.textContent).toContain("Real-money trading is switched off")
  await act(async () => sweepButton()?.click())
  expect(sweepDustCoinApi).not.toHaveBeenCalled()
  expect(showErrorToast).toHaveBeenCalledWith(
    expect.stringContaining("Real-money trading is switched off")
  )
})
