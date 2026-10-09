import { inArray } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { pomodoroAuditLogs, pomodoroSettings } from "@/server/pomodoro/schema"
import {
  APP_SETTING_DEFAULTS,
  appSettingSchemas,
  readAppSetting,
  type AppSettingKey,
  type AppSettingValue,
} from "@/lib/pomodoro/app-settings"

/**
 * Reading and saving the app's admin settings. See
 * `workspace/docs/admin-settings.md`.
 *
 * Every page load reads a few of them, so the whole table is held for five
 * seconds; a save drops it at once. A row that no longer fits its shape reads
 * as the default.
 */

const CACHE_MS = 5_000

type AllSettings = { [K in AppSettingKey]: AppSettingValue<K> }

let cached: { from: CustomShellDb; at: number; settings: AllSettings } | null =
  null

export function forgetAppSettings() {
  cached = null
}

export async function loadAppSettings(
  database: CustomShellDb = db
): Promise<AllSettings> {
  if (cached && cached.from === database && Date.now() - cached.at < CACHE_MS)
    return cached.settings
  const keys = Object.keys(appSettingSchemas) as AppSettingKey[]
  const rows = await database
    .select({ key: pomodoroSettings.key, value: pomodoroSettings.value })
    .from(pomodoroSettings)
    .where(inArray(pomodoroSettings.key, keys))
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const settings = Object.fromEntries(
    keys.map((key) => [
      key,
      stored.has(key) ? readAppSetting(key, stored.get(key)) : APP_SETTING_DEFAULTS[key],
    ])
  ) as AllSettings
  cached = { from: database, at: Date.now(), settings }
  return settings
}

/**
 * Saves one setting after checking its shape, and writes the audit row in the
 * same transaction. Returns what is now stored. `action` and `resource` name
 * the audit row when a save means more than "a setting changed", such as
 * pausing the made-up members (`simulated_pause` on `simulated`).
 */
export async function saveAppSetting<K extends AppSettingKey>({
  key,
  value,
  actorUserId,
  action = `setting_${key}`,
  resource = "settings",
}: {
  key: K
  value: unknown
  actorUserId: string
  action?: string
  resource?: string
}): Promise<AppSettingValue<K>> {
  const parsed = appSettingSchemas[key].parse(value) as AppSettingValue<K>
  await db.transaction(async (tx) => {
    await tx
      .insert(pomodoroSettings)
      .values({ key, value: parsed, updatedByUserId: actorUserId })
      .onConflictDoUpdate({
        target: pomodoroSettings.key,
        set: { value: parsed, updatedByUserId: actorUserId, updatedAt: new Date() },
      })
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: action.slice(0, 40),
      resource,
      recordIds: [key],
    })
  })
  forgetAppSettings()
  return parsed
}
