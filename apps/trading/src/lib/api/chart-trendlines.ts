import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { hyperliquidMarketSchema } from "@/lib/hl/market-symbol"
import type { Trendline } from "@/lib/trading/trendlines"

const pointSchema = z
  .object({
    time: z.number().int().min(1).max(4_102_444_800),
    price: z.number().finite().positive().max(1_000_000_000_000_000),
  })
  .strict()

const trendlineSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    start: pointSchema,
    end: pointSchema,
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  })
  .strict()

export const chartTrendlineScopeSchema = z
  .object({
    network: z.enum(["testnet", "mainnet"]),
    market: hyperliquidMarketSchema,
  })
  .strict()

export const chartTrendlinesSchema = z.array(trendlineSchema).max(200)

export const saveChartTrendlinesSchema = chartTrendlineScopeSchema.extend({
  trendlines: chartTrendlinesSchema,
})

export function parseChartTrendlines(input: unknown): Trendline[] {
  return chartTrendlinesSchema.parse(input)
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

const loadChartTrendlinesFn = createServerFn({ method: "GET" })
  .inputValidator(chartTrendlineScopeSchema)
  .handler(async ({ data }): Promise<{ trendlines: Trendline[] }> => {
    const user = await requireUser()
    const { loadUserChartTrendlines } =
      await import("@/server/chart-trendlines")
    const trendlines = await loadUserChartTrendlines(user.id, data)
    return { trendlines: parseChartTrendlines(trendlines) }
  })

const saveChartTrendlinesFn = createServerFn({ method: "POST" })
  .inputValidator(saveChartTrendlinesSchema)
  .handler(async ({ data }): Promise<{ trendlines: Trendline[] }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { saveUserChartTrendlines } =
      await import("@/server/chart-trendlines")
    return { trendlines: await saveUserChartTrendlines(user.id, data) }
  })

export async function loadChartTrendlines(
  input: z.input<typeof chartTrendlineScopeSchema>
): Promise<Trendline[]> {
  return (await loadChartTrendlinesFn({ data: input })).trendlines
}

export async function saveChartTrendlines(
  input: z.input<typeof saveChartTrendlinesSchema>
): Promise<Trendline[]> {
  return (await saveChartTrendlinesFn({ data: input })).trendlines
}
