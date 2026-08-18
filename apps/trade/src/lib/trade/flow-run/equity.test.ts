import { describe, expect, it } from "vitest"

import { buildFlowRunEquity, equityStepMs } from "./equity"

/**
 * The money line for a run that is still going.
 *
 * The two rules worth pinning down: the line is the cap plus what has actually
 * been banked, and what open positions are worth counts only at the head. A
 * line that smeared today's open profit backwards would draw a run that never
 * happened.
 */

const HOUR = 3_600_000
const START = 1_700_000_000_000

function trade(patch: Partial<Parameters<typeof buildFlowRunEquity>[0]["trades"][number]> = {}) {
  return {
    marketKey: "hyperliquid:mainnet:BTC",
    openedAt: START + HOUR,
    closedAt: START + 2 * HOUR,
    amountUsd: 100,
    pnl: 25,
    ending: "closed",
    ...patch,
  }
}

describe("buildFlowRunEquity", () => {
  it("starts at the cap and adds money as it is banked", () => {
    const built = buildFlowRunEquity({
      trades: [trade()],
      open: [],
      capUsd: 500,
      startedAt: START,
      endAt: START + 4 * HOUR,
    })
    expect(built.equity[0].usd).toBe(500)
    expect(built.equity[built.equity.length - 1].usd).toBe(525)
    // Nothing is added before the trade actually closed.
    const beforeClose = built.equity.filter(
      (point) => point.t < START + 2 * HOUR
    )
    expect(beforeClose.every((point) => point.usd === 500)).toBe(true)
  })

  it("counts an open position only at the head of the line", () => {
    const built = buildFlowRunEquity({
      trades: [],
      open: [
        {
          marketKey: "hyperliquid:mainnet:ETH",
          openedAt: START,
          amountUsd: 200,
          unrealisedUsd: 40,
        },
      ],
      capUsd: 500,
      startedAt: START,
      endAt: START + 4 * HOUR,
    })
    expect(built.equity[0].usd).toBe(500)
    expect(built.equity[built.equity.length - 1].usd).toBe(540)
    expect(built.equity.filter((point) => point.usd !== 500)).toHaveLength(1)
  })

  it("draws a flat line for a run that has done nothing", () => {
    const built = buildFlowRunEquity({
      trades: [],
      open: [],
      capUsd: 500,
      startedAt: START,
      endAt: START + 6 * HOUR,
    })
    expect(new Set(built.equity.map((point) => point.usd))).toEqual(
      new Set([500])
    )
  })

  it("ends where a stopped run stopped", () => {
    const built = buildFlowRunEquity({
      trades: [],
      open: [],
      capUsd: 500,
      startedAt: START,
      endAt: START + 3 * HOUR,
    })
    const last = built.equity[built.equity.length - 1]
    expect(last.t).toBe(START + 3 * HOUR)
  })

  it("says how much money was at work while a trade was open", () => {
    const built = buildFlowRunEquity({
      trades: [trade()],
      open: [],
      capUsd: 500,
      startedAt: START,
      endAt: START + 4 * HOUR,
    })
    const at = (when: number) => {
      const bar = built.equity.findIndex((point) => point.t >= when)
      return built.inPlay[bar]
    }
    expect(at(START)).toBe(0)
    expect(at(START + HOUR + 60_000)).toBe(100)
    expect(at(START + 3 * HOUR)).toBe(0)
  })

  it("hands the graph a still-open trade with no exit", () => {
    const built = buildFlowRunEquity({
      trades: [],
      open: [
        {
          marketKey: "hyperliquid:mainnet:ETH",
          openedAt: START,
          amountUsd: 200,
          unrealisedUsd: 0,
        },
      ],
      capUsd: 500,
      startedAt: START,
      endAt: START + HOUR,
    })
    expect(built.runTrades).toHaveLength(1)
    expect(built.runTrades[0].exitAt).toBeNull()
  })

  it("marks a liquidation so the figures can count it", () => {
    const built = buildFlowRunEquity({
      trades: [trade({ ending: "liquidated", pnl: -100 })],
      open: [],
      capUsd: 500,
      startedAt: START,
      endAt: START + 4 * HOUR,
    })
    expect(built.runTrades[0].liquidated).toBe(true)
  })

  it("takes coarser steps the longer a run has been going", () => {
    expect(equityStepMs(2 * HOUR)).toBe(300_000)
    expect(equityStepMs(24 * HOUR)).toBe(900_000)
    expect(equityStepMs(7 * 24 * HOUR)).toBe(HOUR)
    expect(equityStepMs(60 * 24 * HOUR)).toBe(4 * HOUR)
  })
})
