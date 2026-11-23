import { z } from "zod"

import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import {
  num,
  PHEMEX_FUNDING_INTERVAL_MS,
  phemexFundingSymbol,
} from "@/lib/protocols/phemex/translate"
import { phemexPublic } from "@/server/protocols/phemex/client"

/**
 * Phemex's funding history — the public record of what longs paid shorts,
 * settled every 8 hours and filed under the market's own funding symbol
 * (`.BTCUSDTFR8H` for `BTCUSDT`).
 *
 * The endpoint answers at most a hundred rows per call, inclusive on both
 * ends of a millisecond window, so a long window is walked forward in pages
 * keyed by the last row seen.
 */

const PAGE_LIMIT = 100

const rowSchema = z.object({
  fundingRate: z.union([z.string(), z.number()]),
  fundingTime: z.number(),
})

const answerSchema = z.object({
  rows: z.array(z.unknown()).default([]),
})

export async function fetchPhemexFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  const rates: FundingRate[] = []
  let cursor = from

  while (cursor < to) {
    const answer = answerSchema.parse(
      await phemexPublic(network, "/api-data/public/data/funding-rate-history", {
        symbol: phemexFundingSymbol(marketId),
        start: cursor,
        end: to,
        limit: PAGE_LIMIT,
      })
    )
    const page = answer.rows
      .map((row) => rowSchema.safeParse(row))
      .filter((row) => row.success)
      .map((row) => row.data)
      .filter((row) => row.fundingTime >= cursor && row.fundingTime < to)
    for (const row of page) {
      const rate = num(row.fundingRate)
      if (rate === null) continue
      rates.push({ time: row.fundingTime, rate })
    }
    if (page.length < PAGE_LIMIT) break
    // One past the last row seen — the window is inclusive, so repeating the
    // exact timestamp would hand back the same page forever.
    cursor = page[page.length - 1].fundingTime + 1
  }

  rates.sort((a, b) => a.time - b.time)
  return rates
}

export function phemexFundingIntervalMs(): number {
  return PHEMEX_FUNDING_INTERVAL_MS
}
