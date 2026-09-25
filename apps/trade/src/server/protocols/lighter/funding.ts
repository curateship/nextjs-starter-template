import { z } from "zod"

import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/lighter/translate"
import { lighterPublic } from "@/server/protocols/lighter/client"
import { lighterMarketFacts } from "@/server/protocols/lighter/markets"

const HOUR_MS = 3_600_000
/**
 * Lighter settles funding every hour. Measured 26 Aug 2026: three days of
 * BTC rows came back exactly 3,600 seconds apart, 72 of them.
 */
const FUNDING_INTERVAL_MS = HOUR_MS
/** The most rows Lighter hands over in one fundings answer, per its docs. */
const PAGE_ROWS = 750
/** Docs say unlisted endpoints weigh 300; fundings is not listed. */
const FUNDINGS_WEIGHT = 300

const fundingRowSchema = z.object({
  // Seconds, where the request's own timestamps are milliseconds.
  timestamp: z.number(),
  rate: z.union([z.string(), z.number()]),
  direction: z.string(),
})

const fundingsSchema = z.object({
  fundings: z.array(z.unknown()).default([]),
})

export function lighterFundingIntervalMs(): number {
  return FUNDING_INTERVAL_MS
}

/**
 * Valid, unique funding rows in chronological order and inside `[from, to)`.
 *
 * Lighter states the rate as an unsigned percent and says who paid in
 * `direction`: "long" means longs paid shorts, which is the positive sign
 * the shared contract uses, so "short" comes out negative.
 */
export function toLighterFundingRates(
  answer: unknown,
  from: number,
  to: number
): FundingRate[] {
  const parsed = fundingsSchema.safeParse(answer)
  if (!parsed.success) return []
  const rates = new Map<number, FundingRate>()
  for (const raw of parsed.data.fundings) {
    const row = fundingRowSchema.safeParse(raw)
    if (!row.success) continue
    const percent = num(row.data.rate)
    if (percent === null) continue
    const time = Math.floor((row.data.timestamp * 1_000) / HOUR_MS) * HOUR_MS
    if (time < from || time >= to) continue
    const rate =
      row.data.direction === "short" ? -percent / 100 : percent / 100
    rates.set(time, { time, rate })
  }
  return [...rates.values()].sort((left, right) => left.time - right.time)
}

/** Lighter's public funding settlements for one market and `[from, to)`. */
export async function fetchLighterFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  if (!(to > from)) return []
  const { id, bornAt } = await lighterMarketFacts(network, marketId)
  // No funding was ever charged before the market opened, and Lighter allows
  // sixty requests a minute, so those pages are never asked for.
  const start = bornAt === null ? from : Math.max(from, bornAt)
  if (!(to > start)) return []

  const found = new Map<number, FundingRate>()
  const pageMs = PAGE_ROWS * FUNDING_INTERVAL_MS
  for (let cursor = start; cursor < to; cursor += pageMs) {
    const pageEnd = Math.min(to, cursor + pageMs)
    const answer = await lighterPublic(
      network,
      "/api/v1/fundings",
      FUNDINGS_WEIGHT,
      {
        market_id: id,
        resolution: "1h",
        start_timestamp: cursor,
        end_timestamp: pageEnd - 1,
        count_back: PAGE_ROWS,
      }
    )
    for (const rate of toLighterFundingRates(answer, cursor, pageEnd)) {
      found.set(rate.time, rate)
    }
  }
  return [...found.values()].sort((left, right) => left.time - right.time)
}
