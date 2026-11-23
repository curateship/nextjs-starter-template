import { z } from "zod"

import type { ChartPosition } from "@/lib/trading/chart-positions"

/**
 * Params snapshot of a manual practice session, stored in `backtests.params`
 * like any other run's config. `kind: "manual"` is what every dashboard guard
 * keys on — a manual row must never reach automation-only code paths.
 */
export type ManualRunParams = {
  kind: "manual"
  /** Percent of the wallet risked to the stop on each trade. */
  riskPct: number
  /** Final geometry of every drawn box that became an order, for reference. */
  boxes?: ChartPosition[]
}

export const MANUAL_RISK_PCT_MIN = 0.05
export const MANUAL_RISK_PCT_MAX = 10

const chartPositionSchema = z.object({
  id: z.string().min(1).max(64),
  side: z.enum(["long", "short"]),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  entry: z.number().positive(),
  target: z.number().positive(),
  stop: z.number().positive(),
})

export const manualRunParamsSchema = z.object({
  kind: z.literal("manual"),
  riskPct: z.number().min(MANUAL_RISK_PCT_MIN).max(MANUAL_RISK_PCT_MAX),
  boxes: z.array(chartPositionSchema).max(500).optional(),
})

/** Cheap kind guard — enough to keep manual rows out of automation code. */
export function isManualRunParams(params: unknown): params is ManualRunParams {
  return (
    typeof params === "object" &&
    params !== null &&
    (params as { kind?: unknown }).kind === "manual"
  )
}
