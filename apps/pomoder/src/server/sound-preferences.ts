import { and, eq, isNull, or } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { mediaAssets, userPreferences } from "@/server/schema"
import {
  clampSoundVolume,
  parseSoundReference,
  serializeSoundReference,
} from "@/lib/sound-catalog"

export type SoundPreferencesInput = {
  selectedSound: string | null
  soundVolume: number
  soundMuted: boolean
  completionAlerts: boolean
}

export type SoundPreferences = SoundPreferencesInput

export const defaultSoundPreferences: SoundPreferences = {
  selectedSound: null,
  soundVolume: clampSoundVolume(undefined),
  soundMuted: false,
  completionAlerts: false,
}

// Invalid references and media the user cannot play resolve to null (silence)
// instead of failing the save.
export async function resolveStorableSoundReference(userId: string, value: string | null, database: PomoderDb = db) {
  const reference = parseSoundReference(value)
  if (!reference) return null
  if (reference.type === "curated") return serializeSoundReference(reference)
  const [asset] = await database
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, reference.mediaId),
        or(eq(mediaAssets.ownerUserId, userId), isNull(mediaAssets.ownerUserId)),
        eq(mediaAssets.kind, "audio"),
        eq(mediaAssets.status, "ready")
      )
    )
    .limit(1)
  return asset ? serializeSoundReference(reference) : null
}

export async function applySoundPreferences(userId: string, input: SoundPreferencesInput, database: PomoderDb = db): Promise<SoundPreferences> {
  const values = {
    selectedSound: await resolveStorableSoundReference(userId, input.selectedSound, database),
    soundVolume: clampSoundVolume(input.soundVolume),
    soundMuted: input.soundMuted === true,
    completionAlerts: input.completionAlerts === true,
  }
  const [row] = await database
    .insert(userPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { ...values, updatedAt: new Date() } })
    .returning({
      selectedSound: userPreferences.selectedSound,
      soundVolume: userPreferences.soundVolume,
      soundMuted: userPreferences.soundMuted,
      completionAlerts: userPreferences.completionAlerts,
    })
  return row
}

export async function loadSoundPreferences(userId: string, database: PomoderDb = db): Promise<SoundPreferences> {
  const [row] = await database
    .select({
      selectedSound: userPreferences.selectedSound,
      soundVolume: userPreferences.soundVolume,
      soundMuted: userPreferences.soundMuted,
      completionAlerts: userPreferences.completionAlerts,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  if (!row) return defaultSoundPreferences
  return {
    selectedSound: serializeSoundReference(parseSoundReference(row.selectedSound)),
    soundVolume: clampSoundVolume(row.soundVolume),
    soundMuted: row.soundMuted,
    completionAlerts: row.completionAlerts,
  }
}
