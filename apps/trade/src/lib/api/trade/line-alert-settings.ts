import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { userGet, userPost } from "@/server/guards"
import { loadLineAlertsPaused, saveLineAlertsPaused } from "@/server/trade/prefs"

/**
 * The master switch for alerts on drawn lines, in Settings. Off pauses every
 * line alert on the account without switching any of them off.
 */

const pausedSchema = z.object({ paused: z.boolean() })

const loadLineAlertsPausedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) =>
    pausedSchema.parse({ paused: await loadLineAlertsPaused(context.user.id) })
  )

const saveLineAlertsPausedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(pausedSchema)
  .handler(async ({ data, context }) =>
    pausedSchema.parse({
      paused: await saveLineAlertsPaused(context.user.id, data.paused),
    })
  )

export async function loadLineAlertsPausedSetting(): Promise<boolean> {
  return (await loadLineAlertsPausedFn()).paused
}

export async function saveLineAlertsPausedSetting(
  paused: boolean
): Promise<boolean> {
  return (await saveLineAlertsPausedFn({ data: { paused } })).paused
}

export const getLineAlertsPausedLoadErrorMessage = createErrorMessage(
  {},
  "The line alerts setting could not be loaded. Try again."
)

export const getLineAlertsPausedSaveErrorMessage = createErrorMessage(
  {},
  "The line alerts setting could not be saved. Try again."
)
