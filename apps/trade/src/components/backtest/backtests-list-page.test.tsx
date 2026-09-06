// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BacktestsListPage } from "@/components/backtest/backtests-list-page"
import { BacktestStatsPanel } from "@/components/backtest/backtest-stats-panel"
import { defaultDcaParams } from "@/lib/trade/dca"
import type { BacktestListRow } from "@/lib/trade/backtest/result"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { loadBacktests } = vi.hoisted(() => ({ loadBacktests: vi.fn() }))
vi.mock("@/lib/api/trade/backtests", () => ({
  loadBacktests,
  archiveBacktests: vi.fn(),
  deleteBacktests: vi.fn(),
  pinBacktests: vi.fn(),
  getBacktestErrorMessage: () => "Could not load runs",
}))
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn(), invalidate: vi.fn() }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/backtest/backtest-rename-dialog", () => ({
  BacktestRenameDialog: () => null,
}))
vi.mock("@/components/backtest/backtest-pot-mini", () => ({
  BacktestPotMini: () => null,
}))

const NOW = 1_800_000_000_000
function run(
  name: string,
  duration: number,
  over: Partial<BacktestListRow> = {}
): BacktestListRow {
  return {
    id: name,
    name,
    automationId: "flow",
    automationName: "Flow",
    pinned: false,
    archived: false,
    createdAt: NOW - duration,
    finishedAt: NOW,
    failed: false,
    stopRequested: false,
    summary: null,
    progress: 1,
    progressNote: "Done",
    coinsDone: 1,
    coinsTotal: 1,
    spec: {
      startingUsd: 1000,
      takerFeePct: 0,
      makerFeePct: 0,
      slippagePct: 0,
      days: 30,
      interval: "4h",
      marketKeys: ["hyperliquid:mainnet:BTC"],
      from: 0,
      to: NOW,
      strategy: { kind: "dca", params: defaultDcaParams() },
    },
    ...over,
  }
}
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  loadBacktests.mockReset()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})
async function renderList(rows: BacktestListRow[]) {
  loadBacktests.mockResolvedValue({ runs: rows })
  await act(async () => root.render(<BacktestsListPage initial={rows} />))
}
const names = () =>
  [...host.querySelectorAll("tbody tr a")].map((one) => one.textContent)
async function sortTook() {
  const button = [...host.querySelectorAll("button")].find(
    (one) => one.textContent === "Took"
  )!
  await act(async () => button.click())
}

describe("backtest elapsed time", () => {
  it("sorts numeric durations both ways while keeping pinned runs first", async () => {
    await renderList([
      run("Long", 120_000),
      run("Short", 9_000),
      run("Pinned", 300_000, { pinned: true }),
    ])
    expect(host.textContent).toContain("Took 2m")
    expect(host.textContent).toContain("Took 9s")
    await sortTook()
    expect(names()).toEqual(["Pinned", "Short", "Long"])
    await sortTook()
    expect(names()).toEqual(["Pinned", "Long", "Short"])
  })

  it("ticks locally without adding requests and freezes when the run finishes", async () => {
    const active = run("Active", 10_000, { finishedAt: null })
    await renderList([active])
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(host.textContent).toContain("Running for 11s")
    expect(loadBacktests).not.toHaveBeenCalled()
    loadBacktests.mockResolvedValue({
      runs: [{ ...active, finishedAt: NOW + 1500 }],
    })
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(host.textContent).toContain("Took 12s")
    expect(loadBacktests).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(host.textContent).toContain("Took 12s")
    expect(loadBacktests).toHaveBeenCalledOnce()
  })

  it("names a failed run and handles an empty list", async () => {
    await renderList([run("Failed", 720_000, { failed: true })])
    expect(host.textContent).toContain("Gave up after 12m")
    expect(host.textContent).not.toContain("Took 12m")
    await act(async () => root.unmount())
    root = createRoot(host)
    await renderList([])
    expect(host.textContent).toContain("No backtests yet")
    expect(host.querySelector("td[colspan='8']")).not.toBeNull()
  })

  it.each([false, true])(
    "shows the same finished duration in the stats header, failed=%s",
    async (failed) => {
      const row = run("Finished", 240_000, { failed })
      await renderList([row])
      const duration = failed ? "Gave up after 4m" : "Took 4m"
      expect(host.textContent).toContain(duration)
      const props: ComponentProps<typeof BacktestStatsPanel> = {
        timing: row,
        summary: null,
        result: null,
        spec: row.spec,
        series: null,
        stats: null,
        window: { preset: "all", from: null, to: null, sel: null },
        onWindow: () => {},
        coinsTotal: 1,
        running: false,
      }
      await act(async () => root.render(<BacktestStatsPanel {...props} />))
      expect(host.querySelector("h2")?.textContent).toContain(duration)
    }
  )

  it("ticks the run header and stops its clock after completion", async () => {
    const row = run("Active", 10_000, { finishedAt: null })
    const props: ComponentProps<typeof BacktestStatsPanel> = {
      timing: row,
      summary: null,
      result: null,
      spec: row.spec,
      series: null,
      stats: null,
      window: { preset: "all", from: null, to: null, sel: null },
      onWindow: () => {},
      coinsTotal: 1,
      running: true,
    }
    await act(async () => root.render(<BacktestStatsPanel {...props} />))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(host.querySelector("h2")?.textContent).toContain("Running for 11s")
    await act(async () =>
      root.render(
        <BacktestStatsPanel
          {...props}
          running={false}
          timing={{ ...row, finishedAt: NOW + 1000 }}
        />
      )
    )
    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(host.querySelector("h2")?.textContent).toContain("Took 11s")
    expect(loadBacktests).not.toHaveBeenCalled()
  })

  it("clamps a future start to zero instead of showing negative time", async () => {
    await renderList([run("Future", -5000, { finishedAt: null })])
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(host.textContent).toContain("Running for 0s")
  })
})
