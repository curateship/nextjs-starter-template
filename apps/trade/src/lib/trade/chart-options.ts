import { z } from "zod"

/** The parts of the chart somebody can choose to show or hide. */
export const chartOptionsSchema = z.object({
  grid: z.boolean(),
  volume: z.boolean(),
  crosshair: z.boolean(),
  orderArrows: z.boolean(),
})

export type ChartOptions = z.infer<typeof chartOptionsSchema>

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  grid: true,
  volume: true,
  crosshair: true,
  orderArrows: true,
}

/** Stored options, with a safe all-visible chart for a first or invalid value. */
export function readChartOptions(value: unknown): ChartOptions {
  const parsed = chartOptionsSchema
    .extend({ orderArrows: z.boolean().optional() })
    .safeParse(value)
  return parsed.success
    ? { ...parsed.data, orderArrows: parsed.data.orderArrows ?? true }
    : DEFAULT_CHART_OPTIONS
}
