import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchAsterCandleHistory } from "@/server/protocols/aster/candles"
import { asterPublic } from "@/server/protocols/aster/client"

vi.mock("@/server/protocols/aster/client", () => ({
  asterPublic: vi.fn(),
}))

const publicRead = vi.mocked(asterPublic)
const MINUTE = 60_000

function row(openTime: number): unknown[] {
  return [openTime, "100", "101", "99", "100.5", "2"]
}

beforeEach(() => {
  publicRead.mockReset()
  publicRead.mockImplementation(async (_network, _path, _weight, params) => {
    const from = Number(params?.startTime)
    const to = Number(params?.endTime) + 1
    const rows: unknown[] = []
    for (let at = from; at < to; at += MINUTE) rows.push(row(at))
    return rows
  })
})

describe("Aster candle history", () => {
  it("pages across Aster's 1,500-bar boundary without a gap or duplicate", async () => {
    const from = 1_700_000_000_000 - (1_700_000_000_000 % MINUTE)
    const bars = await fetchAsterCandleHistory(
      "mainnet",
      "BTCUSDT",
      "1m",
      from,
      from + 1_501 * MINUTE
    )

    expect(publicRead).toHaveBeenCalledTimes(2)
    expect(publicRead.mock.calls[0]?.[2]).toBe(10)
    expect(publicRead.mock.calls[0]?.[3]).toMatchObject({ limit: 1_500 })
    expect(bars).toHaveLength(1_501)
    expect(bars[1_499].openTime).toBe(from + 1_499 * MINUTE)
    expect(bars[1_500].openTime).toBe(from + 1_500 * MINUTE)
    expect(new Set(bars.map((bar) => bar.openTime)).size).toBe(bars.length)
  })

  it("returns only the shorter history Aster actually has", async () => {
    const from = 1_700_000_000_000 - (1_700_000_000_000 % MINUTE)
    publicRead.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, index) =>
        row(from + 80 * MINUTE + index * MINUTE)
      )
    )

    const bars = await fetchAsterCandleHistory(
      "mainnet",
      "NEWUSDT",
      "1m",
      from,
      from + 100 * MINUTE
    )

    expect(bars).toHaveLength(20)
    expect(bars[0].openTime).toBe(from + 80 * MINUTE)
  })
})
