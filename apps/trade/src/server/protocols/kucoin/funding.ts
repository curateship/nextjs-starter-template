import { z } from "zod"

import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/kucoin/translate"
import { kucoinPublic } from "@/server/protocols/kucoin/client"

/**
 * KuCoin's funding history — the public record of what longs paid shorts.
 *
 * The endpoint answers **newest first and at most 100 rows**, measured
 * against the live exchange. So a long window is walked BACKWARDS: ask for
 * everything up to `to`, take what comes, then ask again ending just before
 * the oldest row seen, until the answer runs short or reaches `from`.
 */

const PAGE_LIMIT = 100

/** A page that keeps re-asking is a loop; this is the belt on that brace. */
const MAX_PAGES = 40

const rowSchema = z.object({
  fundingRate: z.union([z.string(), z.number()]),
  timepoint: z.number(),
})

export async function fetchKucoinFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  const rates: FundingRate[] = []
  const seen = new Set<number>()
  let end = to

  for (let page = 0; page < MAX_PAGES && end > from; page += 1) {
    const answer = await kucoinPublic(
      network,
      "/api/v1/contract/funding-rates",
      { symbol: marketId, from, to: end }
    )
    const rows = (Array.isArray(answer) ? answer : [])
      .map((raw) => rowSchema.safeParse(raw))
      .filter((row) => row.success)
      .map((row) => row.data)
    if (rows.length === 0) break

    let oldest = end
    for (const row of rows) {
      if (row.timepoint < from || row.timepoint >= to) continue
      if (seen.has(row.timepoint)) continue
      const rate = num(row.fundingRate)
      if (rate === null) continue
      seen.add(row.timepoint)
      rates.push({ time: row.timepoint, rate })
      oldest = Math.min(oldest, row.timepoint)
    }

    if (rows.length < PAGE_LIMIT) break
    // One millisecond before the oldest row seen: the window is inclusive at
    // both ends, so repeating that exact moment would return the same page
    // forever.
    end = oldest - 1
  }

  rates.sort((a, b) => a.time - b.time)
  return rates
}
