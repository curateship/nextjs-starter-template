// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FlowRunReport } from "@/lib/api/trade/flow-runs"

const { loadCandles, loadFlowRun, loadFlowRunCoin } = vi.hoisted(() => ({
  loadCandles: vi.fn(),
  loadFlowRun: vi.fn(),
  loadFlowRunCoin: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock("@/lib/api/trade/candles", () => ({
  getCandlesErrorMessage: () => "Could not load candles.",
  loadCandles,
}))

vi.mock("@/lib/api/trade/flow-runs", () => ({
  loadFlowRun,
  loadFlowRunCoin,
}))

vi.mock("@/components/flow-run/flow-run-chart-panel", () => ({
  FlowRunChartPanel: ({ ladders }: { ladders: unknown[] }) => (
    <div data-testid="run-chart" data-ladders={ladders.length} />
  ),
}))

vi.mock("@/components/flow-run/flow-run-coins-panel", () => ({
  FlowRunCoinsPanel: () => null,
}))

vi.mock("@/components/flow-run/flow-run-stats-panel", () => ({
  FlowRunStatsPanel: () => null,
}))

vi.mock("@/components/flow-run/flow-run-trades-panel", () => ({
  FlowRunTradesPanel: () => null,
}))

vi.mock("@/components/ui/resizable", () => ({
  BOTTOM_COLLAPSED_HEIGHT: "40px",
  PanelReopenTab: () => null,
  ResizableHandle: () => null,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => children,
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) =>
    children,
  WorkspacePanel: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/trade/use-chart-view", () => ({
  useRememberedChartView: () => ({
    readView: () => null,
    onViewChange: vi.fn(),
  }),
}))

vi.mock("@/components/trade/use-panel-layouts", () => ({
  useTradePanelLayouts: () => ({
    layouts: {
      legacyImported: true,
      current: {},
      openMarketRows: {},
      headerProfitVisible: true,
      chartToolbarPosition: null,
      activeNamedId: null,
      named: [],
    },
    remember: vi.fn(),
    rememberChartToolbarPosition: vi.fn(),
  }),
}))

vi.mock("@/lib/layout/panel-collapse", () => ({
  useBlankSpaceDoubleClick: () => vi.fn(),
  usePanelToggle: () => vi.fn(),
}))

vi.mock("@/lib/trade/panel-layout", () => ({
  useRememberedPanelLayoutInPlace: () => ({
    groupRef: vi.fn(),
    onLayoutChanged: vi.fn(),
  }),
}))

vi.mock("@/lib/layout/wide-screen", () => ({
  useWideScreen: () => false,
}))

vi.mock("@/lib/trade/backtest/graph", () => ({
  buildGraphSeries: vi.fn(),
  graphView: vi.fn(),
  windowStats: vi.fn(),
  WHOLE_RUN: { kind: "whole" },
}))

vi.mock("@/lib/trade/flow-run/equity", () => ({
  buildFlowRunEquity: () => ({ equity: [], inPlay: [], runTrades: [] }),
}))

const { FlowRunPage } = await import("@/components/flow-run/flow-run-page")

const MARKET = "hyperliquid:mainnet:ETH"

function report(working: boolean): FlowRunReport {
  return {
    readAt: 1_700_000_000_000,
    head: {
      id: "run-1",
      automationId: "flow-1",
      automationName: "DCA",
      walletId: "wallet-1",
      walletLabel: "Live",
      real: true,
      venue: "Hyperliquid",
      status: "running",
      paused: false,
      holding: false,
      capUsd: 100,
      coins: 1,
      working: working ? 1 : 0,
      startedAt: 1_700_000_000_000,
      stoppedAt: null,
      stoppedReason: null,
    },
    spec: {
      protocol: "hyperliquid",
      network: "mainnet",
      folderId: null,
      marketKeys: [MARKET],
      strategy: { kind: "dca", interval: "1m" } as never,
      capUsd: 100,
      walletLabel: "Live",
      real: true,
    },
    coins: [
      {
        marketKey: MARKET,
        coin: "ETH",
        working,
        words: working ? null : "Not looked at yet",
        problem: false,
        netUsd: 0,
        trades: 0,
      },
    ],
    waiting: [],
    headline: null,
    positions: [],
    trades: [],
    notMine: 0,
    unreachable: false,
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  loadCandles.mockResolvedValue({ candles: [] })
  loadFlowRun.mockResolvedValue(report(true))
  loadFlowRunCoin
    .mockResolvedValueOnce({ marks: [], ladders: [] })
    .mockResolvedValue({ marks: [], ladders: [{ kind: "dca" }] })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("a live run coin's chart", () => {
  it("reloads its rungs when the run changes from waiting to working", async () => {
    await act(async () => {
      root.render(
        <FlowRunPage
          initial={report(false)}
          openCoin={MARKET}
          chartView={null}
          initialPanelLayouts={{
            legacyImported: true,
            current: {},
            openMarketRows: {},
            headerProfitVisible: true,
            chartToolbarPosition: null,
            activeNamedId: null,
            named: [],
          }}
        />
      )
    })

    expect(loadFlowRunCoin).toHaveBeenCalledTimes(1)
    expect(
      host
        .querySelector("[data-testid=run-chart]")
        ?.getAttribute("data-ladders")
    ).toBe("0")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(loadFlowRun).toHaveBeenCalledTimes(1)
    expect(loadFlowRunCoin).toHaveBeenCalledTimes(2)
    expect(
      host
        .querySelector("[data-testid=run-chart]")
        ?.getAttribute("data-ladders")
    ).toBe("1")
  })
})
