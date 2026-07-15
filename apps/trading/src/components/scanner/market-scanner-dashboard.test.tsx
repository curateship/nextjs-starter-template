import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}))

import { MarketScannerDashboard } from "./market-scanner-dashboard"

describe("MarketScannerDashboard", () => {
  it("shows the manual power control without removing the pause control", () => {
    const markup = renderToStaticMarkup(
      <MarketScannerDashboard
        initial={{
          rules: [],
          markets: ["BTC"],
          marketsAvailable: true,
          workerOnline: true,
          paused: false,
          runtimeEnabled: false,
          canControlRuntime: true,
          checkedAt: Date.now(),
        }}
      />
    )

    expect(markup).toContain("Scanner off")
    expect(markup).toContain("Turn scanner on")
    expect(markup).toContain("Pause scanner")
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*Pause scanner/s)
  })
})
