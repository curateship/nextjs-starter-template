import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/edgex/translate"
import { EDGEX_FIRST_BAR } from "@/server/protocols/edgex/candles"
import { edgexContract } from "@/server/protocols/edgex/catalogue"
import { edgexPublic } from "@/server/protocols/edgex/client"

const HOUR_MS = 3_600_000
/** edgeX hands over at most 100 rows a call. */
const PAGE_ROWS = 100

/**
 * edgeX's time between settlements for this market, from the catalogue's
 * `fundingRateIntervalMin`: 240 minutes on every contract on 24 Sep 2026, so
 * four hours, although the funding read's own help text says eight.
 */
export function edgexFundingIntervalMs(): number {
  return 4 * HOUR_MS
}

/**
 * Valid, unique settlement rows inside `[from, to)`, oldest first. edgeX
 * states the rate per settlement, signed the way the shared contract wants
 * it: positive means longs paid shorts.
 *
 * **Only settlements.** edgeX writes a forecast row every minute; the
 * settlement rows (`isSettlement: true`) sat exactly four hours apart on
 * 24 Sep 2026, and those are the ones money moved on.
 */
export function toEdgexFundingRates(
  answer: unknown,
  from: number,
  to: number
): FundingRate[] {
  const list = (answer as { dataList?: unknown } | null)?.dataList
  const rates = new Map<number, FundingRate>()
  for (const raw of Array.isArray(list) ? list : []) {
    const row = raw as { fundingTime?: unknown; fundingRate?: unknown; isSettlement?: unknown }
    if (row?.isSettlement !== true) continue
    const time = num(row.fundingTime)
    const rate = num(row.fundingRate)
    if (time === null || rate === null) continue
    if (time < from || time >= to) continue
    rates.set(time, { time, rate })
  }
  return [...rates.values()].sort((left, right) => left.time - right.time)
}

/**
 * edgeX's funding settlements for one market and `[from, to)`, a hundred
 * settlements (sixteen days) per request.
 */
export async function fetchEdgexFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  const start = Math.max(from, EDGEX_FIRST_BAR)
  if (!(to > start)) return []
  const { contractId, fundingHours } = await edgexContract(network, marketId)
  const found = new Map<number, FundingRate>()
  const pageMs = PAGE_ROWS * fundingHours * HOUR_MS
  for (let cursor = start; cursor < to; cursor += pageMs) {
    const pageEnd = Math.min(to, cursor + pageMs)
    const answer = await edgexPublic(network, "/api/v2/public/funding/getFundingRatePage", {
      contractId,
      size: PAGE_ROWS,
      filterSettlementFundingRate: "true",
      filterBeginTimeInclusive: cursor,
      filterEndTimeExclusive: pageEnd,
    })
    for (const rate of toEdgexFundingRates(answer, cursor, pageEnd)) {
      found.set(rate.time, rate)
    }
  }
  return [...found.values()].sort((left, right) => left.time - right.time)
}
