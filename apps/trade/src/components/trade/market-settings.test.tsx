// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock("@/lib/api/trade/market-settings", () => ({
  getMarketSettingsLoadErrorMessage: vi.fn(() => "Could not load"),
  getMarketSettingsSaveErrorMessage: vi.fn(() => "Could not save"),
  loadMarketSettings: vi.fn(),
  saveMarketSettings: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

import MarketSettings from "@/components/trade/market-settings"
import { TradeSettingsProvider } from "@/components/trade/trade-settings-bootstrap"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadMarketSettings } from "@/lib/api/trade/market-settings"

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

describe("market settings", () => {
  it("draws the route value without a loading request", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <TradeSettingsProvider value={{ minimumMarketVolumeUsd: 1_000_000 }}>
            <MarketSettings />
          </TradeSettingsProvider>
        </TooltipProvider>
      )
    })

    expect(
      host.querySelector<HTMLInputElement>("#minimum-market-volume")?.value
    ).toBe("1000000")
    expect(host.textContent).not.toContain("Loading market settings")
    expect(loadMarketSettings).not.toHaveBeenCalled()
  })
})
