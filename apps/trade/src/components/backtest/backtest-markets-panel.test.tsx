// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { BacktestMarketsPanel } from "./backtest-markets-panel"
import type { BacktestCoinRow } from "./backtest-run-page"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

it("shows each saved skip and failure reason, without duplicate coins", async () => {
  const reasons = [
    "Listed on 12 Mar 2026, so no candles before then",
    "Could not download candles from Binance",
    "The strategy could not finish this coin.",
  ]
  const coins: BacktestCoinRow[] = reasons.map((reason, index) => ({
    id: String(index),
    marketKey: String(index),
    symbol: ["YOUNG", "DOWNLOAD", "ENGINE"][index],
    status: index === 2 ? "error" : "skipped",
    progress: 1,
    progressNote: "",
    skipReason: index === 2 ? null : reason,
    error: index === 2 ? reason : null,
    summary: null,
  }))
  // The right panel's Skipped tab picks this list; the panel has no tabs of its own.
  const panel = (
    <BacktestMarketsPanel
      coins={coins}
      skipped={[{ marketKey: "0", symbol: "YOUNG", reason: reasons[0] }]}
      openCoin={null}
      onOpenCoin={() => {}}
      tab="skipped"
    />
  )
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(panel))
    for (const reason of reasons) expect(host.textContent).toContain(reason)
    expect(host.querySelectorAll("[data-skipped-coin]")).toHaveLength(3)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("shows changing progress notes for unfinished coins", async () => {
  const coin: BacktestCoinRow = {
    id: "btc",
    marketKey: "hyperliquid:mainnet:BTC",
    symbol: "BTC",
    status: "running",
    progress: 0.42,
    progressNote: "Reading candles",
    skipReason: null,
    error: null,
    summary: null,
  }
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const render = (progressNote: string) => (
    <BacktestMarketsPanel
      coins={[{ ...coin, progressNote }]}
      skipped={[]}
      openCoin={null}
      onOpenCoin={() => {}}
      tab="traded"
    />
  )
  try {
    await act(async () => root.render(render("Reading candles")))
    expect(host.textContent).toContain("Reading candles")
    await act(async () => root.render(render("Running strategy")))
    expect(host.textContent).toContain("Running strategy")
    expect(host.textContent).not.toContain("Reading candles")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
