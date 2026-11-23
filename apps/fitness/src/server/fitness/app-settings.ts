import {
  APP_SETTING_KEYS,
  DEFAULT_APP_SETTINGS,
  appSettingSchemas,
  type AppSettingKey,
  type AppSettingValue,
  type FitnessAppSettings,
} from "@/lib/fitness/app-settings"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import type { FitnessDb } from "@/server/fitness/access"
import { fitnessAppSettings } from "@/server/fitness/schema"

/**
 * The app-wide settings, read with each group's saved value laid over its
 * default. A saved value that no longer fits its rules (a field added since)
 * falls back to the default for that group rather than breaking every page.
 */
export async function loadAppSettings(database: FitnessDb = db): Promise<FitnessAppSettings> {
  const rows = await database.select().from(fitnessAppSettings)
  const settings = { ...DEFAULT_APP_SETTINGS } as FitnessAppSettings
  for (const key of APP_SETTING_KEYS) {
    const row = rows.find((entry) => entry.key === key)
    if (!row) continue
    const parsed = appSettingSchemas[key].safeParse({ ...DEFAULT_APP_SETTINGS[key], ...(row.value as object) })
    if (parsed.success) (settings as Record<AppSettingKey, unknown>)[key] = parsed.data
  }
  return settings
}

export async function saveAppSetting<K extends AppSettingKey>(
  key: K,
  value: AppSettingValue<K>,
  actorUserId: string,
  database: FitnessDb = db
): Promise<AppSettingValue<K>> {
  const parsed = appSettingSchemas[key].parse(value) as AppSettingValue<K>
  const stored =
    key === "units"
      ? { ...(parsed as AppSettingValue<"units">), platesKg: [...new Set((parsed as AppSettingValue<"units">).platesKg)].sort((a, b) => b - a) }
      : parsed
  await database
    .insert(fitnessAppSettings)
    .values({ key, value: stored, updatedAt: now(), updatedByUserId: actorUserId })
    .onConflictDoUpdate({
      target: fitnessAppSettings.key,
      set: { value: stored, updatedAt: now(), updatedByUserId: actorUserId },
    })
  return stored as AppSettingValue<K>
}
