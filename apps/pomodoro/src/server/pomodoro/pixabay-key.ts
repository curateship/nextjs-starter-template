import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { pomodoroAuditLogs, pomodoroSettings } from "@/server/pomodoro/schema"

/**
 * The Pixabay API key, for "Import from Pixabay". See "Pixabay" in
 * `workspace/docs/admin-settings.md`.
 *
 * One `pomodoro_settings` row, scrambled with the shell's `encryptSecret`. It
 * is kept out of `appSettingSchemas` on purpose: `loadAppSettings` sends every
 * key on that list to the browser, and this one must never leave the server.
 * The settings card sees only `pixabayKeyStatus`.
 */

export const PIXABAY_KEY_SETTING = "pixabay.apiKey"

/** SERVER ONLY. The live key, or null when none is saved. Throws when it cannot be unscrambled. */
export async function readPixabayKey(): Promise<string | null> {
  const [row] = await db
    .select({ value: pomodoroSettings.value })
    .from(pomodoroSettings)
    .where(eq(pomodoroSettings.key, PIXABAY_KEY_SETTING))
    .limit(1)
  if (!row) return null
  if (typeof row.value !== "string") throw new Error("SECRET_UNREADABLE")
  return decryptSecret(row.value)
}

export type PixabayKeyStatus = {
  configured: boolean
  /** The last four characters, enough to tell which key is saved. */
  maskedTail: string | null
  /** A key is saved but can no longer be unscrambled; pasting it again fixes it. */
  unreadable: boolean
}

export async function pixabayKeyStatus(): Promise<PixabayKeyStatus> {
  try {
    const key = await readPixabayKey()
    return key
      ? { configured: true, maskedTail: `••••${key.slice(-4)}`, unreadable: false }
      : { configured: false, maskedTail: null, unreadable: false }
  } catch {
    return { configured: false, maskedTail: null, unreadable: true }
  }
}

/**
 * Saves the key, or removes it with `null`, and writes the same `settings`
 * audit row a setting does. Throws ENCRYPTION_NOT_CONFIGURED rather than ever
 * storing the key as plain text.
 */
export async function savePixabayKey({
  key,
  actorUserId,
}: {
  key: string | null
  actorUserId: string
}): Promise<PixabayKeyStatus> {
  const stored = key === null ? null : encryptSecret(key.trim())
  await db.transaction(async (tx) => {
    if (stored === null) {
      await tx.delete(pomodoroSettings).where(eq(pomodoroSettings.key, PIXABAY_KEY_SETTING))
    } else {
      await tx
        .insert(pomodoroSettings)
        .values({ key: PIXABAY_KEY_SETTING, value: stored, updatedByUserId: actorUserId })
        .onConflictDoUpdate({
          target: pomodoroSettings.key,
          set: { value: stored, updatedByUserId: actorUserId, updatedAt: new Date() },
        })
    }
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: `setting_${PIXABAY_KEY_SETTING}`,
      resource: "settings",
      recordIds: [PIXABAY_KEY_SETTING],
    })
  })
  return pixabayKeyStatus()
}
