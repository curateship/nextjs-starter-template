import { z } from "zod"

import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"

const HOUR_MS = 3_600_000
const PAGE_SIZE = 500
// A full page costs about 25 request-weight points and the public allowance is
// 1,200 per minute. One shared queue keeps concurrent coin loads below that
// line and leaves room for the app's ordinary price and market reads.
const PAGE_DELAY_MS = 1_600
let nextPageAt = 0
let pageQueue: Promise<void> = Promise.resolve()

const fundingSchema = z.array(
  z.object({
    fundingRate: z.string(),
    time: z.number(),
  })
)

/** Translate the exchange response and give each settlement its exact hour. */
export function toFundingRates(
  rows: z.infer<typeof fundingSchema>
): FundingRate[] {
  const rates = new Map<number, FundingRate>()
  for (const row of rows) {
    if (row.fundingRate.trim() === "") continue
    const rate = num(row.fundingRate)
    if (rate === null) continue
    const time = Math.floor(row.time / HOUR_MS) * HOUR_MS
    rates.set(time, { time, rate })
  }
  return [...rates.values()].sort((left, right) => left.time - right.time)
}

async function fundingPage(
  network: NetworkId,
  marketId: string,
  startTime: number,
  endTime: number
) {
  const request = pageQueue.then(async () => {
    const wait = Math.max(0, nextPageAt - Date.now())
    if (wait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, wait))
    }
    try {
      return await infoClient(network).fundingHistory({
        coin: marketId,
        startTime,
        endTime,
      })
    } finally {
      nextPageAt = Date.now() + PAGE_DELAY_MS
    }
  })
  pageQueue = request.then(
    () => undefined,
    () => undefined
  )
  return request
}

/**
 * Historical hourly funding for `[from, to)`.
 *
 * Hyperliquid returns at most 500 rows for a time-range request. Pages advance
 * from the final raw timestamp so a long backtest gets the whole window rather
 * than quietly stopping after about three weeks.
 */
export async function fetchHyperliquidFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  if (!(to > from)) return []

  const found: FundingRate[] = []
  let cursor = from
  while (cursor < to) {
    const response = fundingSchema.parse(
      await fundingPage(network, marketId, cursor, to - 1)
    )
    found.push(...toFundingRates(response))
    if (response.length < PAGE_SIZE) break

    const lastTime = response[response.length - 1]?.time
    if (lastTime === undefined || lastTime < cursor) break
    cursor = lastTime + 1
  }

  const unique = new Map<number, FundingRate>()
  for (const rate of found) {
    if (rate.time >= from && rate.time < to) unique.set(rate.time, rate)
  }
  return [...unique.values()].sort((left, right) => left.time - right.time)
}
