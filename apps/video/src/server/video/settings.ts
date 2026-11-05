import { eq } from "drizzle-orm"

import { readAiDefaults, type AiDefaults } from "@/lib/video/ai-choices"
import {
  readCaptionSettings,
  type CaptionLook,
  type CaptionSettings,
} from "@/lib/video/caption-look"
import type { SafeBoxes } from "@/lib/video/safe-box"
import {
  readBannedWords,
  SCRIPT_STARTER_BANNED_WORDS,
} from "@/lib/video/script-check"
import {
  DEFAULT_SEEDANCE_REGION,
  DEFAULT_WAN_REGION,
  regionsFor,
  type KeyedCompany,
} from "@/lib/video/video-models"
import { readVoiceDefaults, type VoiceDefaults } from "@/lib/video/voice"
import { now } from "@/server/auth/security"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db, type CustomShellDb } from "@/server/db"
import { videoSettings } from "@/server/video/schema"

/** The app's own settings, kept on one row whose id is `default`. */
const SETTINGS_ROW_ID = "default"

/** The voice this app reads in, or nothing when none has been saved. */
export async function getVoiceDefaults(
  database: CustomShellDb = db
): Promise<VoiceDefaults | null> {
  const [row] = await database
    .select()
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return row ? readVoiceDefaults(row.voiceDefaults) : null
}

export async function saveVoiceDefaults(
  value: unknown,
  database: CustomShellDb = db
): Promise<VoiceDefaults | null> {
  const voiceDefaults = readVoiceDefaults(value)
  if (!voiceDefaults) return null
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      voiceDefaults,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { voiceDefaults, updatedAt: timestamp },
    })
  return voiceDefaults
}

/** Which AI writes speech down, and which rewrites words. */
export async function getAiDefaults(
  database: CustomShellDb = db
): Promise<AiDefaults> {
  const [row] = await database
    .select()
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return row ? readAiDefaults(row.aiDefaults) : {}
}

/** Saved the moment a choice is made, so it is only ever made once. */
export async function saveAiDefaults(
  value: unknown,
  database: CustomShellDb = db
): Promise<AiDefaults> {
  const current = await getAiDefaults(database)
  const aiDefaults = { ...current, ...readAiDefaults(value) }
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      aiDefaults,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { aiDefaults, updatedAt: timestamp },
    })
  return aiDefaults
}

/**
 * The words the script check flags. The starter words until a list is saved
 * on Settings → Scripts; after that, exactly the saved list, even an empty one.
 */
export async function getScriptBannedWords(
  database: CustomShellDb = db
): Promise<string[]> {
  const [row] = await database
    .select()
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return readBannedWords(row?.scriptBannedWords) ?? [
    ...SCRIPT_STARTER_BANNED_WORDS,
  ]
}

export async function saveScriptBannedWords(
  words: string[],
  database: CustomShellDb = db
): Promise<string[]> {
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      scriptBannedWords: words,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { scriptBannedWords: words, updatedAt: timestamp },
    })
  return words
}

/**
 * The look new captions take and the platform safe boxes, from Settings →
 * Captions. The standard look and the starting numbers until either is saved.
 */
export async function getCaptionSettings(
  database: CustomShellDb = db
): Promise<CaptionSettings> {
  const [row] = await database
    .select({
      captionLook: videoSettings.captionLook,
      safeBoxes: videoSettings.safeBoxes,
    })
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return readCaptionSettings({
    look: row?.captionLook,
    safeBoxes: row?.safeBoxes,
  })
}

/** Checked by the caller's validator; written whole. */
export async function saveCaptionLook(
  captionLook: CaptionLook,
  database: CustomShellDb = db
): Promise<CaptionLook> {
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      captionLook,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { captionLook, updatedAt: timestamp },
    })
  return captionLook
}

/** Checked by the caller's validator; written whole, all three platforms. */
export async function saveSafeBoxes(
  safeBoxes: SafeBoxes,
  database: CustomShellDb = db
): Promise<SafeBoxes> {
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      safeBoxes,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { safeBoxes, updatedAt: timestamp },
    })
  return safeBoxes
}

/**
 * Keys kept one to a column on the settings row, scrambled the same way the
 * shell scrambles AI keys: Pexels for B-roll and carousel photos, Sync Labs
 * for lips (lip-sync.md). The browser only ever sees a key's last four
 * characters.
 */
