// @vitest-environment jsdom
import { act, useState } from "react"
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
  function Panel() {
    const [tab, setTab] = useState<"results" | "skipped">("results")
    return (
      <BacktestMarketsPanel
        coins={coins}
        skipped={[{ marketKey: "0", symbol: "YOUNG", reason: reasons[0] }]}
        openCoin={null}
        onOpenCoin={() => {}}
        tab={tab}
        onTabChange={setTab}
      />
    )
  }
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<Panel />))
    expect(host.textContent).not.toContain(reasons[2])
    const tab = host.querySelector<HTMLButtonElement>(
      '[role="tab"][data-state="inactive"]'
    )!
    await act(async () => {
      tab.focus()
      tab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    for (const reason of reasons) expect(host.textContent).toContain(reason)
    expect(host.querySelectorAll("tbody tr")).toHaveLength(3)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
