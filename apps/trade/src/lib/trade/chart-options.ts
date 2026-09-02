import { z } from "zod"

import {
  DEFAULT_TRADING_ZONE,
  readTradingZone,
} from "@/lib/trade/chart-timezone"

export const CHART_TYPES = ["candles", "line", "heikin-ashi"] as const
export type ChartType = (typeof CHART_TYPES)[number]
export const DEFAULT_CHART_TYPE: ChartType = "candles"

const chartTypeSchema = z.enum(CHART_TYPES)

export function readChartType(value: unknown): ChartType {
  return chartTypeSchema.safeParse(value).data ?? DEFAULT_CHART_TYPE
}

/**
 * How the chart is set up to be read: its price shape, which supporting parts
 * are shown, and which clock its times are on.
 *
 * All of it kept apart from the numeric zoom and position, because none of it
 * moves the chart — it only changes what you can see and what the labels say.
 */
export const chartOptionsSchema = z.object({
  chartType: chartTypeSchema,
  grid: z.boolean(),
  volume: z.boolean(),
  crosshair: z.boolean(),
  orderArrows: z.boolean(),
  orderArrowTrades: z.number().int().positive().nullable(),
  drawings: z.boolean(),
  /**
   * The one timezone — the axis, the crosshair and every session boundary read
   * it. See `chart-timezone.ts`; a name this build no longer offers falls back
   * to UTC rather than throwing.
   */
  zone: z.string().max(40).transform(readTradingZone),
})

export type ChartOptions = z.infer<typeof chartOptionsSchema>

/** The boolean parts that are simply shown or hidden. */
export type ChartOptionToggle = Exclude<
  keyof ChartOptions,
  "chartType" | "zone" | "orderArrowTrades"
>

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  chartType: DEFAULT_CHART_TYPE,
  grid: true,
  volume: true,
  crosshair: true,
  orderArrows: true,
  orderArrowTrades: null,
  drawings: true,
  zone: DEFAULT_TRADING_ZONE,
}

/**
 * Stored options, with a safe all-visible chart for a first or invalid value.
 *
 * Each field added since the column existed is read as optional, so a row
 * written by an older build comes back as itself plus that field's default,
 * rather than the whole row failing to parse and every other choice on it
 * being thrown away.
 */
export function readChartOptions(value: unknown): ChartOptions {
  const parsed = chartOptionsSchema
    .extend({
      chartType: chartTypeSchema.optional(),
      orderArrows: z.boolean().optional(),
      orderArrowTrades: z.number().int().positive().nullable().optional(),
      drawings: z.boolean().optional(),
      zone: z.string().max(40).optional(),
    })
    .safeParse(value)
  return parsed.success
    ? {
        ...parsed.data,
        chartType: parsed.data.chartType ?? DEFAULT_CHART_TYPE,
        orderArrows: parsed.data.orderArrows ?? true,
        orderArrowTrades: parsed.data.orderArrowTrades ?? null,
        drawings: parsed.data.drawings ?? true,
        zone: readTradingZone(parsed.data.zone),
      }
    : DEFAULT_CHART_OPTIONS
}
