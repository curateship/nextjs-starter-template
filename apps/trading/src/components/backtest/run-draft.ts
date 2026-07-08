import { z } from "zod"

import { MAX_EXTRA_MARKETS, MAX_RUN_BARS } from "@/lib/backtest/types"
import { CANDLE_INTERVALS } from "@/lib/hl/ws"

/**
 * A configured-but-not-yet-executed run. The New Run modal produces one, the
 * workspace carries it in the `?draft=` search param so the user can tune
 * price levels on the chart, and "Run Backtest" turns it into the first
 * execution.
 */
export const runDraftSchema = z.object({
  name: z.string().max(255).optional(),
  strategy: z.enum(["grid", "dca", "momentum", "qqe"]),
  market: z.string().min(1).max(20),
  /** Additional markets the config is also run on (one row per market). */
  extraMarkets: z.array(z.string().min(1).max(20)).max(MAX_EXTRA_MARKETS).optional(),
  interval: z.enum(CANDLE_INTERVALS),
  windowDays: z.number().int().min(1).max(MAX_RUN_BARS),
  equity: z.number().positive(),
  takerFeeBps: z.number().min(0).max(50).optional(),
  makerFeeBps: z.number().min(0).max(50).optional(),
  slippageBps: z.number().min(0).max(100).optional(),
  /** ParamValues form seeds. */
  params: z.record(z.string(), z.string()),
})

export type RunDraft = z.infer<typeof runDraftSchema>
