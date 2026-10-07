import {
  curatedBackgrounds,
  parseBackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { curatedSounds, parseSoundReference } from "@/lib/pomodoro/sound-catalog"

/**
 * A room's sound and theme, as the server hands them to a page. See
 * `workspace/docs/personal-room.md`.
 *
 * Every page draws the pair of the room you are in: your personal room, or
 * the hosted room you joined. A guest has no personal room and gets a random
 * free pair on every visit instead.
 */
export type MediaBootstrap = {
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
 * A guest's pair for this visit: one free scene and one free loop, picked
 * at random. Never a Pro item and never an upload, since a guest owns neither.
 */
export function guestMediaBootstrap(random: () => number = Math.random): MediaBootstrap {
  const scenes = curatedBackgrounds.filter((scene) => !scene.locked)
  const sounds = curatedSounds.filter((sound) => !sound.locked)
  const scene = scenes[Math.floor(random() * scenes.length) % scenes.length]
  const sound = sounds[Math.floor(random() * sounds.length) % sounds.length]
  return {
    personal: {
      sound: `curated:${sound.key}`,
      soundUrl: null,
      background: `scene:${scene.key}`,
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
 * A hosted room takes a catalogue sound and a catalogue scene only. A host's
 * own upload is served from a public address and would be shown to whoever
 * joins, so it is left out until Tyler decides otherwise (rooms task 02,
 * part 9).
 */
export function roomPairProblem(sound: string | null, background: string | null) {
  if (!sound) return "no_sound" as const
  if (!background) return "no_background" as const
  if (parseSoundReference(sound)?.type !== "curated") return "bad_sound" as const
  if (parseBackgroundReference(background)?.type !== "scene")
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
export function pairUsesPro(sound: string | null, background: string | null) {
  const soundRef = parseSoundReference(sound)
  const sceneRef = parseBackgroundReference(background)
  const proSound =
    soundRef?.type === "curated" &&
    curatedSounds.some((entry) => entry.key === soundRef.key && entry.locked)
  const proScene =
    sceneRef?.type === "scene" &&
    curatedBackgrounds.some((entry) => entry.key === sceneRef.key && entry.locked)
  return proSound || proScene
}

/** The name a person reads for a stored sound, or null for silence. */
export function soundLabelFor(sound: string | null) {
  const reference = parseSoundReference(sound)
  if (!reference) return null
  if (reference.type === "media") return "Your audio"
  return curatedSounds.find((entry) => entry.key === reference.key)?.label ?? null
}

/** The catalogue scene a stored theme names, or null for an upload or nothing. */
export function sceneFor(background: string | null) {
  const reference = parseBackgroundReference(background)
  if (reference?.type !== "scene") return null
  return curatedBackgrounds.find((entry) => entry.key === reference.key) ?? null
}
