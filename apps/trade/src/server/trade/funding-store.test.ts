import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FundingRate } from "@/lib/protocols/contracts"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import { tradeFundingRates } from "@/server/trade/schema"
import {
  ensureFundingCoverage,
  listFundingGaps,
  loadStoredFunding,
} from "@/server/trade/funding-store"

const HOUR = 3_600_000
const START = 1_700_000_000_000 - (1_700_000_000_000 % HOUR)
const KEY = "hyperliquid:mainnet:BTC"
const asks: Array<{ from: number; to: number }> = []
let available: FundingRate[] = []
let settlementInterval = HOUR

vi.mock("@/server/protocols/registry", () => ({
  getProtocol: () => ({
    id: "hyperliquid",
    funding: {
      intervalMs: () => settlementInterval,
      fetch: async (
        _network: string,
        _marketId: string,
        from: number,
        to: number
      ) => {
        asks.push({ from, to })
        return available.filter((one) => one.time >= from && one.time < to)
      },
    },
  }),
  fundingOf: (protocol: { funding: unknown }) => protocol.funding,
}))

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  asks.length = 0
  settlementInterval = HOUR
  available = Array.from({ length: 10 }, (_, index) => ({
    time: START + index * HOUR,
    rate: (index + 1) / 100_000,
  }))
})

afterEach(async () => client.close())

describe("historical funding storage", () => {
  it("fetches a covered window once and stores every rate once", async () => {
    const to = START + 10 * HOUR
    await ensureFundingCoverage(KEY, START, to, db)
    await ensureFundingCoverage(KEY, START, to, db)

    expect(asks).toEqual([{ from: START, to }])
    expect(await loadStoredFunding(KEY, START, to, db)).toEqual(available)
  })

  it("records a missing stretch instead of treating it as free", async () => {
    available = available.filter(
      (one) => one.time < START + 3 * HOUR || one.time >= START + 6 * HOUR
    )
    const to = START + 10 * HOUR
    const report = await ensureFundingCoverage(KEY, START, to, db)

    expect(report.gaps).toEqual([
      {
        from: START + 3 * HOUR,
        to: START + 6 * HOUR,
        reason: expect.stringContaining("no funding history"),
      },
    ])
    expect(await listFundingGaps(KEY, START, to, db)).toEqual(report.gaps)

    await db.insert(tradeFundingRates).values(
      [3, 4, 5].map((index) => ({
        marketKey: KEY,
        time: START + index * HOUR,
        rate: 0.0001,
      }))
    )
    await ensureFundingCoverage(KEY, START, to, db)
    expect(await listFundingGaps(KEY, START, to, db)).toEqual([])
  })

  it("uses the exchange settlement interval when looking for gaps", async () => {
    const eightHours = 8 * HOUR
    const alignedStart = START - (START % eightHours)
    settlementInterval = eightHours
    available = [0, 1, 2].map((index) => ({
      time: alignedStart + index * eightHours,
      rate: 0.0001,
    }))
    const report = await ensureFundingCoverage(
      KEY,
      alignedStart,
      alignedStart + 3 * eightHours,
      db
    )

    expect(report.gaps).toEqual([])
  })

  it("accepts the exchange's few-millisecond settlement delay", async () => {
    const eightHours = 8 * HOUR
    const alignedStart = START - (START % eightHours)
    settlementInterval = eightHours
    available = [0, 1, 2].map((index) => ({
      time: alignedStart + index * eightHours + index,
      rate: 0.0001,
    }))

    const report = await ensureFundingCoverage(
      KEY,
      alignedStart,
      alignedStart + 3 * eightHours,
      db
    )
    expect(report.gaps).toEqual([])
  })
})
