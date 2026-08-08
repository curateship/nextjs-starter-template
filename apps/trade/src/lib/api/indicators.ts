import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  indicatorSettingsSchema,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"
import { userGet, userPost } from "@/server/guards"
import { loadIndicators, saveIndicators } from "@/server/trade/prefs"

import { createErrorMessage } from "./error-message"

/**
 * Which indicators the chart is showing, kept against the account.
 *
 * Against the account rather than the market, the same as the zoom: an
 * indicator is how somebody reads a chart, not a fact about one coin. And
 * server-side rather than in the browser's own storage, because this app runs
 * inside an embedded preview where those writes are quietly dropped.
 *
 * The chart itself never reaches this file. It draws whatever shapes the
 * indicator layer hands it and has never heard the word.
 */

const saveIndicatorsSchema = z.object({ indicators: indicatorSettingsSchema })

const loadIndicatorsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ indicators: IndicatorSettings }> => {
    return { indicators: await loadIndicators(context.user.id) }
  })

const saveIndicatorsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveIndicatorsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveIndicators(context.user.id, data.indicators)
    return { saved: true }
  })

export function loadIndicatorSettings() {
  return loadIndicatorsFn()
}

export function saveIndicatorSettings(indicators: IndicatorSettings) {
  return saveIndicatorsFn({ data: { indicators } })
}

export const getIndicatorsErrorMessage = createErrorMessage(
  {},
  "That indicator setting was not saved. The chart is still showing it, but it will be back to how it was after a reload."
)
