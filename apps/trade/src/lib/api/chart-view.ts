import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { chartViewSchema, type ChartView } from "@/lib/trade/chart-view"
import { userGet, userPost } from "@/server/guards"
import { loadChartView, saveChartView } from "@/server/trade/prefs"

/**
 * How far the chart is zoomed and scrolled, kept against the account.
 *
 * Against the account rather than in the browser's own storage because this
 * app runs inside an embedded preview where those writes are quietly dropped —
 * and because a view worth setting is worth having on the other machine too.
 */

const saveChartViewSchema = z.object({ chartView: chartViewSchema })

const loadChartViewFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ chartView: ChartView | null }> => {
    return { chartView: await loadChartView(context.user.id) }
  })

const saveChartViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveChartViewSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveChartView(context.user.id, data.chartView)
    return { saved: true }
  })

export function loadRememberedChartView() {
  return loadChartViewFn()
}

export function saveRememberedChartView(chartView: ChartView) {
  return saveChartViewFn({ data: { chartView } })
}
