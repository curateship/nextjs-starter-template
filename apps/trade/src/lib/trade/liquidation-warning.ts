import { z } from "zod"

export const liquidationWarningSchema = z.object({
  usd: z.number().finite().positive().max(1_000_000_000).nullable(),
  pct: z.number().finite().positive().max(100).nullable(),
})

export type LiquidationWarning = z.infer<typeof liquidationWarningSchema>

export const NO_LIQUIDATION_WARNING: LiquidationWarning = {
  usd: null,
  pct: null,
}

export function readLiquidationWarning(value: {
  usd?: unknown
  pct?: unknown
}): LiquidationWarning {
  const parsed = liquidationWarningSchema.safeParse(value)
  return parsed.success ? parsed.data : NO_LIQUIDATION_WARNING
}

export function isInsideLiquidationWarning(
  distance: { usd: number; fraction: number },
  warning: LiquidationWarning
): boolean {
  return (
    (warning.usd !== null && distance.usd <= warning.usd) ||
    (warning.pct !== null && distance.fraction <= warning.pct / 100)
  )
}
