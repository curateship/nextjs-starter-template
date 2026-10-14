import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { MAX_WORKING_RANGE, SCREENSHOT_DAYS_RANGE } from "@/lib/phones/options"
import { adminGet, adminPost } from "@/server/guards"
import { readPhoneSettings, savePhoneSettings, type PhoneSettings } from "@/server/phones/settings"

import { createErrorMessage } from "../error-message"

export type { PhoneSettings }

/**
 * The rack's settings, on the Phones tab of Settings. Admin-only. The numbers
 * are checked on the server as well as on the page, with plain words, so a
 * value out of range is refused saying what is allowed.
 */
export const getPhoneSettingsErrorMessage = createErrorMessage(
  {
    "number of phones": `The number of phones has to be a whole number from ${MAX_WORKING_RANGE.min} to ${MAX_WORKING_RANGE.max}.`,
    "The days": `The days have to be a whole number from ${SCREENSHOT_DAYS_RANGE.min} to ${SCREENSHOT_DAYS_RANGE.max}.`,
  },
  "That did not save. Please try again."
)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<PhoneSettings> => {
    const { maxWorking, screenshotDays } = await readPhoneSettings()
    return { maxWorking, screenshotDays }
  })

export function loadPhoneSettings() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ maxWorking: z.number(), screenshotDays: z.number() }))
  .handler(async ({ data }): Promise<PhoneSettings> => savePhoneSettings(data))

export function savePhoneSettingsFn(settings: PhoneSettings) {
  return saveFn({ data: settings })
}
