import { z } from "zod"

import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/aster/translate"
import { asterPublic } from "@/server/protocols/aster/client"

const HOUR_MS = 3_600_000
// Unknown intervals stay conservative: missing hourly rows should warn rather
// than be treated as though the trader received free funding.
const DEFAULT_FUNDING_MS = HOUR_MS
const PAGE_LIMIT = 1_000
const CONFIG_HELD_MS = 10 * 60_000

const fundingRowSchema = z.object({
  symbol: z.string(),
  fundingRate: z.union([z.string(), z.number()]),
  fundingTime: z.number(),
})

const fundingConfigRowSchema = z.object({
  symbol: z.string(),
  fundingIntervalHours: z.union([z.string(), z.number()]).nullable().optional(),
})

type HeldConfig = {
  at: number
  load: Promise<Map<string, number>>
}

const heldConfig = new Map<NetworkId, HeldConfig>()
const intervalsByMarket = new Map<string, number>()

function intervalKey(network: NetworkId, marketId: string): string {
  return `${network}:${marketId}`
}

/** Aster's current per-market settlement intervals, held for ten minutes. */
export async function fetchAsterFundingIntervals(
  network: NetworkId
): Promise<Map<string, number>> {
  const held = heldConfig.get(network)
  if (held && Date.now() - held.at < CONFIG_HELD_MS) return held.load

  const load = asterPublic(network, "/fapi/v3/fundingInfo").then((answer) => {
    const intervals = new Map<string, number>()
    for (const raw of Array.isArray(answer) ? answer : []) {
      const row = fundingConfigRowSchema.safeParse(raw)
      if (!row.success) continue
      const hours = num(row.data.fundingIntervalHours)
      if (hours === null || !(hours > 0)) continue
      const milliseconds = hours * HOUR_MS
      intervals.set(row.data.symbol, milliseconds)
      intervalsByMarket.set(intervalKey(network, row.data.symbol), milliseconds)
    }
    return intervals
  })
  heldConfig.set(network, { at: Date.now(), load })
  load.catch(() => {
    if (heldConfig.get(network)?.load === load) heldConfig.delete(network)
  })
  return load
}

/**
 * The interval used by the shared funding-gap check.
 *
 * A market fetch or funding fetch fills this map from Aster's fundingInfo
 * first. One hour is the conservative fallback for a saved market checked
 * before either read has happened, so an unknown interval cannot hide a gap.
 */
export function asterFundingIntervalMs(
  network: NetworkId,
  marketId: string
): number {
  return (
    intervalsByMarket.get(intervalKey(network, marketId)) ?? DEFAULT_FUNDING_MS
  )
}

/** Valid, unique funding rows in chronological order and inside `[from, to)`. */
export function toAsterFundingRates(
  rows: readonly unknown[],
  from: number,
  to: number
): FundingRate[] {
  const rates = new Map<number, FundingRate>()
  for (const raw of rows) {
    const parsed = fundingRowSchema.safeParse(raw)
    if (!parsed.success) continue
    const rate = num(parsed.data.fundingRate)
    const time = Math.floor(parsed.data.fundingTime / HOUR_MS) * HOUR_MS
    if (rate === null || time < from || time >= to) continue
    rates.set(time, { time, rate })
  }
  return [...rates.values()].sort((left, right) => left.time - right.time)
}

/** Aster's public funding settlements for one market and `[from, to)`. */
export async function fetchAsterFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  if (!(to > from)) return []
  await fetchAsterFundingIntervals(network)

  const found = new Map<number, FundingRate>()
  let cursor = from
  while (cursor < to) {
    const answer = await asterPublic(network, "/fapi/v3/fundingRate", {
      symbol: marketId,
      startTime: cursor,
      endTime: to - 1,
      limit: PAGE_LIMIT,
    })
    const rows = Array.isArray(answer) ? answer : []
    for (const rate of toAsterFundingRates(rows, from, to)) {
      found.set(rate.time, rate)
    }
    if (rows.length < PAGE_LIMIT) break

    const last = fundingRowSchema.safeParse(rows[rows.length - 1])
    if (!last.success || last.data.fundingTime < cursor) break
    cursor = last.data.fundingTime + 1
  }
  return [...found.values()].sort((left, right) => left.time - right.time)
}
