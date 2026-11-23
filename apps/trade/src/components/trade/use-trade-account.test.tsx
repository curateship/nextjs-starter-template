// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useTradeAccount } from "@/components/trade/use-trade-account"
import type { DashboardBootstrap } from "@/lib/api/trade/dashboard"
import { loadWalletAccounts } from "@/lib/api/trade/wallets"
import { writeWalletPanelCache } from "@/lib/trade/dashboard-cache"
import type { TradeWallet } from "@/lib/trade/wallets"

vi.mock("@/lib/api/trade/wallets", () => ({
  loadWalletAccounts: vi.fn(),
  pickWallet: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/trade/dashboard-cache", () => ({
  writeWalletPanelCache: vi.fn(),
}))

const wallet: TradeWallet = {
  id: "w1",
  label: "HL1",
  kind: "paper",
  status: "active",
  protocol: "hyperliquid",
  network: "mainnet",
  startingBalance: 1000,
  address: null,
  hasKey: false,
  keyValidUntil: null,
}

type Wallets = DashboardBootstrap["wallets"]

const pending: Wallets = {
  rows: [],
  summaries: [],
  lastWalletIds: { hyperliquid: "w1" },
  error: null,
  pending: true,
}

const streamed: Wallets = {
  rows: [wallet],
  summaries: [],
  lastWalletIds: { hyperliquid: "w1" },
  error: null,
  pending: false,
}

const streamedFailure: Wallets = {
  ...pending,
  error: "The wallets could not be loaded.",
  pending: false,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

function Probe({ initial }: { initial: Wallets }) {
  const account = useTradeAccount("hyperliquid", "scope", initial)
  return (
    <output>
      {account.loading
        ? "loading"
        : account.failed
          ? "failed"
          : (account.activeWallet?.label ?? "none")}
    </output>
  )
}

const shown = () => host.querySelector("output")?.textContent

describe("useTradeAccount with a streamed opening answer", () => {
  it("waits while pending, then adopts the streamed wallets", async () => {
    await act(async () => root.render(<Probe initial={pending} />))
    expect(shown()).toBe("loading")
    // While loading the panel draws the browser-cached copy; the empty
    // pending marker must never overwrite that cache, and no server read
    // leaves — the stream is the first answer.
    await act(async () => vi.advanceTimersByTime(0))
    expect(writeWalletPanelCache).not.toHaveBeenCalled()
    expect(loadWalletAccounts).not.toHaveBeenCalled()

    await act(async () => root.render(<Probe initial={streamed} />))
    expect(shown()).toBe("HL1")
    // The adopted answer becomes the browser-cached copy for the next visit.
    expect(writeWalletPanelCache).toHaveBeenCalledWith(
      "scope",
      expect.objectContaining({ wallets: [wallet], lastWalletId: "w1" })
    )
    // Still no extra read: the next one is the 15-second refresh.
    await act(async () => vi.advanceTimersByTime(0))
    expect(loadWalletAccounts).not.toHaveBeenCalled()
  })

  it("retries at once when the streamed answer carries an error", async () => {
    vi.mocked(loadWalletAccounts).mockReturnValue(new Promise(() => {}))
    await act(async () => root.render(<Probe initial={pending} />))
    await act(async () => root.render(<Probe initial={streamedFailure} />))
    expect(shown()).toBe("failed")
    expect(writeWalletPanelCache).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(0))
    expect(loadWalletAccounts).toHaveBeenCalledOnce()
  })

  it("keeps a poll answer that beat the stream there", async () => {
    // A hidden tab coming back can poll before the stream lands. That
    // answer is fresher than the opening one, so the late stream is ignored.
    vi.mocked(loadWalletAccounts).mockResolvedValue({
      wallets: [{ ...wallet, label: "Fresh" }],
      summaries: [],
      lastWalletIds: { hyperliquid: "w1" },
    })
    await act(async () => root.render(<Probe initial={pending} />))
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(shown()).toBe("Fresh")

    await act(async () => root.render(<Probe initial={streamed} />))
    expect(shown()).toBe("Fresh")
  })
})
