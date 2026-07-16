import { describe, expect, it } from "vitest"

import type { BotListItem, BotListPosition } from "@/lib/api/bots"
import { buildFleetSummaries } from "@/components/bots/fleet-overview"

function makeBot(
  overrides: Partial<BotListItem> & { id: string }
): BotListItem {
  return {
    name: overrides.id,
    markets: [],
    exchange: "hyperliquid",
    mode: "paper",
    desired_state: "running",
    status: "running",
    status_reason: null,
    wallet_label: "Paper",
    network: "testnet",
    realized_pnl: 0,
    daily_realized_pnl: 0,
    positions: [],
    trade_count: 0,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    ...overrides,
  }
}

function pos(market: string, szi: number, entryPx: number): BotListPosition {
  return { market, szi, entry_px: entryPx }
}

describe("buildFleetSummaries", () => {
  it("returns nothing for an empty fleet", () => {
    expect(buildFleetSummaries([])).toEqual([])
  })

  it("separates paper and live, live first, without blending totals", () => {
    const summaries = buildFleetSummaries([
      makeBot({ id: "p1", mode: "paper", realized_pnl: 100 }),
      makeBot({ id: "l1", mode: "live", realized_pnl: -40 }),
    ])
    expect(summaries.map((s) => s.mode)).toEqual(["live", "paper"])
    expect(summaries[0].pnlTotal).toBe(-40)
    expect(summaries[1].pnlTotal).toBe(100)
  })

  it("omits modes with no bots", () => {
    const summaries = buildFleetSummaries([makeBot({ id: "p1" })])
    expect(summaries).toHaveLength(1)
    expect(summaries[0].mode).toBe("paper")
  })

  it("nets long and short exposure per coin at entry prices", () => {
    const summaries = buildFleetSummaries([
      makeBot({ id: "a", positions: [pos("BTC", 1, 50_000)] }),
      makeBot({ id: "b", positions: [pos("BTC", -0.5, 50_000)] }),
    ])
    const [paper] = summaries
    expect(paper.openPositions).toBe(2)
    expect(paper.exposures).toHaveLength(1)
    const btc = paper.exposures[0]
    expect(btc.longNotional).toBe(50_000)
    expect(btc.shortNotional).toBe(25_000)
    expect(btc.netNotional).toBe(25_000)
    expect(paper.pileups).toEqual([])
  })

  it("flags a pile-up only for two-plus bots on the same side of a coin", () => {
    const summaries = buildFleetSummaries([
      makeBot({ id: "a", name: "Alpha", positions: [pos("ETH", 2, 3_000)] }),
      makeBot({ id: "b", name: "Beta", positions: [pos("ETH", 1, 3_100)] }),
      makeBot({ id: "c", name: "Gamma", positions: [pos("ETH", -1, 3_000)] }),
      makeBot({ id: "d", name: "Delta", positions: [pos("SOL", 10, 150)] }),
    ])
    const [paper] = summaries
    expect(paper.pileups).toHaveLength(1)
    expect(paper.pileups[0]).toMatchObject({ coin: "ETH", direction: "long" })
    expect(paper.pileups[0].bots.map((b) => b.id)).toEqual(["a", "b"])
  })

  it("keeps pile-ups inside one mode", () => {
    const summaries = buildFleetSummaries([
      makeBot({ id: "a", mode: "paper", positions: [pos("BTC", 1, 50_000)] }),
      makeBot({ id: "b", mode: "live", positions: [pos("BTC", 1, 50_000)] }),
    ])
    for (const summary of summaries) {
      expect(summary.pileups).toEqual([])
    }
  })

  it("sorts exposures by gross notional and counts statuses and daily P&L", () => {
    const summaries = buildFleetSummaries([
      makeBot({
        id: "a",
        status: "running",
        daily_realized_pnl: 12.5,
        positions: [pos("SOL", 10, 150)],
      }),
      makeBot({
        id: "b",
        status: "paused",
        daily_realized_pnl: -2.5,
        positions: [pos("BTC", 0.1, 50_000)],
      }),
      makeBot({ id: "c", status: "stopped" }),
      makeBot({ id: "d", status: "starting" }),
    ])
    const [paper] = summaries
    expect(paper.exposures.map((e) => e.coin)).toEqual(["BTC", "SOL"])
    expect(paper.totalBots).toBe(4)
    expect(paper.runningBots).toBe(2)
    expect(paper.pausedBots).toBe(1)
    expect(paper.pnlToday).toBe(10)
  })
})
