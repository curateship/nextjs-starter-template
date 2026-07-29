import { describe, expect, it } from "vitest"

import { buildBotRungLines } from "@/components/bots/bot-rung-lines"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"

// 2 rungs, 21% max position, doubling sizes → shares of 7% and 14%.
const DCA = {
  rungs: [{ deviation: 5 }, { deviation: 8 }],
  maxPositionPct: 21,
  sizeMultiplier: 2,
} as unknown as NonNullable<AutomationConfig["dca"]>

describe("buildBotRungLines", () => {
  it("draws nothing without a DCA config or usable state", () => {
    expect(buildBotRungLines({ candidateBase: 100 }, null)).toEqual([])
    expect(buildBotRungLines(null, DCA)).toEqual([])
    expect(buildBotRungLines("garbage", DCA)).toEqual([])
    expect(buildBotRungLines({}, DCA)).toEqual([])
  })

  it("labels an armed cycle's unfilled rungs with their exact buy amounts", () => {
    const lines = buildBotRungLines(
      {
        active: {
          frozenEquity: 1_000,
          rungs: [
            { index: 0, plannedPx: 70, allocationPct: 7, entryComplete: false },
            {
              index: 1,
              plannedPx: 64.4,
              allocationPct: 14,
              entryComplete: false,
            },
          ],
        },
      },
      DCA
    )
    expect(lines).toHaveLength(2)
    expect(lines[0].price).toBe(70)
    expect(lines[0].title).toBe("Waiting for rung 1 · $70")
    expect(lines[0].color).toBe("#f59e0b")
    expect(lines[1].title).toBe("Waiting for rung 2 · $140")
  })

  it("skips rungs that already bought", () => {
    const lines = buildBotRungLines(
      {
        active: {
          frozenEquity: 1_000,
          rungs: [
            { index: 0, plannedPx: 70, allocationPct: 7, entryComplete: true },
            {
              index: 1,
              plannedPx: 64.4,
              allocationPct: 14,
              entryComplete: false,
            },
          ],
        },
      },
      DCA
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].title).toBe("Waiting for rung 2 · $140")
  })

  it("falls back to the percent share when the frozen equity is unreadable", () => {
    const lines = buildBotRungLines(
      {
        active: {
          rungs: [
            { index: 0, plannedPx: 70, allocationPct: 7, entryComplete: false },
          ],
        },
      },
      DCA
    )
    expect(lines[0].title).toBe("Waiting for rung 1 · 7% of equity")
  })

  it("previews estimated amounts under a confirmed base before the cycle arms", () => {
    const lines = buildBotRungLines(
      { candidateBase: 100, active: null },
      DCA,
      1_000
    )
    // Deviations chain: 100 → −5% = 95 → −8% of that = 87.4.
    expect(lines.map((line) => line.price)).toEqual([95, 87.4])
    expect(lines[0].title).toBe("Waiting for rung 1 · ~$70")
    expect(lines[1].title).toBe("Waiting for rung 2 · ~$140")
  })

  it("previews percent shares when no equity figure is available", () => {
    const lines = buildBotRungLines({ candidateBase: 100 }, DCA, null)
    expect(lines[0].title).toBe("Waiting for rung 1 · 7% of equity")
    expect(lines[1].title).toBe("Waiting for rung 2 · 14% of equity")
  })

  it("ignores rungs with unusable prices", () => {
    const lines = buildBotRungLines(
      {
        active: {
          frozenEquity: 1_000,
          rungs: [
            {
              index: 0,
              plannedPx: "not-a-number",
              allocationPct: 7,
              entryComplete: false,
            },
            {
              index: 1,
              plannedPx: 0.076,
              allocationPct: 14,
              entryComplete: false,
            },
          ],
        },
      },
      DCA
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].title).toBe("Waiting for rung 2 · $140")
  })
})
