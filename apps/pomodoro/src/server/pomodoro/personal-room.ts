import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  assertUploadUsable,
  resolveUploadUrl,
} from "@/server/pomodoro/media-uploads"
import { findActiveRoomMedia } from "@/server/pomodoro/rooms"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import { pomodoroPersonalRooms } from "@/server/pomodoro/schema"
import { parseBackgroundReference } from "@/lib/pomodoro/background-catalog"
import { findSound, findTheme } from "@/lib/pomodoro/catalog"
import { parseSoundReference } from "@/lib/pomodoro/sound-catalog"
import { defaultPairOn } from "@/lib/pomodoro/app-settings"
import {
  firstPicks,
  freeBreakLook,
  type MediaBootstrap,
} from "@/lib/pomodoro/media-pair"
import { MAX_CHOICE_LENGTH, parseMediaPool, serializeMediaPool } from "@/lib/pomodoro/media-pool"

/**
 * The admin's pair for somebody who has not picked: shuffle when the switch is
 * on, otherwise today's default sound and theme (a season's when one covers
 * today). Today is the server's UTC day, which is near enough for a season
 * measured in weeks.
 */
export async function loadUnsetPair(now = new Date()) {
  const settings = await loadAppSettings()
  const defaults = defaultPairOn(
    settings["media.defaults"],
    settings["media.seasons"],
    now.toISOString().slice(0, 10)
  )
  return {
    shuffle: settings["media.shuffleUnset"],
    defaults,
    timer: settings["timer.newAccount"],
    breakLook: settings["break.look"],
  }
}

/**
 * The personal room: one per account, holding its sound and theme. See
 * `workspace/docs/personal-room.md`.
 *
 * Every account has one. Accounts that existed on 7 Oct 2026 got theirs from
 * migration 0122; any account made after that gets it the first time it is
 * read, here, so nothing in the shell's sign-up has to know about it. There
 * is deliberately no function that deletes or closes one.
 */
export async function loadOrCreatePersonalRoom(
  userId: string,
  database: CustomShellDb = db
) {
  const [existing] = await database
    .select()
    .from(pomodoroPersonalRooms)
    .where(eq(pomodoroPersonalRooms.userId, userId))
    .limit(1)
  if (existing) return existing
  // Two first reads racing each other both insert; the second does nothing
  // and both read back the same row.
  await database
    .insert(pomodoroPersonalRooms)
    .values({ userId })
    .onConflictDoNothing()
  const [created] = await database
    .select()
    .from(pomodoroPersonalRooms)
    .where(eq(pomodoroPersonalRooms.userId, userId))
    .limit(1)
  return created
}

/**
 * Everything a page needs to draw the right pair from its first frame: the
 * personal room's sound and theme, with any upload's address resolved, and
 * the hosted room this account is in, if any.
 */
export async function loadMediaBootstrap(userId: string): Promise<MediaBootstrap> {
  const [personal, room, entitlements, catalog, unset] = await Promise.all([
    loadOrCreatePersonalRoom(userId),
    findActiveRoomMedia(userId),
    loadPomodoroEntitlements(userId),
    loadMediaCatalog(),
    loadUnsetPair(),
  ])
  // Somebody who never picked gets the admin's pair. A member who chose
  // silence saved `none`, which is not "never picked". A default an admin
  // has since made Pro or Draft is left out for anybody who cannot play it.
  const allowed = (stored: string | null, list: { key: string; locked: boolean }[], prefix: string) =>
    stored &&
    list.some((item) => `${prefix}${item.key}` === stored && (entitlements.canUsePremiumMedia || !item.locked))
      ? stored
      : null
  const sound =
    personal.sound ?? (unset.shuffle ? "shuffle" : allowed(unset.defaults.sound, catalog.sounds, "curated:"))
  const background =
    personal.background ??
    (unset.shuffle ? "shuffle" : allowed(unset.defaults.background, catalog.themes, "scene:"))
  const shown = room ?? { sound, background }
  // An upload is served from the bucket, so its address is resolved here. One
  // that is gone, not finished or not theirs comes back with no address, and
  // the page falls back to the default scene or to silence.
  const soundRef = parseSoundReference(personal.sound)
  const sceneRef = parseBackgroundReference(personal.background)
  const [soundUpload, sceneUpload] = await Promise.all([
    soundRef?.type === "media" ? resolveUploadUrl(userId, soundRef.mediaId) : null,
    sceneRef?.type === "media" ? resolveUploadUrl(userId, sceneRef.mediaId) : null,
  ])
  return {
    catalog,
    fallbackBackground: unset.defaults.background,
    picks: firstPicks(
      catalog,
      shown.sound,
      shown.background,
      entitlements.canUsePremiumMedia
    ),
    guestTimer: null,
    breakLook: freeBreakLook(catalog, unset.breakLook, entitlements.canUsePremiumMedia),
    personal: {
      sound,
      soundUrl: soundUpload?.url ?? null,
      background,
      backgroundUrl: sceneUpload?.url ?? null,
      backgroundKind: sceneUpload
        ? sceneUpload.kind === "video"
          ? "video"
          : "image"
        : null,
    },
    room,
    canUsePremiumMedia: entitlements.canUsePremiumMedia,
  }
}

