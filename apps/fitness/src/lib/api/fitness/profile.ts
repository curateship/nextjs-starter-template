import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { appSettingSchemas, type AppSettingKey, type AppSettingValue } from "@/lib/fitness/app-settings"
import { appUrlFor } from "@/server/app-url"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import { loadAppSettings, saveAppSetting } from "@/server/fitness/app-settings"
import { calendarTokenFor, resetCalendarToken, saveTimeZone, turnCalendarFeedOff } from "@/server/fitness/profile"

export type { FitnessPreferences } from "@/server/fitness/profile"

/**
 * Fitness's app-wide settings, for the tabs under Settings, App settings.
 * Only the site admin reaches that page, so only the site admin's calls work.
 */
const loadSettingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => loadAppSettings())

export function loadFitnessSettings() {
  return loadSettingsFn()
}

const keySchema = z.enum(Object.keys(appSettingSchemas) as [AppSettingKey, ...AppSettingKey[]])

const saveSettingFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ key: keySchema, value: z.unknown() }))
  .handler(async ({ data, context }) =>
    saveAppSetting(data.key, appSettingSchemas[data.key].parse(data.value) as never, context.user.id)
  )

export function saveFitnessSetting<K extends AppSettingKey>(key: K, value: AppSettingValue<K>) {
  return saveSettingFn({ data: { key, value } }) as Promise<AppSettingValue<K>>
}

/**
 * The person's own clock, which only their browser knows. The Programs
 * dashboard sends it once when it differs from what the server holds.
 */
const timeZoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ timeZone: z.string().min(1).max(64) }))
  .handler(async ({ data, context }) => saveTimeZone(context.user.id, data.timeZone))

export function saveMyTimeZone(timeZone: string) {
  return timeZoneFn({ data: { timeZone } })
}

function feedUrl(token: string | null) {
  return token ? appUrlFor(`/api/fitness/calendar/${token}`) : null
}

/** The asker's own calendar feed address. Each person has their own secret. */
const feedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => ({ url: feedUrl(await calendarTokenFor(context.user.id)) }))

export function loadCalendarFeed() {
  return feedFn()
}

const feedChangeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ action: z.enum(["reset", "off"]) }))
  .handler(async ({ data, context }) => {
    if (data.action === "off") {
      await turnCalendarFeedOff(context.user.id)
      return { url: null }
    }
    return { url: feedUrl(await resetCalendarToken(context.user.id)) }
  })

export function changeCalendarFeed(action: "reset" | "off") {
  return feedChangeFn({ data: { action } })
}
