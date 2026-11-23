import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { MAX_WORKING_RANGE, PHONE_KINDS, SCREENSHOT_DAYS_RANGE, SHELF_RANGE, type PhoneKind } from "@/lib/phones/options"
import { adminGet, adminPost } from "@/server/guards"
import { listPhones } from "@/server/phones/phones"
import { setTestPhone } from "@/server/phones/self-test"
import { readPhoneSettings, savePhoneSettings, type PhoneSettings } from "@/server/phones/settings"

import { createErrorMessage } from "../error-message"

export type { PhoneSettings }

/** The tab's numbers, the self-test phone of each kind, and the phones they could be. */
export type PhoneSettingsPage = PhoneSettings & {
  testPhoneId: string | null
  testPhoneIphoneId: string | null
  phones: Array<{ id: string; name: string; kind: PhoneKind; accounts: number }>
}

/**
 * The rack's settings, on the Phones tab of Settings. Admin-only. The numbers
 * are checked on the server as well as on the page, with plain words, so a
 * value out of range is refused saying what is allowed.
 */
export const getPhoneSettingsErrorMessage = createErrorMessage(
  {
    "number of phones": `The number of phones has to be a whole number from ${MAX_WORKING_RANGE.min} to ${MAX_WORKING_RANGE.max}.`,
    "The days": `The days have to be a whole number from ${SCREENSHOT_DAYS_RANGE.min} to ${SCREENSHOT_DAYS_RANGE.max}.`,
    "shelf's": `The shelf's rows and columns have to be whole numbers from ${SHELF_RANGE.min} to ${SHELF_RANGE.max}.`,
    "self-test phone must be": "That phone runs a real account. The self-test phone must be a spare one with only its test account; move the account to another phone first.",
    "Pick it in the other slot": "That phone is the other kind. An Android goes in the Android slot and an iPhone in the iPhone slot.",
    "does not exist": "That phone is not there any more. Refresh the page.",
  },
  "That did not save. Please try again."
)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<PhoneSettingsPage> => {
    const [{ maxWorking, screenshotDays, shelfRows, shelfColumns, testPhoneId, testPhoneIphoneId }, phones] =
      await Promise.all([readPhoneSettings(), listPhones(context.user.id)])
    return {
      maxWorking,
      screenshotDays,
      shelfRows,
      shelfColumns,
      testPhoneId,
      testPhoneIphoneId,
      phones: phones.map((phone) => ({ id: phone.id, name: phone.name, kind: phone.kind, accounts: phone.accounts.length })),
    }
  })

export function loadPhoneSettings() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ maxWorking: z.number(), screenshotDays: z.number(), shelfRows: z.number(), shelfColumns: z.number() }))
  .handler(async ({ data }): Promise<PhoneSettings> => savePhoneSettings(data))

export function savePhoneSettingsFn(settings: PhoneSettings) {
  return saveFn({ data: settings })
}

const testPhoneFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ phoneId: z.string().min(1).nullable(), kind: z.enum(PHONE_KINDS).default("android") }))
  .handler(async ({ context, data }): Promise<void> => setTestPhone(context.user.id, data.phoneId, data.kind))

/** Picks the spare phone of one kind the daily self-test runs on, or none. */
export function saveTestPhone(phoneId: string | null, kind: PhoneKind) {
  return testPhoneFn({ data: { phoneId, kind } })
}
