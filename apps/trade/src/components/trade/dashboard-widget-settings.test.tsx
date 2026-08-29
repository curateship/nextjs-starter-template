// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/trade/trading-overview", () => ({
  getTradingOverviewLayoutErrorMessage: vi.fn(() => "Could not save"),
  getTradingOverviewLayoutLoadErrorMessage: vi.fn(() => "Could not load"),
  loadTradingOverviewLayout: vi.fn(),
  saveTradingOverviewLayout: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

import TradingDashboardWidgetSettings from "@/components/trade/dashboard-widget-settings"
import { TradeSettingsProvider } from "@/components/trade/trade-settings-bootstrap"
import { loadTradingOverviewLayout } from "@/lib/api/trade/trading-overview"

let host: HTMLDivElement
let root: Root

beforeEach(() => {
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
})

describe("trading dashboard widget settings", () => {
  it("draws the route layout without a loading request", async () => {
    await act(async () => {
      root.render(
        <TradeSettingsProvider
          value={{
            tradingWidgets: {
              top: ["equity"],
              left: ["active-trades"],
              right: ["trades"],
            },
          }}
        >
          <TradingDashboardWidgetSettings />
        </TradeSettingsProvider>
      )
    })

    expect(host.textContent).toContain("PnL Graph")
    expect(host.textContent).toContain("Active Trades")
    expect(host.textContent).toContain("Running bots")
    expect(host.textContent).not.toContain("Loading widgets")
    expect(loadTradingOverviewLayout).not.toHaveBeenCalled()
  })
})