type SavedKeyColumn = "pexelsApiKey" | "syncApiKey" | "promoApiKey"

/**
 * What a settings card may know about a saved key: that it exists and its
 * last four characters, never the key itself. `unreadable` means the server's
 * encryption key changed, and the fix is pasting the key again.
 */
export type SavedKeyStatus = {
  configured: boolean
  maskedKey: string | null
  unreadable: boolean
}

async function readSavedKey(column: SavedKeyColumn, database: CustomShellDb) {
  const [row] = await database
    .select({ key: videoSettings[column] })
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return row?.key ?? null
}

/** A saved key, or null. A key that can't be unscrambled throws. SERVER ONLY. */
async function getSavedKey(column: SavedKeyColumn, database: CustomShellDb) {
  const key = await readSavedKey(column, database)
  return key ? decryptSecret(key) : null
}

async function getSavedKeyStatus(column: SavedKeyColumn, database: CustomShellDb): Promise<SavedKeyStatus> {
  const key = await readSavedKey(column, database)
  if (!key) return { configured: false, maskedKey: null, unreadable: false }
  try {
    return { configured: true, maskedKey: `••••${decryptSecret(key).slice(-4)}`, unreadable: false }
  } catch {
    return { configured: false, maskedKey: null, unreadable: true }
  }
}

/** Saves a key encrypted at rest, never as plain text. */
async function saveSavedKey(column: SavedKeyColumn, apiKey: string, database: CustomShellDb) {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error("EMPTY_KEY")
  const scrambled = encryptSecret(trimmed)
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({ id: SETTINGS_ROW_ID, [column]: scrambled, createdAt: timestamp, updatedAt: timestamp })
    .onConflictDoUpdate({ target: videoSettings.id, set: { [column]: scrambled, updatedAt: timestamp } })
}

async function removeSavedKey(column: SavedKeyColumn, database: CustomShellDb) {
  await database
    .update(videoSettings)
    .set({ [column]: null, updatedAt: now() })
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
}

/** The Pexels key B-roll and carousel photos search with. SERVER ONLY. */
export function getPexelsApiKey(database: CustomShellDb = db) {
  return getSavedKey("pexelsApiKey", database)
}
export function getPexelsKeyStatus(database: CustomShellDb = db) {
  return getSavedKeyStatus("pexelsApiKey", database)
}
export function savePexelsApiKey(apiKey: string, database: CustomShellDb = db) {
  return saveSavedKey("pexelsApiKey", apiKey, database)
}
/** Clears the saved key; B-roll then asks for one again. */
export function removePexelsApiKey(database: CustomShellDb = db) {
  return removeSavedKey("pexelsApiKey", database)
}

/** The Sync Labs key that makes lips match a new voice (lip-sync.md). SERVER ONLY. */
export function getSyncApiKey(database: CustomShellDb = db) {
  return getSavedKey("syncApiKey", database)
}
export function getSyncKeyStatus(database: CustomShellDb = db) {
  return getSavedKeyStatus("syncApiKey", database)
}
export function saveSyncApiKey(apiKey: string, database: CustomShellDb = db) {
  return saveSavedKey("syncApiKey", apiKey, database)
}
export function removeSyncApiKey(database: CustomShellDb = db) {
  return removeSavedKey("syncApiKey", database)
}

/** The key Promo made for Video, for Send to Promo (send-to-promo.md). SERVER ONLY. */
export function getPromoApiKey(database: CustomShellDb = db) {
  return getSavedKey("promoApiKey", database)
}
export function getPromoKeyStatus(database: CustomShellDb = db) {
  return getSavedKeyStatus("promoApiKey", database)
}
export function savePromoApiKey(apiKey: string, database: CustomShellDb = db) {
  return saveSavedKey("promoApiKey", apiKey, database)
}
export function removePromoApiKey(database: CustomShellDb = db) {
  return removeSavedKey("promoApiKey", database)
}

/** Promo's address on Settings → Promo, or "". */
export async function getPromoUrl(database: CustomShellDb = db): Promise<string> {
  const [row] = await database
    .select({ url: videoSettings.promoUrl })
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return row?.url ?? ""
}

/** Keeps Promo's address as typed after cleaning; "" clears it. */
export async function savePromoUrl(url: string, database: CustomShellDb = db): Promise<void> {
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({ id: SETTINGS_ROW_ID, promoUrl: url, createdAt: timestamp, updatedAt: timestamp })
    .onConflictDoUpdate({ target: videoSettings.id, set: { promoUrl: url, updatedAt: timestamp } })
}

