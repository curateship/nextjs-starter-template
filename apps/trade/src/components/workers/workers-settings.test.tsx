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
import {
  changeRealMoneySwitch,
  changeWorkerSwitch,
  loadWorkers,
} from "@/lib/api/trade/workers"
import { loadRememberedOrderStyle } from "@/lib/api/trade/quick-order"
import type { WorkersDashboard } from "@/lib/trade/workers"

vi.mock("@/components/workers/engine-errors-card", () => ({
  EngineErrorsCard: () => null,
}))

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
  vi.useRealTimers()
})

describe("the trading engine error", () => {
  it("dismisses one occurrence but shows the same message on a later failure", async () => {
    vi.useFakeTimers()
    const data: WorkersDashboard = {
      checkedAt: "2026-09-05T12:00:00.000Z",
      canControl: true,
      realMoney: { masterAllowed: false, enabled: false },
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
          startedAt: "2026-09-05T10:00:00.000Z",
          lastSeenAt: "2026-09-05T12:00:00.000Z",
          activity: "Working",
          latestError: "Connection refused",
          latestErrorAt: "2026-09-05T11:59:00.000Z",
          host: "engine",
          figures: [],
        },
      ],
    }
    vi.mocked(loadWorkers).mockResolvedValue(data)
    vi.mocked(loadRememberedOrderStyle).mockResolvedValue({
      orderStyle: "rest",
    })
    await act(async () =>
      root.render(
        <TooltipProvider>
          <WorkersSettings />
        </TooltipProvider>
      )
    )
    const dismiss = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Dismiss"
    )!
    expect(dismiss.getAttribute("data-variant")).toBe("ghost")
    expect(dismiss.getAttribute("data-size")).toBe("xs")
    dismiss.focus()
    expect(document.activeElement).toBe(dismiss)
    await act(async () => dismiss.click())
    expect(host.textContent).not.toContain("Last error · Connection refused")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(host.textContent).not.toContain("Last error · Connection refused")
    vi.mocked(loadWorkers).mockResolvedValue({
      ...data,
      workers: [
        { ...data.workers[0], latestErrorAt: "2026-09-05T12:01:00.000Z" },
      ],
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(host.textContent).toContain("Last error · Connection refused")
  })
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
                    latestErrorAt: "2026-08-29T12:00:00.000Z",
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
              engineUptime: {
                outages: [],
                totalDowntimeMs: 0,
                checkedAt: "2026-09-06T12:00:00.000Z",
              },
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

describe("the risky switches ask first", () => {
  const dashboard = (
    worker: { enabled: boolean; paused: boolean },
    realMoney: boolean
  ): WorkersDashboard => ({
    checkedAt: "2026-09-23T12:00:00.000Z",
    canControl: true,
    realMoney: { masterAllowed: true, enabled: realMoney },
    workers: [
      {
        kind: "ladders",
        label: "Trading engine",
        description: "Works ladders",
        state: "running",
        ...worker,
        restartRequested: false,
        online: true,
        copies: 1,
        role: "leader",
        startedAt: "2026-09-23T10:00:00.000Z",
        lastSeenAt: "2026-09-23T12:00:00.000Z",
        activity: "Working",
        latestError: null,
        latestErrorAt: null,
        host: "engine",
        figures: [],
      },
    ],
  })

  const show = async (data: WorkersDashboard) => {
    vi.mocked(loadWorkers).mockResolvedValue(data)
    vi.mocked(loadRememberedOrderStyle).mockResolvedValue({
      orderStyle: "rest",
    })
    await act(async () =>
      root.render(
        <TooltipProvider>
          <WorkersSettings />
        </TooltipProvider>
      )
    )
  }
  const switchFor = (id: string) =>
    host.querySelector<HTMLButtonElement>(`#${id}`)!
  const dialogButton = (label: string) =>
    [...document.body.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent === label
    ) as HTMLButtonElement | undefined

  it("asks before switching the engine off, and Cancel changes nothing", async () => {
    await show(dashboard({ enabled: true, paused: false }, false))
    await act(async () => switchFor("ladders-enabled").click())

    expect(document.body.textContent).toContain("Switch the engine off?")
    expect(changeWorkerSwitch).not.toHaveBeenCalled()
    expect(switchFor("ladders-enabled").getAttribute("aria-checked")).toBe(
      "true"
    )

    await act(async () => dialogButton("Cancel")!.click())
    expect(changeWorkerSwitch).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain("Switch the engine off?")
  })

  it("pauses trading only once the question is confirmed", async () => {
    const data = dashboard({ enabled: true, paused: false }, false)
    await show(data)
    vi.mocked(changeWorkerSwitch).mockResolvedValue(
      dashboard({ enabled: true, paused: true }, false)
    )
    await act(async () => switchFor("ladders-trading").click())
    expect(changeWorkerSwitch).not.toHaveBeenCalled()

    await act(async () => dialogButton("Pause trading")!.click())
    expect(changeWorkerSwitch).toHaveBeenCalledWith({
      kind: "ladders",
      change: { paused: true },
    })
    expect(document.body.textContent).not.toContain("Pause trading?")
  })

  it("switches trading and the engine back on in one click", async () => {
    await show(dashboard({ enabled: true, paused: true }, false))
    vi.mocked(changeWorkerSwitch).mockResolvedValue(
      dashboard({ enabled: true, paused: false }, false)
    )
    await act(async () => switchFor("ladders-trading").click())
    expect(changeWorkerSwitch).toHaveBeenCalledWith({
      kind: "ladders",
      change: { paused: false },
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it("asks before real money goes on, never before it goes off", async () => {
    await show(dashboard({ enabled: true, paused: false }, false))
    vi.mocked(changeRealMoneySwitch).mockResolvedValue(
      dashboard({ enabled: true, paused: false }, true)
    )
    await act(async () => switchFor("real-money").click())
    expect(changeRealMoneySwitch).not.toHaveBeenCalled()
    await act(async () => dialogButton("Switch on")!.click())
    expect(changeRealMoneySwitch).toHaveBeenCalledWith(true)

    await act(async () => switchFor("real-money").click())
    expect(changeRealMoneySwitch).toHaveBeenLastCalledWith(false)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
