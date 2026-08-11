import { z } from "zod"

import type { FundingRate, NetworkId } from "@/lib/protocols/contracts"
import { binanceSymbolFor } from "@/server/protocols/binance/candles"

const BINANCE_FUNDING = "https://fapi.binance.com/fapi/v1/fundingRate"
const PAGE_LIMIT = 1000
const HOUR_MS = 3_600_000
const EIGHT_HOURS_MS = 28_800_000
const REQUEST_DELAY_MS = 700
const RETRIES = 6
const RETRY_BASE_MS = 1_000

const fundingSchema = z.array(
  z.object({
    fundingRate: z.string(),
    fundingTime: z.number(),
  })
)

let nextRequestAt = 0
let requestQueue: Promise<void> = Promise.resolve()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Binance USDT perpetuals normally settle funding every eight hours. */
export function binanceFundingIntervalMs(): number {
  return EIGHT_HOURS_MS
}

export function toBinanceFundingRates(
  rows: z.infer<typeof fundingSchema>
): FundingRate[] {
  const unique = new Map<number, FundingRate>()
  for (const row of rows) {
    if (row.fundingRate.trim() === "") continue
    const rate = Number(row.fundingRate)
    if (!Number.isFinite(rate)) continue
    const time = Math.floor(row.fundingTime / HOUR_MS) * HOUR_MS
    unique.set(time, { time, rate })
  }
  return [...unique.values()].sort((left, right) => left.time - right.time)
}

async function waitForRequestSlot(): Promise<void> {
  const request = requestQueue.then(async () => {
    const wait = Math.max(0, nextRequestAt - Date.now())
    if (wait > 0) await sleep(wait)
    nextRequestAt = Date.now() + REQUEST_DELAY_MS
  })
  requestQueue = request.then(
    () => undefined,
    () => undefined
  )
  return request
}

async function fundingPage(
  symbol: string,
  from: number,
  to: number
): Promise<z.infer<typeof fundingSchema>> {
  const url = new URL(BINANCE_FUNDING)
  url.searchParams.set("symbol", symbol)
  url.searchParams.set("startTime", String(from))
  url.searchParams.set("endTime", String(to - 1))
  url.searchParams.set("limit", String(PAGE_LIMIT))

  for (let attempt = 0; ; attempt += 1) {
    await waitForRequestSlot()
    let status = 0
    try {
      const response = await fetch(url)
      status = response.status
      if (response.ok) return fundingSchema.parse(await response.json())
      await response.body?.cancel().catch(() => {})
    } catch (error) {
      if (attempt >= RETRIES) {
        throw new Error(
          `Binance funding ${symbol} network error: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
      await sleep(RETRY_BASE_MS * 2 ** attempt)
      continue
    }

    if (status === 400) throw new Error(`BINANCE_NOT_LISTED:${symbol}`)
    if ((status !== 418 && status !== 429) || attempt >= RETRIES) {
      throw new Error(`Binance funding ${symbol} failed: ${status}`)
    }
    await sleep(RETRY_BASE_MS * 2 ** attempt)
  }
}

/** Historical Binance USDT-perpetual funding settlements for `[from, to)`. */
export async function fetchBinanceFunding(
  network: NetworkId,
  marketId: string,
  from: number,
  to: number
): Promise<FundingRate[]> {
  if (network !== "mainnet") {
    throw new Error(`Binance funding does not support ${network}.`)
  }
  if (!(to > from)) return []

  const symbol = binanceSymbolFor(marketId)
  if (!symbol) throw new Error(`BINANCE_NOT_LISTED:${marketId}`)

  const found = new Map<number, FundingRate>()
  let cursor = from
  while (cursor < to) {
    const rows = await fundingPage(symbol, cursor, to)
    for (const rate of toBinanceFundingRates(rows)) {
      if (rate.time >= from && rate.time < to) found.set(rate.time, rate)
    }
    if (rows.length < PAGE_LIMIT) break

    const lastTime = rows[rows.length - 1]?.fundingTime
    if (lastTime === undefined || lastTime < cursor) break
    cursor = lastTime + 1
  }

  return [...found.values()].sort((left, right) => left.time - right.time)
}
