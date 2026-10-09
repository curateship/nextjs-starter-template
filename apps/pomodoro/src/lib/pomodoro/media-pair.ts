import { parseBackgroundReference } from "@/lib/pomodoro/background-catalog"
import {
  findSound,
  findTheme,
  type MediaCatalog,
} from "@/lib/pomodoro/catalog"
import type { AppSettingValue } from "@/lib/pomodoro/app-settings"
import {
  parseMediaPool,
  pickFromPool,
  poolSounds,
  poolThemes,
} from "@/lib/pomodoro/media-pool"
import { parseSoundReference } from "@/lib/pomodoro/sound-catalog"

export type TimerDefaults = AppSettingValue<"timer.newAccount">

/**
 * A room's sound and theme, as the server hands them to a page. See
 * `workspace/docs/personal-room.md`.
 *
 * Every page draws the pair of the room you are in: your personal room, or
 * the hosted room you joined. A guest has no personal room and gets a random
 * free pair on every visit instead.
 *
 * The catalogue rides along, so every page that draws a theme or lists the
 * sounds reads the same list the server read, from the same loader.
 */
export type MediaBootstrap = {
  catalog: MediaCatalog
  /**
   * The admin's default theme today, a season's when one covers today, drawn
   * whenever a pick has gone (a Draft, a deleted item). Null draws Lofi girl.
   */
  fallbackBackground: string | null
  /**
   * The first item of a shuffle or tags choice on the room you are in, picked
   * by the server so the first frame is already right. Null for a single item.
   */
  picks: { sound: string | null; background: string | null }
  /** For a guest: the timer an admin set new accounts to start with. */
  guestTimer: TimerDefaults | null
  /** The personal room's pair. Uploads come with the address the server resolved. */
  personal: {
    sound: string | null
    soundUrl: string | null
    background: string | null
    backgroundUrl: string | null
    backgroundKind: "image" | "video" | null
  }
  /** The hosted room you are in, or null when you are in your own. */
  room: RoomMedia | null
  canUsePremiumMedia: boolean
}

export type RoomMedia = {
  slug: string
  name: string
  role: "host" | "member"
  sound: string | null
  background: string | null
}

/**
 * The first item of a shuffle or tags choice, as a stored value, or null when
 * the choice is one item already or nothing in the group can be played.
 */
export function firstPicks(
  catalog: MediaCatalog,
  sound: string | null,
  background: string | null,
  canUsePremium: boolean,
  random: () => number = Math.random
) {
  const soundPool = parseMediaPool(sound)
  const themePool = parseMediaPool(background)
  const pickedSound = soundPool
    ? pickFromPool(poolSounds(catalog, soundPool, canUsePremium), random)
    : null
  const pickedTheme = themePool
    ? pickFromPool(poolThemes(catalog, themePool, canUsePremium), random)
    : null
  return {
    sound: pickedSound ? `curated:${pickedSound.key}` : null,
    background: pickedTheme ? `scene:${pickedTheme.key}` : null,
  }
}

/** The admin's settings a guest's first frame depends on. */
export type GuestMediaSettings = {
  shuffle: boolean
  /** Today's default pair, a season's when one covers today. */
  defaults: { sound: string | null; background: string | null }
  timer: TimerDefaults | null
}

const NO_GUEST_SETTINGS: GuestMediaSettings = {
  shuffle: false,
  defaults: { sound: null, background: null },
  timer: null,
}

/**
 * A guest's pair for this visit. Never a Pro item and never an upload, since
 * a guest owns neither.
 *
 * - With the admin's shuffle switch on, both are shuffle, and the server picks
 *   the first of each.
 * - Otherwise the admin's default sound and theme, when they are set and Live
 *   and free.
 * - Otherwise one free scene and one free loop at random, as before.
 */
