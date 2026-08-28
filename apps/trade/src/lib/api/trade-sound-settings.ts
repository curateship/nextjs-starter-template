import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { invalidateDashboardBootstrap } from "@/lib/trade/dashboard-bootstrap-cache"
import { userGet, userPost } from "@/server/guards"
import {
  loadTradeSoundsEnabled,
  saveTradeSoundsEnabled,
} from "@/server/trade/prefs"

const loadTradeSoundSettingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => ({
    enabled: await loadTradeSoundsEnabled(context.user.id),
  }))

const saveTradeSoundSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.boolean())
  .handler(async ({ data, context }) => ({
    enabled: await saveTradeSoundsEnabled(context.user.id, data),
  }))

export function loadTradeSoundSettings() {
  return loadTradeSoundSettingsFn()
}

export async function saveTradeSoundSettings(enabled: boolean) {
  const answer = await saveTradeSoundSettingsFn({ data: enabled })
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
