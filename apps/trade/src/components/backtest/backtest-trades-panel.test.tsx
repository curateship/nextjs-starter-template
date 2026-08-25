// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { BacktestTradesPanel } from "@/components/backtest/backtest-trades-panel"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const { showErrorToast } = vi.hoisted(() => ({ showErrorToast: vi.fn() }))

vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast }))

describe("the backtest trades panel", () => {
  it("shows a failed coin load with the same retry used by the chart", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const retry = vi.fn()

    await act(async () => {
      root.render(
        <BacktestTradesPanel
          symbol="BTC"
          summary={null}
          trades={[]}
          loading
          error="The BTC candles could not be read."
          selected={null}
          onRetry={retry}
          onSelect={() => {}}
        />
      )
    })

    expect(host.textContent).not.toContain("Loading…")
    expect(showErrorToast).toHaveBeenCalledWith(
      "The BTC candles could not be read.",
      expect.objectContaining({ label: "Try again" })
    )
    const action = showErrorToast.mock.calls[0]?.[1]
    await act(async () => action?.onClick())
    expect(retry).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    host.remove()
  })
})
