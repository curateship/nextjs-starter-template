import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import { recordMinuteBars } from "@/server/trade/recorded-candles"
import { tradeCandles } from "@/server/trade/schema"

/**
 * One-minute bars grown from prices, for the coins with nothing to borrow.
 *
 * Solana publishes no candles. A coin with a pinned Binance twin draws that
 * venue's chart; everything else has no history anywhere and can only build
 * one as the app watches. These tests pin what a bar is made of and, just as
 * importantly, which coins are left alone.
 */

/** Wrapped SOL: pinned to Binance, so it must never be recorded. */
const SOL = "So11111111111111111111111111111111111111112"
/**
 * CATE: $11.4m of trading a day on Solana and no Binance listing at all, so
 * nothing to borrow. This is the case recorded bars exist for.
 */
const THIN = "Ai66LHZG9MCzg1WKdawwqduVAXpNDUuV8M3uyq5ppump"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const test = await createTestDatabase()
  client = test.client
  database = test.db
  setDbForTests(database)
})

afterEach(async () => {
  await client.close()
})

function storedFor(marketId: string) {
  return database
    .select()
    .from(tradeCandles)
    .where(
      and(
        eq(tradeCandles.marketKey, `solana:mainnet:${marketId}`),
        eq(tradeCandles.interval, "1m")
      )
    )
}

const MINUTE = 1_757_000_000_000 - (1_757_000_000_000 % 60_000)

describe("recording bars from watched prices", () => {
  it("opens a minute at the first price it saw", async () => {
    const written = await recordMinuteBars(
      "solana",
      "mainnet",
      [[THIN, 0.25]],
      MINUTE + 1_000
    )
    expect(written).toBe(1)
    const rows = await storedFor(THIN)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      openTime: MINUTE,
      open: 0.25,
      high: 0.25,
      low: 0.25,
      close: 0.25,
      // A price carries no volume, and a made-up one would be worse.
      volume: 0,
    })
  })

  it("stretches the same minute rather than starting a second bar", async () => {
    await recordMinuteBars("solana", "mainnet", [[THIN, 0.25]], MINUTE + 1_000)
    await recordMinuteBars("solana", "mainnet", [[THIN, 0.31]], MINUTE + 11_000)
    await recordMinuteBars("solana", "mainnet", [[THIN, 0.19]], MINUTE + 21_000)
    await recordMinuteBars("solana", "mainnet", [[THIN, 0.28]], MINUTE + 31_000)

    const rows = await storedFor(THIN)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      open: 0.25,
      high: 0.31,
      low: 0.19,
      // The last price of the minute closes it.
      close: 0.28,
    })
  })

  it("starts a fresh bar on the next minute", async () => {
    await recordMinuteBars("solana", "mainnet", [[THIN, 0.25]], MINUTE + 1_000)
    await recordMinuteBars(
      "solana",
      "mainnet",
      [[THIN, 0.4]],
      MINUTE + 60_000 + 1_000
    )
    const rows = (await storedFor(THIN)).sort(
      (left, right) => left.openTime - right.openTime
    )
    expect(rows.map((row) => row.openTime)).toEqual([MINUTE, MINUTE + 60_000])
    expect(rows[1]).toMatchObject({ open: 0.4, close: 0.4 })
  })

  it("never records a coin that can borrow a real chart", async () => {
    // SOL reads Binance's years of candles. A second, thinner copy under its
    // own key would be two answers to one question.
    const written = await recordMinuteBars(
      "solana",
      "mainnet",
      [
        [SOL, 101],
        [THIN, 0.25],
      ],
      MINUTE + 1_000
    )
    expect(written).toBe(1)
    expect(await storedFor(SOL)).toHaveLength(0)
    expect(await storedFor(THIN)).toHaveLength(1)
  })

  it("ignores a price that is not a price, and writes nothing for an empty turn", async () => {
    const written = await recordMinuteBars(
      "solana",
      "mainnet",
      [
        [THIN, 0],
        ["OtherMint111111111111111111111111111111111", Number.NaN],
      ],
      MINUTE + 1_000
    )
    expect(written).toBe(0)
    expect(await storedFor(THIN)).toHaveLength(0)
    expect(await recordMinuteBars("solana", "mainnet", [], MINUTE)).toBe(0)
  })
})
