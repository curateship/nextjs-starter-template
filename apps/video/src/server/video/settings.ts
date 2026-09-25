import { eq } from "drizzle-orm"

import { readAiDefaults, type AiDefaults } from "@/lib/video/ai-choices"
import { readVoiceDefaults, type VoiceDefaults } from "@/lib/video/voice"
import {
  createDefaultBrandKit,
  normalizeBrandKit,
  type VideoBrandKit,
} from "@/lib/video/brand-kit"
import { now } from "@/server/auth/security"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db, type CustomShellDb } from "@/server/db"
import { IMAGE_TYPES, storagePathForUrl } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { videoSettings } from "@/server/video/schema"

/**
 * The install's brand kit. One row, id `default`, written the first time
 * somebody saves — until then every reader gets the built-in kit, so the editor
 * has colours and fonts to draw with on a brand new install.
 */

const SETTINGS_ROW_ID = "default"

export async function getVideoBrandKit(
  database: CustomShellDb = db
): Promise<VideoBrandKit> {
  const [row] = await database
    .select()
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return row ? normalizeBrandKit(row.brandKit) : createDefaultBrandKit()
}

/**
 * The media library picture behind the brand kit's logo, whoever uploaded it,
 * or null when the kit has no logo or its address is not a picture in this
 * app's library. A carousel slide can only show a library picture, so this is
 * what lets the logo go on one.
 */
export async function findBrandLogoMedia(database: CustomShellDb = db) {
  const { logoUrl } = await getVideoBrandKit(database)
  const storagePath = logoUrl ? await storagePathForUrl(logoUrl) : null
  if (!storagePath) return null
  const [row] = await database
    .select()
    .from(customShellMedia)
    .where(eq(customShellMedia.storagePath, storagePath))
    .limit(1)
  return row && IMAGE_TYPES.has(row.mimeType) ? row : null
}

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
      brandKit: createDefaultBrandKit(),
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
      brandKit: createDefaultBrandKit(),
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

/** Env var that backs the YouTube key when none is saved in Settings. */
const YOUTUBE_ENV_VAR = "VIDEO_YOUTUBE_API_KEY"

/**
 * The YouTube Data API key the Viral page searches with. A saved key wins over
 * the env var; a saved key that can no longer be unscrambled throws rather
 * than silently falling back. SERVER ONLY — the result is a live secret and
 * must never be returned to the browser.
 */
export async function getYoutubeApiKey(
  database: CustomShellDb = db
): Promise<string | null> {
  const [row] = await database
    .select()
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  if (row?.youtubeApiKey) {
    return decryptSecret(row.youtubeApiKey)
  }
  return process.env[YOUTUBE_ENV_VAR] || null
}

/**
 * What the settings UI may know about the key: that it exists, where it comes
 * from, and its last four characters — never the key itself. `unreadable`
 * means a row exists but the server's encryption key changed, and the fix is
 * pasting the key again.
 */
export type YoutubeKeyStatus = {
  configured: boolean
  maskedKey: string | null
  source: "settings" | "env" | null
  unreadable: boolean
}

export async function getYoutubeKeyStatus(
  database: CustomShellDb = db
): Promise<YoutubeKeyStatus> {
  const [row] = await database
    .select()
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  if (row?.youtubeApiKey) {
    try {
      return {
        configured: true,
        maskedKey: `••••${decryptSecret(row.youtubeApiKey).slice(-4)}`,
        source: "settings",
        unreadable: false,
      }
    } catch {
      return {
        configured: false,
        maskedKey: null,
        source: "settings",
        unreadable: true,
      }
    }
  }
  const envKey = process.env[YOUTUBE_ENV_VAR]
  if (envKey) {
    return {
      configured: true,
      maskedKey: `••••${envKey.slice(-4)}`,
      source: "env",
      unreadable: false,
    }
  }
  return { configured: false, maskedKey: null, source: null, unreadable: false }
}

/**
 * Saves the key encrypted at rest. Throws ENCRYPTION_NOT_CONFIGURED (from
 * `encryptSecret`) rather than ever storing plain text.
 */
export async function saveYoutubeApiKey(
  apiKey: string,
  database: CustomShellDb = db
): Promise<void> {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error("EMPTY_KEY")
  const youtubeApiKey = encryptSecret(trimmed)
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      brandKit: createDefaultBrandKit(),
      youtubeApiKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { youtubeApiKey, updatedAt: timestamp },
    })
}

/** Clears the saved key; searching falls back to the env var, if any. */
export async function removeYoutubeApiKey(
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(videoSettings)
    .set({ youtubeApiKey: null, updatedAt: now() })
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
}

export async function saveVideoBrandKit(
  value: unknown,
  database: CustomShellDb = db
): Promise<VideoBrandKit> {
  const brandKit = normalizeBrandKit(value)
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      brandKit,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { brandKit, updatedAt: timestamp },
    })
  return brandKit
}
