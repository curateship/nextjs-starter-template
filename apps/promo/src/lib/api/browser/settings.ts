import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { IDLE_MINUTES_RANGE, MAX_OPEN_RANGE } from "@/lib/browser/limits"
import { readBrowserSettings, saveBrowserSettings, type BrowserSettings } from "@/server/browser/settings"

import { createErrorMessage } from "../error-message"

export type { BrowserSettings }

/**
 * The machine's browser settings, on the Browsers tab of Settings. Admin-only,
 * and the machine's rather than a person's, like the memory they protect.
 */

// The panel checks both numbers before saving, so a refusal here is rare.
export const getBrowserSettingsErrorMessage = createErrorMessage(
  {},
  "That did not save. Please try again."
)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<BrowserSettings> => readBrowserSettings())

export function loadBrowserSettings() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      maxOpen: z.number().int().min(MAX_OPEN_RANGE.min).max(MAX_OPEN_RANGE.max),
      idleMinutes: z.number().int().min(IDLE_MINUTES_RANGE.min).max(IDLE_MINUTES_RANGE.max),
    })
  )
  .handler(async ({ data }): Promise<BrowserSettings> => saveBrowserSettings(data))

export function saveBrowserSettingsFn(settings: BrowserSettings) {
  return saveFn({ data: settings })
}
