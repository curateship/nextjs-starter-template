import { describe, expect, it } from "vitest"

import { buildBotRoundTrips } from "./bot-round-trips"
import type { BotDetailResponse } from "@/lib/api/bots"

type Fill = BotDetailResponse["trades"][number]

let seq = 0
const fill = (
  side: "buy" | "sell",
  px: number,
  sz: number,
  time: string,
  extra: Partial<Pick<Fill, "closed_pnl" | "fee">> = {}
): Fill => ({
  id: `f${(seq += 1)}`,
  market: "ETH",
  side,
  px: String(px),
  sz: String(sz),
  notional: String(px * sz),
  fee: extra.fee ?? "0",
  closed_pnl: extra.closed_pnl ?? null,
  fill_time: time,
  ...extra,
})

describe("buildBotRoundTrips", () => {
  it("pairs a buy and its closing sell into one long trip, net of fees", () => {
    const trips = buildBotRoundTrips(
      [
        fill("buy", 100, 1, "2026-07-01T00:00:00Z", { fee: "0.10" }),
        fill("sell", 110, 1, "2026-07-02T00:00:00Z", {
          closed_pnl: "10",
          fee: "0.11",
        }),
      ],
      0
    )
    expect(trips).toHaveLength(1)
    const [trip] = trips
    expect(trip.side).toBe("long")
    expect(trip.open).toBe(false)
    expect(trip.entryTime).toBe(Date.parse("2026-07-01T00:00:00Z"))
    expect(trip.exitTime).toBe(Date.parse("2026-07-02T00:00:00Z"))
    expect(trip.entryPx).toBe(100)
    expect(trip.exitPx).toBe(110)
    expect(trip.amount).toBe(100)
    expect(trip.pnl).toBeCloseTo(10 - 0.21)
    expect(trip.returnPct).toBeCloseTo(((10 - 0.21) / 100) * 100)
    expect(trip.cumPnl).toBeCloseTo(9.79)
  })

  it("folds DCA scale-ins into one trip with the summed entry notional", () => {
    const trips = buildBotRoundTrips(
      [
        fill("buy", 100, 1, "2026-07-01T00:00:00Z"),
        fill("buy", 90, 1, "2026-07-01T06:00:00Z"),
        fill("sell", 105, 2, "2026-07-01T12:00:00Z", { closed_pnl: "20" }),
      ],
      0
    )
    expect(trips).toHaveLength(1)
    expect(trips[0].amount).toBe(190)
    expect(trips[0].entryPx).toBe(95)
    expect(trips[0].pnl).toBe(20)
  })

  it("splits a stop-and-reverse fill into a close and a new opposite trip", () => {
    const trips = buildBotRoundTrips(
      [
        fill("buy", 100, 1, "2026-07-01T00:00:00Z"),
        // Sell 2 @ 110: closes the long 1 and opens a short 1.
        fill("sell", 110, 2, "2026-07-02T00:00:00Z", {
          closed_pnl: "10",
          fee: "0.20",
        }),
      ],
      100
    )
    expect(trips).toHaveLength(2)
    expect(trips[0].side).toBe("long")
    expect(trips[0].open).toBe(false)
    // Only the closing half of the flip fill's fee lands on the first trip.
    expect(trips[0].pnl).toBeCloseTo(10 - 0.1)
    expect(trips[1].side).toBe("short")
    expect(trips[1].open).toBe(true)
    expect(trips[1].amount).toBe(110)
    // Short from 110, mark 100 → +10 unrealized, minus its half of the fee.
    expect(trips[1].pnl).toBeCloseTo(10 - 0.1)
  })

  it("keeps the open cycle as an open trip with unrealized P&L at the mark", () => {
    const trips = buildBotRoundTrips(
      [fill("buy", 100, 2, "2026-07-01T00:00:00Z", { fee: "0.20" })],
      105
    )
    expect(trips).toHaveLength(1)
    expect(trips[0].open).toBe(true)
    expect(trips[0].exitTime).toBeNull()
    expect(trips[0].pnl).toBeCloseTo(2 * 5 - 0.2)
  })

  it("skips a leading fill that closes truncated (unseen) history", () => {
    const trips = buildBotRoundTrips(
      [
        // Realizes P&L while our tracked position is flat — remnant of history
        // beyond the 200-fill cap, not a fresh entry.
        fill("sell", 100, 1, "2026-07-01T00:00:00Z", { closed_pnl: "5" }),
        fill("buy", 100, 1, "2026-07-02T00:00:00Z"),
        fill("sell", 101, 1, "2026-07-03T00:00:00Z", { closed_pnl: "1" }),
      ],
      0
    )
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe("long")
    expect(trips[0].pnl).toBe(1)
  })

  it("reports the open trip's remaining size, ignoring truncated remnants", () => {
    const trips = buildBotRoundTrips(
      [
        // Closes a position older than the stored history. Summing raw fill
        // sizes would carry this -1 into the open position; the pairing skips
        // it, so `szi` must not see it either.
        fill("sell", 100, 1, "2026-07-01T00:00:00Z", { closed_pnl: "5" }),
        fill("buy", 100, 3, "2026-07-02T00:00:00Z"),
        // Partial scale-out: 1 of the 3 closed, 2 still held.
        fill("sell", 105, 1, "2026-07-03T00:00:00Z", { closed_pnl: "5" }),
      ],
      105
    )
    expect(trips).toHaveLength(1)
    expect(trips[0].open).toBe(true)
    expect(trips[0].szi).toBeCloseTo(2)
  })

  it("reports zero remaining size on a closed trip", () => {
    const trips = buildBotRoundTrips(
      [
        fill("buy", 100, 1, "2026-07-01T00:00:00Z"),
        fill("sell", 110, 1, "2026-07-02T00:00:00Z", { closed_pnl: "10" }),
      ],
      0
    )
    expect(trips[0].szi).toBe(0)
  })

  it("reports a short's remaining size as negative", () => {
    const trips = buildBotRoundTrips(
      [fill("sell", 100, 2, "2026-07-01T00:00:00Z")],
      100
    )
    expect(trips[0].open).toBe(true)
    expect(trips[0].szi).toBeCloseTo(-2)
  })

  it("accumulates cumPnl across closed trips in time order", () => {
    const trips = buildBotRoundTrips(
      [
        fill("buy", 100, 1, "2026-07-01T00:00:00Z"),
        fill("sell", 110, 1, "2026-07-02T00:00:00Z", { closed_pnl: "10" }),
        fill("buy", 100, 1, "2026-07-03T00:00:00Z"),
        fill("sell", 96, 1, "2026-07-04T00:00:00Z", { closed_pnl: "-4" }),
      ],
      0
    )
    expect(trips.map((t) => t.cumPnl)).toEqual([10, 6])
    expect(trips.map((t) => t.n)).toEqual([1, 2])
  })
})
