import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}))

import { MarketScannerDashboard } from "./market-scanner-dashboard"

describe("MarketScannerDashboard", () => {
  it("keeps worker-wide controls out of the rules page", () => {
    const markup = renderToStaticMarkup(
      <MarketScannerDashboard
        initial={{
          rules: [],
          markets: ["BTC"],
          marketsAvailable: true,
          workerOnline: true,
          paused: false,
          runtimeEnabled: false,
          checkedAt: Date.now(),
        }}
      />
    )

    expect(markup).toContain("Scanner off")
    expect(markup).not.toContain("Turn scanner on")
    expect(markup).not.toContain("Pause scanner")
    expect(markup).toContain("New rule")
  })
})
