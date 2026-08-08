import { eq } from "drizzle-orm"

import { readAiDefaults, type AiDefaults } from "@/lib/video/ai-choices"
import { readVoiceDefaults, type VoiceDefaults } from "@/lib/video/voice"
import {
  createDefaultBrandKit,
  normalizeBrandKit,
  type VideoBrandKit,
} from "@/lib/video/brand-kit"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
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
