// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/trade/workers", () => ({
  changeRealMoneySwitch: vi.fn(),
  changeWorkerSwitch: vi.fn(),
  getWorkersErrorMessage: vi.fn(() => "Could not reach the engine"),
  loadWorkers: vi.fn(),
  restartWorker: vi.fn(),
}))
vi.mock("@/lib/api/trade/quick-order", () => ({
  loadRememberedOrderStyle: vi.fn(),
  saveRememberedOrderStyle: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/components/workers/liquidation-warning-settings", () => ({
  LiquidationWarningSettings: () => null,
}))
vi.mock("@/components/workers/aster-margin-settings", () => ({
  AsterMarginSettings: () => null,
}))

import { TradingEngineSettingsProvider } from "@/components/workers/trading-engine-settings-bootstrap"
import WorkersSettings from "@/components/workers/workers-settings"
import { TooltipProvider } from "@/components/ui/tooltip"

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

describe("the trading engine error", () => {
  it("shows a stuck wallet in a red notice with written error text", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <TradingEngineSettingsProvider
            value={{
              workers: {
                checkedAt: "2026-08-29T12:02:05.000Z",
                canControl: true,
                workers: [
                  {
                    kind: "ladders",
                    label: "Trading engine",
                    description: "Works ladders",
                    state: "running",
                    enabled: true,
                    paused: false,
                    restartRequested: false,
                    online: true,
                    copies: 1,
                    role: "leader",
                    startedAt: "2026-08-29T10:00:00.000Z",
                    lastSeenAt: "2026-08-29T12:02:00.000Z",
                    activity: "Working 1 wallet",
                    latestError:
                      "Wallet Main wallet has been working for 2 minutes and has not finished.",
                    host: "engine",
                    figures: [
                      { label: "Ladders working", value: "1" },
                      { label: "Copies alive", value: "1" },
                      { label: "Prices", value: "Hyperliquid: live" },
                      {
                        label: "Build",
                        value: "built 2026-09-04 12:55 UTC (abc1234)",
                      },
                    ],
                  },
                ],
                realMoney: { masterAllowed: false, enabled: false },
              },
              liquidationWarning: { usd: null, pct: null },
              asterMargins: [],
              orderStyle: "rest",
              engineErrors: [],
            }}
          >
            <WorkersSettings />
          </TradingEngineSettingsProvider>
        </TooltipProvider>
      )
    })

    expect(host.textContent).toContain(
      "Last error · Wallet Main wallet has been working for 2 minutes and has not finished."
    )
    // The build the copy runs, so a container left on an old build is read
    // off the card rather than guessed at.
    expect(host.textContent).toContain("Build")
    expect(host.textContent).toContain("built 2026-09-04 12:55 UTC (abc1234)")
    const notice = [...host.querySelectorAll("div")].find((element) =>
      element.className.includes("bg-destructive/10")
    )
    expect(notice?.className).toContain("text-destructive")
  })
})
