import { z } from "zod"
import { parseMarketKey } from "@/lib/protocols/contracts"

export const scannerDetectionSchema = z.object({
  market: z.object({
    key: z.string().refine((key) => parseMarketKey(key) !== null),
    symbol: z.string(),
  }),
  since: z.number().finite(),
  updated: z.number().finite(),
  change: z.number().finite().nullable(),
  rule: z.string(),
})
export type ScannerDetection = z.infer<typeof scannerDetectionSchema>
export const scannerDetectionStoreSchema = z.object({
  rows: z.array(scannerDetectionSchema),
  dismissed: z.array(z.string()),
})
export type ScannerDetectionStore = z.infer<typeof scannerDetectionStoreSchema>
export function emptyScannerDetections(): ScannerDetectionStore {
  return { rows: [], dismissed: [] }
}

/** Captured matches are immutable. Deletion suppresses the same ongoing event. */
export function recordScannerDetections(
  store: ScannerDetectionStore,
  matches: ScannerDetection[],
  noLongerMatching: Set<string>
) {
  const dismissed = store.dismissed.filter((key) => !noLongerMatching.has(key))
  const known = new Set([
    ...store.rows.map((row) => row.market.key),
    ...dismissed,
  ])
  const added = matches.filter((row) => {
    if (known.has(row.market.key)) return false
    known.add(row.market.key)
    return true
  })
  if (!added.length && dismissed.length === store.dismissed.length) return store
  return { rows: [...added, ...store.rows], dismissed }
}
