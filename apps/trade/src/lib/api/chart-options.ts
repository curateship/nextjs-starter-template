import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  chartOptionsSchema,
  type ChartOptions,
} from "@/lib/trade/chart-options"
import { createErrorMessage } from "@/lib/api/error-message"
import { userGet, userPost } from "@/server/guards"
import { loadChartOptions, saveChartOptions } from "@/server/trade/prefs"

const saveChartOptionsSchema = z.object({ options: chartOptionsSchema })

const loadChartOptionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ options: ChartOptions }> => ({
    options: await loadChartOptions(context.user.id),
  }))

const saveChartOptionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .validator(saveChartOptionsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveChartOptions(context.user.id, data.options)
    return { saved: true }
  })

export function loadRememberedChartOptions() {
  return loadChartOptionsFn()
}

export function saveRememberedChartOptions(options: ChartOptions) {
  return saveChartOptionsFn({ data: { options } })
}

export const getChartOptionsErrorMessage = createErrorMessage(
  {},
  "That view option was not saved. The chart is still showing your choice, but it will be back to how it was after a reload."
)
