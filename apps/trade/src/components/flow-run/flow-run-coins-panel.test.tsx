// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FlowRunCoinsPanel } from "@/components/flow-run/flow-run-coins-panel"
import type { FlowRunReport } from "@/lib/api/flow-runs"

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
