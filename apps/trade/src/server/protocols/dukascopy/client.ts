import { createRequire } from "node:module"

import type { dukascopyTimeframe } from "@/lib/protocols/dukascopy/naming"

/**
 * The one door onto the `dukascopy-node` package.
 *
 * **The CommonJS build, on purpose.** The package's ES module build imports
 * named functions from `fs-extra`, which Node 24 refuses at load time. Node
 * resolves the package's `main` field to the CommonJS build, and
 * `createRequire` makes that the only build ever loaded, in dev and in the
 * production bundle alike.
 *
 * Its own file so the candle reader can be tested against a recorded week
 * without a network: tests replace this module, not the package.
 */

export type DukascopyRow = {
  /** Epoch milliseconds UTC of the candle's open. */
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type DukascopyHistoryRequest = {
  instrument: string
  dates: { from: Date; to: Date }
  timeframe: ReturnType<typeof dukascopyTimeframe>
  priceType: "bid"
  volumes: boolean
  volumeUnits: "units"
  ignoreFlats: boolean
  format: "json"
  batchSize: number
  pauseBetweenBatchesMs: number
  retryCount: number
  pauseBetweenRetriesMs: number
  failAfterRetryCount: boolean
}

const rates = createRequire(import.meta.url)("dukascopy-node") as {
  getHistoricalRates(config: DukascopyHistoryRequest): Promise<DukascopyRow[]>
}

export function getHistoricalRates(
  request: DukascopyHistoryRequest
): Promise<DukascopyRow[]> {
  return rates.getHistoricalRates(request)
}
