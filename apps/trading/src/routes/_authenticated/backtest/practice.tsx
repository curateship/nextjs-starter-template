import { ClientOnly, createFileRoute, Navigate } from "@tanstack/react-router"
import { z } from "zod"

import { ManualSessionScreen } from "@/components/backtest/manual-session"
import type { PracticeConfig } from "@/components/backtest/practice-setup-dialog"
import {
  MANUAL_RISK_PCT_MAX,
  MANUAL_RISK_PCT_MIN,
} from "@/lib/backtest/manual-types"
import { BACKTEST_INTERVALS } from "@/lib/backtest/types"

const practiceSearchSchema = z.object({
  market: z.string().min(1).max(20).optional(),
  interval: z.enum(BACKTEST_INTERVALS).optional(),
  days: z.number().int().min(1).optional(),
  equity: z.number().positive().optional(),
  risk: z.number().min(MANUAL_RISK_PCT_MIN).max(MANUAL_RISK_PCT_MAX).optional(),
})

export const Route = createFileRoute("/_authenticated/backtest/practice")({
  validateSearch: practiceSearchSchema,
  component: PracticeRoute,
})

/**
 * Manual practice mode: rewind a market's history and trade it by hand by
 * drawing long/short position boxes. Configured by the Practice modal on the
 * Backtest dashboard; opening this route without a full config bounces back.
 */
function PracticeRoute() {
  const { market, interval, days, equity, risk } = Route.useSearch()
  if (!market || !interval || !days || !equity || !risk) {
    return <Navigate to="/backtest" replace />
  }
  const config: PracticeConfig = {
    market,
    interval,
    days,
    equity,
    riskPct: risk,
  }
  return (
    <ClientOnly fallback={null}>
      <ManualSessionScreen config={config} />
    </ClientOnly>
  )
}
