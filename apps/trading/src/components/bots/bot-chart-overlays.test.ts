import { describe, expect, it } from "vitest"

import {
  buildBotFillMarkers,
  buildBotProtectionOverlays,
} from "./bot-chart-overlays"

describe("buildBotProtectionOverlays", () => {
  const state = (trail?: unknown) =>
    ({
      paper_position: { szi: 1, entryPx: 100 },
      strategy_state: trail ? { trail } : {},
    }) as never

  it("draws a fixed stop at the entry distance, draggable", () => {
    const { lines, targets } = buildBotProtectionOverlays(
      { stopLossPct: 2 },
      state()
    )
    const stop = lines.find((line) => line.id === "stop-loss")
    expect(stop).toMatchObject({
      price: 98,
      title: "Stop loss",
      draggable: true,
      lineStyle: "solid",
    })
    expect(targets["stop-loss"]).toBeDefined()
  })

  it("draws a trailing stop at the ratcheted level, dashed and not draggable", () => {
    const { lines, targets } = buildBotProtectionOverlays(
      { stopLossPct: 2, stopLossMode: "trailing" },
      state({ dir: 1, extremePx: 110 })
    )
    const stop = lines.find((line) => line.id === "stop-loss")
    expect(stop?.price).toBeCloseTo(107.8, 10)
    expect(stop).toMatchObject({
      title: "Trailing stop",
      draggable: false,
      lineStyle: "dashed",
    })
    expect(targets["stop-loss"]).toBeUndefined()
  })

  it("waits at the entry distance when no trail state is persisted yet", () => {
    const { lines } = buildBotProtectionOverlays(
      { stopLossPct: 2, stopLossMode: "trailing" },
      state()
    )
    expect(lines.find((line) => line.id === "stop-loss")?.price).toBe(98)
  })
})

describe("buildBotFillMarkers", () => {
  const fill = (overrides: Partial<{ closed_pnl: string | null; side: string }>) => ({
    id: "t1",
    market: "ETH",
    side: "buy",
    px: "2500",
    sz: "0.1",
    notional: "250",
    fee: "0.05",
    closed_pnl: null as string | null,
    fill_time: "2026-07-01T00:00:00Z",
    ...overrides,
  })

  const M15 = 900_000

  it("marks a closing fill C, colored by the side it closed", () => {
    // A sell that realizes P&L closed a long → green C.
    const [win] = buildBotFillMarkers(
      [fill({ closed_pnl: "12.5", side: "sell" })],
      M15
    )
    expect(win.letter).toBe("C")
    expect(win.color).toBe("#089981")
    expect(win.side).toBe("sell")
    expect(win.price).toBe(2500)
    expect(win.time).toBe(Date.parse("2026-07-01T00:00:00Z"))
    // A buy that realizes P&L closed a short → red C.
    const [loss] = buildBotFillMarkers([fill({ closed_pnl: "-3" })], M15)
    expect(loss.letter).toBe("C")
    expect(loss.color).toBe("#f23645")
  })

  it("marks an opening buy as a green (long) O chip", () => {
    for (const pnl of [null, "0"]) {
      const [open] = buildBotFillMarkers([fill({ closed_pnl: pnl })], M15)
      expect(open.letter).toBe("O")
      expect(open.color).toBe("#089981")
    }
  })

  it("marks an opening sell as a red (short) O chip", () => {
    const [open] = buildBotFillMarkers([fill({ side: "sell" })], M15)
    expect(open.letter).toBe("O")
    expect(open.color).toBe("#f23645")
  })

  it("marks a reverse (close + reopen in one fill) as a yellow F chip", () => {
    // Open long 0.1, then sell 0.2: closes the long and opens a 0.1 short.
    const chips = buildBotFillMarkers(
      [
        { ...fill({}), id: "a", fill_time: "2026-07-01T00:00:00Z", sz: "0.1" },
        {
          ...fill({ side: "sell", closed_pnl: "5" }),
          id: "b",
          fill_time: "2026-07-01T01:00:00Z",
          sz: "0.2",
        },
      ],
      M15
    )
    expect(chips.map((c) => c.letter)).toEqual(["O", "F"])
    expect(chips[1].color).toBe("#f5b301")
    expect(chips[1].textColor).toBe("#1a1a1a")
  })

  it("snaps mid-candle fill times to the candle bucket", () => {
    const [chip] = buildBotFillMarkers(
      [fill({})].map((f) => ({ ...f, fill_time: "2026-07-01T00:07:42Z" })),
      M15
    )
    // 00:07:42 falls in the 00:00 15-minute candle.
    expect(chip.time).toBe(Date.parse("2026-07-01T00:00:00Z"))
  })

  it("collapses a same-price fill burst inside one candle to one chip", () => {
    const burst = ["00:07:42", "00:07:43", "00:08:10"].map((t, i) => ({
      ...fill({}),
      id: `b${i}`,
      fill_time: `2026-07-01T${t}Z`,
    }))
    // Same candle, different price → its own chip.
    const other = { ...fill({}), id: "b3", fill_time: "2026-07-01T00:09:00Z", px: "2400" }
    const chips = buildBotFillMarkers([...burst, other], M15)
    expect(chips).toHaveLength(2)
    expect(chips.map((c) => c.price)).toEqual([2500, 2400])
  })
})
