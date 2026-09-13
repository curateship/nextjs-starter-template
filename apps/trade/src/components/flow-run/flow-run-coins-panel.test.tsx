// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FlowRunCoinsPanel } from "@/components/flow-run/flow-run-coins-panel"
import type { FlowRunReport } from "@/lib/api/trade/flow-runs"

import { stopRunCoin } from "@/lib/api/trade/flow-trading"
import { showErrorToast } from "@/lib/toast/error-toast"
vi.mock("@/lib/api/trade/flow-trading", () => ({ stopRunCoin: vi.fn() }))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

const MARKET = "hyperliquid:mainnet:ETH"

const STOPPED_REPORT: FlowRunReport = {
  readAt: 1_700_000_000_000,
  head: {
    id: "run-1",
    automationId: "flow-1",
    automationName: "DCA",
    walletId: "wallet-1",
    walletLabel: "Live",
    real: true,
    venue: "Hyperliquid",
    status: "stopped",
    paused: true,
    holding: false,
    capUsd: 100,
    coins: 1,
    working: 0,
    startedAt: 1_700_000_000_000,
    stoppedAt: 1_700_000_060_000,
    stoppedReason: "Switched off by hand.",
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
      working: false,
      words: "Stopped",
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

describe("a stopped run's coins", () => {
  it("does not say rungs are still placed", async () => {
    await act(async () => {
      root.render(
        <FlowRunCoinsPanel
          report={STOPPED_REPORT}
          openCoin={null}
          onOpenCoin={vi.fn()}
        />
      )
    })

    expect(host.textContent).toContain("Stopped")
    expect(host.textContent).not.toContain("Rungs placed")
  })
})

it("confirms the coin, surfaces refusals, and waits for engine completion", async () => {
  const report = {
    ...STOPPED_REPORT,
    head: { ...STOPPED_REPORT.head, status: "running" as const },
    positions: [
      {
        marketKey: MARKET,
        coin: "ETH",
        direction: "long" as const,
        sz: 0.5,
        entryPx: 100,
        markPx: 110,
        amountUsd: 50,
        unrealisedUsd: 5,
        stopPx: 90,
        targetPx: 120,
        openedAt: 1,
      },
    ],
  }
  const refresh = vi.fn()
  await act(async () =>
    root.render(
      <FlowRunCoinsPanel
        report={report}
        openCoin={null}
        onOpenCoin={vi.fn()}
        onRefresh={refresh}
      />
    )
  )
  await act(async () =>
    (host.querySelector('[aria-label="Stop ETH"]') as HTMLButtonElement).click()
  )
  expect(document.body.textContent).toContain("Stop ETH?")
  expect(document.body.textContent).toContain("Nothing is sold")
  expect(document.body.textContent).toContain("0.5 ETH stays held")
  const confirm = () =>
    [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Stop coin"
    )!
  vi.mocked(stopRunCoin).mockRejectedValueOnce(
    new Error("Run stopped elsewhere")
  )
  await act(async () => confirm().click())
  expect(showErrorToast).toHaveBeenCalledWith("Run stopped elsewhere")
  expect(refresh).not.toHaveBeenCalled()
  vi.mocked(stopRunCoin).mockResolvedValueOnce(undefined)
  await act(async () => confirm().click())
  expect(stopRunCoin).toHaveBeenLastCalledWith("run-1", MARKET)
  expect(host.textContent).toContain("Stopping")
  expect(refresh).toHaveBeenCalledOnce()
  await act(async () =>
    root.render(
      <FlowRunCoinsPanel
        report={{
          ...report,
          spec: {
            ...report.spec,
            marketKeys: [],
            stoppedMarkets: { [MARKET]: 1 },
          },
          coins: report.coins.map((coin) => ({
            ...coin,
            words: "Stopped by you",
          })),
        }}
        openCoin={null}
        onOpenCoin={vi.fn()}
      />
    )
  )
  expect(host.textContent).toContain("Stopped by you")
  expect(host.querySelector('[aria-label="Stop ETH"]')).toBeNull()
})
