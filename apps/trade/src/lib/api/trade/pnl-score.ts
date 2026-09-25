import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PNL_PERIODS, type PnlPeriod } from "@/lib/trade/pnl/periods"
import type { PnlScore } from "@/lib/trade/pnl/score"
import { userGet } from "@/server/guards"
import { loadPnlScore } from "@/server/trade/pnl-score"

/**
 * The AI score for one period. A read rather than a change even though it
 * may call a provider: pressing the period tab twice must give the same
 * answer, and the remembered score is what makes that true.
 */
const loadPnlScoreFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ period: z.enum(PNL_PERIODS) }))
  .handler(({ data, context }): Promise<PnlScore> =>
    loadPnlScore(context.user.id, data.period)
  )

export function loadPnlScoreFor(period: PnlPeriod) {
  return loadPnlScoreFn({ data: { period } })
}
