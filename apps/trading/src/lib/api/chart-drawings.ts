import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { hyperliquidMarketSchema } from "@/lib/hl/market-symbol"
import type { ChartPosition } from "@/lib/trading/chart-positions"
import type { ChartDrawings } from "@/lib/trading/chart-drawings"
import type { Trendline } from "@/lib/trading/trendlines"

const priceSchema = z.number().finite().positive().max(1_000_000_000_000_000)
const timeSchema = z.number().int().min(1).max(4_102_444_800)

const pointSchema = z
  .object({ time: timeSchema, price: priceSchema })
  .strict()

const trendlineSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    start: pointSchema,
    end: pointSchema,
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  })
  .strict()

const positionSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    side: z.enum(["long", "short"]),
    startTime: timeSchema,
    endTime: timeSchema,
    entry: priceSchema,
    target: priceSchema,
    stop: priceSchema,
  })
  .strict()

export const chartDrawingScopeSchema = z
  .object({
    network: z.enum(["testnet", "mainnet"]),
    market: hyperliquidMarketSchema,
  })
  .strict()

const chartTrendlinesSchema = z.array(trendlineSchema).max(200)
const chartPositionsSchema = z.array(positionSchema).max(100)

export const saveChartDrawingsSchema = chartDrawingScopeSchema.extend({
  trendlines: chartTrendlinesSchema,
  positions: chartPositionsSchema,
})

export function parseChartTrendlines(input: unknown): Trendline[] {
  return chartTrendlinesSchema.parse(input)
}

export function parseChartPositions(input: unknown): ChartPosition[] {
  return chartPositionsSchema.parse(input)
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

const loadChartDrawingsFn = createServerFn({ method: "GET" })
  .inputValidator(chartDrawingScopeSchema)
  .handler(async ({ data }): Promise<ChartDrawings> => {
    const user = await requireUser()
    const { loadUserChartDrawings } = await import("@/server/chart-drawings")
    const drawings = await loadUserChartDrawings(user.id, data)
    return {
      trendlines: parseChartTrendlines(drawings.trendlines),
      positions: parseChartPositions(drawings.positions),
    }
  })

const saveChartDrawingsFn = createServerFn({ method: "POST" })
  .inputValidator(saveChartDrawingsSchema)
  .handler(async ({ data }): Promise<ChartDrawings> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { saveUserChartDrawings } = await import("@/server/chart-drawings")
    return await saveUserChartDrawings(user.id, data)
  })

export async function loadChartDrawings(
  input: z.input<typeof chartDrawingScopeSchema>
): Promise<ChartDrawings> {
  return await loadChartDrawingsFn({ data: input })
}

export async function saveChartDrawings(
  input: z.input<typeof saveChartDrawingsSchema>
): Promise<ChartDrawings> {
  return await saveChartDrawingsFn({ data: input })
}
