// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import BacktestCanvasPanel from "@/components/automations/backtest-canvas-panel"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useNavigate: () => vi.fn(),
}))

vi.mock("@/lib/api/trade/backtests", () => ({
  getBacktestErrorMessage: (error: unknown) => String(error),
  loadBacktests: vi.fn(async () => ({ runs: [] })),
  loadLastBacktestAttempt: vi.fn(async () => ({ attempt: null })),
  stopBacktest: vi.fn(),
}))

vi.mock("@/lib/api/trade/flow-trading", () => ({
  loadFlowTrading: vi.fn(async () => ({ mode: "backtest" })),
}))

describe("the backtest canvas panel", () => {
  it("shows the Backtest button for a pretend-money flow", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <BacktestCanvasPanel
          automationId="grid-flow"
          runId={null}
          onClose={() => {}}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Backtest"
      )
    ).toBe(true)

    await act(async () => root.unmount())
    host.remove()
  })
})
