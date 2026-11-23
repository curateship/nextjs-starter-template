import { createServerFn } from "@tanstack/react-start"

import { createErrorMessage } from "@/lib/api/error-message"
import { invalidateDashboardBootstrap } from "@/lib/trade/dashboard-bootstrap-cache"
import { minimumMarketVolumeSchema } from "@/lib/trade/market-volume"
import { userGet, userPost } from "@/server/guards"
import {
  loadMinimumMarketVolume,
  saveMinimumMarketVolume,
} from "@/server/trade/prefs"

const loadMarketSettingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => ({
    minimumVolumeUsd: await loadMinimumMarketVolume(context.user.id),
  }))

const saveMarketSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(minimumMarketVolumeSchema)
  .handler(async ({ data, context }) => ({
    minimumVolumeUsd: await saveMinimumMarketVolume(context.user.id, data),
  }))

export function loadMarketSettings() {
  return loadMarketSettingsFn()
}

export async function saveMarketSettings(minimumVolumeUsd: number) {
  const answer = await saveMarketSettingsFn({ data: minimumVolumeUsd })
  invalidateDashboardBootstrap()
  return answer
}

export const getMarketSettingsLoadErrorMessage = createErrorMessage(
  {},
  "The market setting could not be loaded. Try again."
)

export const getMarketSettingsSaveErrorMessage = createErrorMessage(
  {},
  "The market setting could not be saved. Try again."
)
