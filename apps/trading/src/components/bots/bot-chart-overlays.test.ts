import { describe, expect, it } from "vitest"

import { buildBotFillMarkers } from "./bot-chart-overlays"

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

  it("marks fills with realized PnL as red C chips", () => {
    const [win] = buildBotFillMarkers(
      [fill({ closed_pnl: "12.5", side: "sell" })],
      M15
    )
    expect(win.letter).toBe("C")
    expect(win.color).toBe("#f23645")
    expect(win.side).toBe("sell")
    expect(win.price).toBe(2500)
    expect(win.time).toBe(Date.parse("2026-07-01T00:00:00Z"))
    const [loss] = buildBotFillMarkers([fill({ closed_pnl: "-3" })], M15)
    expect(loss.letter).toBe("C")
  })

  it("marks fills without realized PnL as green O chips", () => {
    for (const pnl of [null, "0"]) {
      const [open] = buildBotFillMarkers([fill({ closed_pnl: pnl })], M15)
      expect(open.letter).toBe("O")
      expect(open.color).toBe("#089981")
    }
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
