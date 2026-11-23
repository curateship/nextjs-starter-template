import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { invalidateDashboardBootstrap } from "@/lib/trade/dashboard-bootstrap-cache"
import type { TradeSoundSettings } from "@/lib/trade/trade-sounds"
import { userGet, userPost } from "@/server/guards"
import {
  loadTradeSoundPreferences,
  saveTradeSoundPreferences,
} from "@/server/trade/prefs"

const tradeSoundSettingsSchema = z.object({
  fillsAndStops: z.boolean(),
  alerts: z.boolean(),
})

const loadTradeSoundSettingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) =>
    tradeSoundSettingsSchema.parse(
      await loadTradeSoundPreferences(context.user.id)
    )
  )

const saveTradeSoundSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(tradeSoundSettingsSchema)
  .handler(async ({ data, context }) =>
    tradeSoundSettingsSchema.parse(
      await saveTradeSoundPreferences(context.user.id, data)
    )
  )

export function loadTradeSoundSettings() {
  return loadTradeSoundSettingsFn()
}

export async function saveTradeSoundSettings(settings: TradeSoundSettings) {
  const answer = await saveTradeSoundSettingsFn({ data: settings })
  invalidateDashboardBootstrap()
  return answer
}

export const getTradeSoundSettingsLoadErrorMessage = createErrorMessage(
  {},
  "The sound setting could not be loaded. Try again."
)

export const getTradeSoundSettingsSaveErrorMessage = createErrorMessage(
  {},
  "The sound setting could not be saved. Try again."
)