export function guestMediaBootstrap(
  catalog: MediaCatalog,
  random: () => number = Math.random,
  settings: GuestMediaSettings = NO_GUEST_SETTINGS
): MediaBootstrap {
  const scenes = catalog.themes.filter((scene) => !scene.locked)
  const sounds = catalog.sounds.filter((sound) => !sound.locked)
  const usable = (stored: string | null, list: { key: string }[], prefix: string) =>
    stored && list.some((item) => `${prefix}${item.key}` === stored) ? stored : null
  const randomOf = (list: { key: string }[], prefix: string) => {
    const item = list.length
      ? list[Math.floor(random() * list.length) % list.length]
      : null
    return item ? `${prefix}${item.key}` : null
  }
  const sound = settings.shuffle
    ? "shuffle"
    : (usable(settings.defaults.sound, sounds, "curated:") ?? randomOf(sounds, "curated:"))
  const background = settings.shuffle
    ? "shuffle"
    : (usable(settings.defaults.background, scenes, "scene:") ?? randomOf(scenes, "scene:"))
  return {
    catalog,
    fallbackBackground: usable(settings.defaults.background, scenes, "scene:"),
    picks: firstPicks(catalog, sound, background, false, random),
    guestTimer: settings.timer,
    personal: {
      sound,
      soundUrl: null,
      background,
      backgroundUrl: null,
      backgroundKind: null,
    },
    room: null,
    canUsePremiumMedia: false,
  }
}

/**
 * Why a hosted room's pair cannot be saved, or null when it can.
 *
 * A hosted room takes a Live catalogue sound and a Live catalogue scene only.
 * A host's
 * own upload is served from a public address and would be shown to whoever
 * joins, so it is left out until Tyler decides otherwise (rooms task 02,
 * part 9).
 */
export function roomPairProblem(
  catalog: MediaCatalog,
  sound: string | null,
  background: string | null
) {
  if (!sound) return "no_sound" as const
  if (!background) return "no_background" as const
  // Tyler, 8 Oct 2026: a host may shuffle, or pick tags, for the room. Each
  // device in the room then picks for itself.
  if (parseMediaPool(sound) && parseMediaPool(background)) return null
  if (parseMediaPool(sound)) return sceneProblem(catalog, background)
  const soundRef = parseSoundReference(sound)
  if (soundRef?.type !== "curated" || !findSound(catalog, soundRef.key))
    return "bad_sound" as const
  if (parseMediaPool(background)) return null
  return sceneProblem(catalog, background)
}

function sceneProblem(catalog: MediaCatalog, background: string) {
  const sceneRef = parseBackgroundReference(background)
  if (sceneRef?.type !== "scene" || !findTheme(catalog, sceneRef.key))
    return "bad_background" as const
  return null
}

export type RoomPairProblem = NonNullable<ReturnType<typeof roomPairProblem>>

export function roomPairProblemMessage(problem: RoomPairProblem) {
  switch (problem) {
    case "no_sound":
      return "Pick a sound for the room."
    case "no_background":
      return "Pick a theme for the room."
    case "bad_sound":
      return "That sound cannot be used in a room. Pick one from the list."
    case "bad_background":
      return "That theme cannot be used in a room. Pick one from the list."
  }
}

/** Whether either half of a pair is a Pro item. */
export function pairUsesPro(
  catalog: MediaCatalog,
  sound: string | null,
  background: string | null
) {
  const soundRef = parseSoundReference(sound)
  const sceneRef = parseBackgroundReference(background)
  const proSound =
    soundRef?.type === "curated" &&
    findSound(catalog, soundRef.key)?.locked === true
  const proScene =
    sceneRef?.type === "scene" &&
    findTheme(catalog, sceneRef.key)?.locked === true
  return proSound || proScene
}

/** The name a person reads for a stored sound, or null for silence. */
export function soundLabelFor(catalog: MediaCatalog, sound: string | null) {
  const pool = parseMediaPool(sound)
  if (pool)
    return pool.mode === "shuffle" ? "Shuffled sounds" : `${pool.tags.join(", ")} sounds`
  const reference = parseSoundReference(sound)
  if (!reference) return null
  if (reference.type === "media") return "Your audio"
  return findSound(catalog, reference.key)?.label ?? null
}

/** The name a person reads for a stored theme, group or scene, or null. */
export function themeLabelFor(catalog: MediaCatalog, background: string | null) {
  const pool = parseMediaPool(background)
  if (pool)
    return pool.mode === "shuffle" ? "Shuffled themes" : `${pool.tags.join(", ")} themes`
  return sceneFor(catalog, background)?.label ?? null
}

/** The catalogue scene a stored theme names, or null for an upload or nothing. */
export function sceneFor(catalog: MediaCatalog, background: string | null) {
  const reference = parseBackgroundReference(background)
  if (reference?.type !== "scene") return null
  return findTheme(catalog, reference.key)
}
