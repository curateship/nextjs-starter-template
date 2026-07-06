import { z } from "zod"

import { CANDLE_INTERVALS } from "@/lib/hl/ws"

/**
 * A configured-but-not-yet-executed run. The New Run modal produces one, the
 * workspace carries it in the `?draft=` search param so the user can tune
 * price levels on the chart, and "Run Backtest" turns it into the first
 * execution.
 */
export const runDraftSchema = z.object({
  name: z.string().max(255).optional(),
  strategy: z.enum(["grid", "dca", "momentum"]),
  market: z.string().min(1).max(20),
  interval: z.enum(CANDLE_INTERVALS),
  windowDays: z.number().int().min(1).max(90),
  equity: z.number().positive(),
  takerFeeBps: z.number().min(0).max(50).optional(),
  makerFeeBps: z.number().min(0).max(50).optional(),
  slippageBps: z.number().min(0).max(100).optional(),
  /** ParamValues form seeds. */
  params: z.record(z.string(), z.string()),
})

export type RunDraft = z.infer<typeof runDraftSchema>
