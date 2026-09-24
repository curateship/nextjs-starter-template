import { z } from "zod"

import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/apex/translate"
import { APEX_FIRST_BAR } from "@/server/protocols/apex/candles"
import { apexContract } from "@/server/protocols/apex/catalogue"
import { apexPublic } from "@/server/protocols/apex/client"

const HOUR_MS = 3_600_000
/**
 * ApeX settles funding every hour: its docs say so, and 100 BTC rows read on
 * 24 Sep 2026 sat exactly 3,600 seconds apart.
 */
const FUNDING_INTERVAL_MS = HOUR_MS
/** ApeX hands over at most 100 rows a call, so a page is 100 hours. */
const PAGE_ROWS = 100

const rowSchema = z.object({
  rate: z.union([z.string(), z.number()]),
  fundingTime: z.number(),
})

const answerSchema = z.object({
  historyFunds: z.array(z.unknown()).default([]),
})

export function apexFundingIntervalMs(): number {
  return FUNDING_INTERVAL_MS
}

/**
 * Valid, unique rows inside `[from, to)`, oldest first. ApeX states the
 * rate signed the way the shared contract wants it: positive means longs
 * paid shorts.
 */
export function toApexFundingRates(
  answer: unknown,
  from: number,
  to: number
): FundingRate[] {
  const parsed = answerSchema.safeParse(answer)
  if (!parsed.success) return []
  const rates = new Map<number, FundingRate>()
  for (const raw of parsed.data.historyFunds) {
    const row = rowSchema.safeParse(raw)
    if (!row.success) continue
    const rate = num(row.data.rate)
    if (rate === null) continue
    const time = Math.floor(row.data.fundingTime / HOUR_MS) * HOUR_MS
    if (time < from || time >= to) continue
    rates.set(time, { time, rate })
  }
  return [...rates.values()].sort((left, right) => left.time - right.time)
}

/**
 * ApeX's public funding settlements for one market and `[from, to)`.
 *
 * **The dashed spelling.** This is the one public read that wants
 * `BTC-USDT`; asked for `BTCUSDT` it answered code 3, "invalid symbol", on
 * 24 Sep 2026. The dashed name comes off the catalogue row, never from
 * rewriting the id.
 */
export async function fetchApexFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  const start = Math.max(from, APEX_FIRST_BAR)
  if (!(to > start)) return []
  const { symbol } = await apexContract(network, marketId)
  const found = new Map<number, FundingRate>()
  const pageMs = PAGE_ROWS * FUNDING_INTERVAL_MS
  for (let cursor = start; cursor < to; cursor += pageMs) {
    const pageEnd = Math.min(to, cursor + pageMs)
    const answer = await apexPublic(network, "/history-funding", {
      symbol,
      beginTimeInclusive: cursor,
      endTimeExclusive: pageEnd,
      limit: PAGE_ROWS,
    })
    for (const rate of toApexFundingRates(answer, cursor, pageEnd)) {
      found.set(rate.time, rate)
    }
  }
  return [...found.values()].sort((left, right) => left.time - right.time)
}
