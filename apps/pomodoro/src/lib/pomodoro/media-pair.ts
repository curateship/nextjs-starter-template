import { parseBackgroundReference } from "@/lib/pomodoro/background-catalog"
import {
  findSound,
  findTheme,
  type MediaCatalog,
} from "@/lib/pomodoro/catalog"
import type { AppSettingValue } from "@/lib/pomodoro/app-settings"
import type { BackdropLook } from "@/lib/pomodoro/backdrop-look"
import {
  NO_OWN_POOL_MEDIA,
  parseMediaPool,
  pickFromPool,
  poolOwnFiles,
  poolSounds,
  poolThemes,
  type OwnPoolMedia,
} from "@/lib/pomodoro/media-pool"
import { parseSoundReference } from "@/lib/pomodoro/sound-catalog"
import type { MediaCredit } from "@/lib/pomodoro/shared-media"

export type TimerDefaults = AppSettingValue<"timer.newAccount">
export type BreakLook = AppSettingValue<"break.look">

const NO_BREAK_LOOK: BreakLook = { background: null, message: "" }

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
  /**
   * The admin's break theme and message (`break.look`). The theme is drawn
   * while the break card is on screen; null keeps everybody's own.
   */
  breakLook: BreakLook
  /**
   * The personal room's pair. Uploads come with the address the server
   * resolved, and someone else's shared file with its credit.
   */
  personal: {
    sound: string | null
    soundUrl: string | null
    /** An upload's own name, for the player. */
    soundName: string | null
    soundCredit: MediaCredit | null
    background: string | null
    backgroundUrl: string | null
    backgroundCredit: MediaCredit | null
    backgroundKind: "image" | "video" | null
  }
  /** The hosted room you are in, or null when you are in your own. */
  room: RoomMedia | null
  canUsePremiumMedia: boolean
  /**
   * The member's own tagged, ready files, which a tags group in the personal
   * room may play beside the catalogue's. Empty for a guest.
   */
  own: OwnPoolMedia
  /** The member's dim and drift; null for a guest, whose live in the browser. */
  look: BackdropLook | null
}

export type RoomMedia = {
  slug: string
  name: string
  role: "host" | "member"
  sound: string | null
  background: string | null
  /**
   * A shared file the room plays, resolved for this viewer (rooms task 04):
   * its address, name and credit. Null when that half is not a file, or the
   * file may no longer play here, which draws the default scene or silence.
   */
  files?: RoomFiles
}

/** One shared file in a hosted room, as one viewer may play it. */
export type RoomFile = {
  url: string
  kind: "image" | "video" | "audio"
  name: string
  /** Null for the viewer's own file. */
  credit: MediaCredit | null
}

export type RoomFiles = { sound: RoomFile | null; background: RoomFile | null }

/**
 * The first item of a shuffle or tags choice, as a stored value, or null when
 * the choice is one item already or nothing in the group can be played. `own`
 * is the member's own files, for their personal room only; a hosted room's
 * group draws from the catalogue alone.
 */
export function firstPicks(
  catalog: MediaCatalog,
  sound: string | null,
  background: string | null,
  canUsePremium: boolean,
  random: () => number = Math.random,
  own: OwnPoolMedia = NO_OWN_POOL_MEDIA
) {
  const soundPool = parseMediaPool(sound)
  const themePool = parseMediaPool(background)
  const pickedSound = soundPool
    ? pickFromPool(
        [
          ...poolSounds(catalog, soundPool, canUsePremium).map((item) => ({
            key: `curated:${item.key}`,
          })),
          ...poolOwnFiles(own.sounds, soundPool).map((file) => ({
            key: `media:${file.mediaId}`,
          })),
        ],
        random
      )
    : null
  const pickedTheme = themePool
    ? pickFromPool(
        [
          ...poolThemes(catalog, themePool, canUsePremium).map((item) => ({
            key: `scene:${item.key}`,
          })),
          ...poolOwnFiles(own.backgrounds, themePool).map((file) => ({
            key: `media:${file.mediaId}`,
          })),
        ],
        random
      )
    : null
  return { sound: pickedSound?.key ?? null, background: pickedTheme?.key ?? null }
}

/** The admin's settings a guest's first frame depends on. */
export type GuestMediaSettings = {
  shuffle: boolean
  /** Today's default pair, a season's when one covers today. */
  defaults: { sound: string | null; background: string | null }
  timer: TimerDefaults | null
  breakLook?: BreakLook
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
    breakLook: freeBreakLook(catalog, settings.breakLook ?? NO_BREAK_LOOK, false),
    personal: {
      sound,
      soundUrl: null,
      soundName: null,
      soundCredit: null,
      background,
      backgroundUrl: null,
      backgroundCredit: null,
      backgroundKind: null,
    },
    room: null,
    canUsePremiumMedia: false,
    own: NO_OWN_POOL_MEDIA,
    look: null,
  }
}

/**
 * The break look as a page may draw it: a theme that has since gone Draft or
 * been deleted is dropped, and so is one made Pro for somebody without Pro.
 */
export function freeBreakLook(
  catalog: MediaCatalog,
  look: BreakLook,
  canUsePremium: boolean
): BreakLook {
  const reference = parseBackgroundReference(look.background)
  const scene = reference?.type === "scene" ? findTheme(catalog, reference.key) : null
  const usable = scene && (canUsePremium || !scene.locked)
  return { background: usable ? look.background : null, message: look.message }
}

/**
 * Why a hosted room's pair cannot be saved, or null when it can.
 *
 * A hosted room takes a Live catalogue sound and scene, a group, or a shared
 * file (`media:<uuid>`, uploads-and-sharing task 04). Which shared files a
 * host may pick is the server's question (`assertRoomFileUsable`): their own
 * shared files and shared files they saved. A file nobody chose to share is
 * never shown to whoever joins.
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
  const soundOk =
    soundRef?.type === "media" ||
    (soundRef?.type === "curated" && Boolean(findSound(catalog, soundRef.key)))
  if (!soundOk) return "bad_sound" as const
  if (parseMediaPool(background)) return null
  return sceneProblem(catalog, background)
}

function sceneProblem(catalog: MediaCatalog, background: string) {
  const sceneRef = parseBackgroundReference(background)
  if (sceneRef?.type === "media") return null
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
  // A room or a preset only ever holds someone's shared file; the name, when
  // a page has it, comes from the room's resolved files instead.
  if (reference.type === "media") return "A shared sound"
  return findSound(catalog, reference.key)?.label ?? null
}

/** The name a person reads for a stored theme, group or scene, or null. */
export function themeLabelFor(catalog: MediaCatalog, background: string | null) {
  const pool = parseMediaPool(background)
  if (pool)
    return pool.mode === "shuffle" ? "Shuffled themes" : `${pool.tags.join(", ")} themes`
  if (parseBackgroundReference(background)?.type === "media") return "A shared background"
  return sceneFor(catalog, background)?.label ?? null
}

/** The catalogue scene a stored theme names, or null for an upload or nothing. */
export function sceneFor(catalog: MediaCatalog, background: string | null) {
  const reference = parseBackgroundReference(background)
  if (reference?.type !== "scene") return null
  return findTheme(catalog, reference.key)
}