/**
 * The Wan and Seedance keys (`workspace/docs/wan-and-seedance.md`). Each one
 * is kept scrambled beside the site it came from, because a key works only
 * at that site's address.
 */
const KEY_COLUMNS = {
  wan: { key: "wanApiKey", region: "wanRegion" },
  seedance: { key: "seedanceApiKey", region: "seedanceRegion" },
} as const

const DEFAULT_REGIONS: Record<KeyedCompany, string> = {
  wan: DEFAULT_WAN_REGION,
  seedance: DEFAULT_SEEDANCE_REGION,
}

async function readVideoKeyRow(company: KeyedCompany, database: CustomShellDb) {
  const columns = KEY_COLUMNS[company]
  const [row] = await database
    .select({
      key: videoSettings[columns.key],
      region: videoSettings[columns.region],
    })
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return { key: row?.key ?? null, region: row?.region ?? DEFAULT_REGIONS[company] }
}

/**
 * The company's key and its site, or null when no key is saved. A saved key
 * that can no longer be unscrambled throws. SERVER ONLY: the result is a live
 * secret and must never be returned to the browser.
 */
export async function getVideoKey(
  company: KeyedCompany,
  database: CustomShellDb = db
): Promise<{ apiKey: string; region: string } | null> {
  const row = await readVideoKeyRow(company, database)
  return row.key ? { apiKey: decryptSecret(row.key), region: row.region } : null
}

/**
 * What the AI video tab may know about one key: that it exists, its last
 * four characters and its site, never the key itself. `unreadable` means the
 * server's encryption key changed, and the fix is pasting the key again.
 */
export type VideoKeyStatus = {
  configured: boolean
  maskedKey: string | null
  unreadable: boolean
  region: string
}

export async function getVideoKeyStatus(
  company: KeyedCompany,
  database: CustomShellDb = db
): Promise<VideoKeyStatus> {
  const row = await readVideoKeyRow(company, database)
  if (!row.key) {
    return { configured: false, maskedKey: null, unreadable: false, region: row.region }
  }
  try {
    const key = decryptSecret(row.key)
    return {
      configured: true,
      maskedKey: `••••${key.slice(-4)}`,
      unreadable: false,
      region: row.region,
    }
  } catch {
    return { configured: false, maskedKey: null, unreadable: true, region: row.region }
  }
}

async function writeVideoSettings(
  set: Partial<typeof videoSettings.$inferInsert>,
  database: CustomShellDb
) {
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({ id: SETTINGS_ROW_ID, ...set, createdAt: timestamp, updatedAt: timestamp })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { ...set, updatedAt: timestamp },
    })
}

/** Saves the key encrypted at rest, never as plain text. */
export async function saveVideoKey(
  company: KeyedCompany,
  apiKey: string,
  database: CustomShellDb = db
): Promise<void> {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error("EMPTY_KEY")
  await writeVideoSettings({ [KEY_COLUMNS[company].key]: encryptSecret(trimmed) }, database)
}

/** Clears the saved key; the company's shots then ask for one again. */
export async function removeVideoKey(
  company: KeyedCompany,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(videoSettings)
    .set({ [KEY_COLUMNS[company].key]: null, updatedAt: now() })
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
}

/** Saves which site the key came from. Refuses a site not on the list. */
export async function saveVideoRegion(
  company: KeyedCompany,
  region: string,
  database: CustomShellDb = db
): Promise<void> {
  if (!regionsFor(company).some((item) => item.id === region)) {
    throw new Error("UNKNOWN_REGION")
  }
  await writeVideoSettings({ [KEY_COLUMNS[company].region]: region }, database)
}

/**
 * Saves which company new shots start on, or one company's starting size,
 * length and sound. The other company's starts are kept as they were.
 */
export async function saveVideoModelDefaults(
  change: {
    company?: AiDefaults["videoModel"]
    starts?: Partial<NonNullable<AiDefaults["videoModelDefaults"]>>
  },
  database: CustomShellDb = db
): Promise<AiDefaults> {
  const current = await getAiDefaults(database)
  return saveAiDefaults(
    {
      ...(change.company ? { videoModel: change.company } : {}),
      ...(change.starts
        ? { videoModelDefaults: { ...current.videoModelDefaults, ...change.starts } }
        : {}),
    },
    database
  )
}
