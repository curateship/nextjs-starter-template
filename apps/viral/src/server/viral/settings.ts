import { eq } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db, type CustomShellDb } from "@/server/db"
import { viralSettings } from "@/server/viral/schema"

/**
 * Viral's own settings row: the YouTube key (Settings → YouTube), and the
 * Video app's address and key (Settings → Video connection). Keys are
 * scrambled the way the shell scrambles AI keys, and the browser only ever
 * sees their last four characters. SERVER ONLY.
 */

const SETTINGS_ROW_ID = "viral"
const YOUTUBE_ENV_VAR = "VIRAL_YOUTUBE_API_KEY"

type KeyColumn = "youtubeApiKey" | "videoKey"

async function readRow(database: CustomShellDb) {
  const [row] = await database.select().from(viralSettings).where(eq(viralSettings.id, SETTINGS_ROW_ID)).limit(1)
  return row ?? null
}

async function upsert(values: Partial<typeof viralSettings.$inferInsert>, database: CustomShellDb) {
  const timestamp = now()
  await database
    .insert(viralSettings)
    .values({ id: SETTINGS_ROW_ID, ...values, createdAt: timestamp, updatedAt: timestamp })
    .onConflictDoUpdate({ target: viralSettings.id, set: { ...values, updatedAt: timestamp } })
}

/**
 * What a settings card may know about a key: that it exists, where it comes
 * from, and its last four characters. `unreadable` means a row exists but the
 * server's encryption key changed, and the fix is pasting the key again.
 */
export type YoutubeKeyStatus = {
  configured: boolean
  maskedKey: string | null
  source: "settings" | "env" | null
  unreadable: boolean
}

export type SavedKeyStatus = { configured: boolean; maskedKey: string | null; unreadable: boolean }

function statusOf(scrambled: string | null | undefined): SavedKeyStatus {
  if (!scrambled) return { configured: false, maskedKey: null, unreadable: false }
  try {
    return { configured: true, maskedKey: `••••${decryptSecret(scrambled).slice(-4)}`, unreadable: false }
  } catch {
    return { configured: false, maskedKey: null, unreadable: true }
  }
}

async function saveKey(column: KeyColumn, apiKey: string, database: CustomShellDb) {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error("EMPTY_KEY")
  await upsert({ [column]: encryptSecret(trimmed) }, database)
}

async function removeKey(column: KeyColumn, database: CustomShellDb) {
  await database.update(viralSettings).set({ [column]: null, updatedAt: now() }).where(eq(viralSettings.id, SETTINGS_ROW_ID))
}

/**
 * The YouTube Data API key. A saved key wins over the env var; one that can no
 * longer be unscrambled throws rather than quietly falling back.
 */
export async function getYoutubeApiKey(database: CustomShellDb = db): Promise<string | null> {
  const row = await readRow(database)
  if (row?.youtubeApiKey) return decryptSecret(row.youtubeApiKey)
  return process.env[YOUTUBE_ENV_VAR] || null
}

export async function getYoutubeKeyStatus(database: CustomShellDb = db): Promise<YoutubeKeyStatus> {
  const row = await readRow(database)
  if (row?.youtubeApiKey) return { ...statusOf(row.youtubeApiKey), source: "settings" }
  const envKey = process.env[YOUTUBE_ENV_VAR]
  if (envKey) return { configured: true, maskedKey: `••••${envKey.slice(-4)}`, source: "env", unreadable: false }
  return { configured: false, maskedKey: null, source: null, unreadable: false }
}

export function saveYoutubeApiKey(apiKey: string, database: CustomShellDb = db) {
  return saveKey("youtubeApiKey", apiKey, database)
}

export function removeYoutubeApiKey(database: CustomShellDb = db) {
  return removeKey("youtubeApiKey", database)
}

/** The key the Video app made for Viral on its Settings → Viral, or null. */
export async function getVideoApiKey(database: CustomShellDb = db): Promise<string | null> {
  const row = await readRow(database)
  return row?.videoKey ? decryptSecret(row.videoKey) : null
}

export async function getVideoKeyStatus(database: CustomShellDb = db): Promise<SavedKeyStatus> {
  return statusOf((await readRow(database))?.videoKey)
}

export function saveVideoApiKey(apiKey: string, database: CustomShellDb = db) {
  return saveKey("videoKey", apiKey, database)
}

export function removeVideoApiKey(database: CustomShellDb = db) {
  return removeKey("videoKey", database)
}

/** The Video app's address on Settings → Video connection, or "". */
export async function getVideoUrl(database: CustomShellDb = db): Promise<string> {
  return (await readRow(database))?.videoUrl ?? ""
}

export function saveVideoUrl(url: string, database: CustomShellDb = db) {
  return upsert({ videoUrl: url }, database)
}