/**
 * Puts a sound in the personal room, or silence for null. A Pro loop on a
 * free account is refused (UPGRADE_REQUIRED:premiumMedia), and an upload has
 * to be this person's own and finished.
 */
export async function savePersonalSound(userId: string, sound: string | null) {
  // Silence is saved as `none`, so it is told apart from never having picked.
  if (sound === null || sound === "none")
    return writePersonalRoom(userId, { sound: "none" })
  const soundPool = parseMediaPool(sound)
  if (soundPool) {
    if (sound.length > MAX_CHOICE_LENGTH) throw new Error("UNKNOWN_SOUND")
    return writePersonalRoom(userId, { sound: serializeMediaPool(soundPool) })
  }
  const reference = parseSoundReference(sound)
  if (!reference) throw new Error("UNKNOWN_SOUND")
  if (reference?.type === "curated") {
    // A Draft or deleted sound is not in the catalogue, so it cannot be picked.
    const entry = findSound(await loadMediaCatalog(), reference.key)
    if (!entry) throw new Error("UNKNOWN_SOUND")
    if (entry.locked) await assertPremiumMedia(userId)
  }
  if (reference?.type === "media")
    await assertUploadUsable(userId, reference.mediaId, "sound")
  return writePersonalRoom(userId, { sound })
}

/**
 * Puts a theme in the personal room, or the default scene for null. The same
 * rules as the sound.
 */
export async function savePersonalBackground(
  userId: string,
  background: string | null
) {
  const backgroundPool = background === null ? null : parseMediaPool(background)
  if (backgroundPool) {
    if (background!.length > MAX_CHOICE_LENGTH) throw new Error("UNKNOWN_BACKGROUND")
    return writePersonalRoom(userId, { background: serializeMediaPool(backgroundPool) })
  }
  const reference = background === null ? null : parseBackgroundReference(background)
  if (background !== null && !reference) throw new Error("UNKNOWN_BACKGROUND")
  if (reference?.type === "scene") {
    const entry = findTheme(await loadMediaCatalog(), reference.key)
    if (!entry) throw new Error("UNKNOWN_BACKGROUND")
    if (entry.locked) await assertPremiumMedia(userId)
  }
  if (reference?.type === "media")
    await assertUploadUsable(userId, reference.mediaId, "background")
  return writePersonalRoom(userId, { background })
}

async function assertPremiumMedia(userId: string) {
  const entitlements = await loadPomodoroEntitlements(userId)
  if (!entitlements.canUsePremiumMedia)
    throw new Error("UPGRADE_REQUIRED:premiumMedia")
}

async function writePersonalRoom(
  userId: string,
  change: { sound: string | null } | { background: string | null }
) {
  await loadOrCreatePersonalRoom(userId)
  const [updated] = await db
    .update(pomodoroPersonalRooms)
    .set({ ...change, updatedAt: new Date() })
    .where(eq(pomodoroPersonalRooms.userId, userId))
    .returning({
      sound: pomodoroPersonalRooms.sound,
      background: pomodoroPersonalRooms.background,
    })
  return updated
}
