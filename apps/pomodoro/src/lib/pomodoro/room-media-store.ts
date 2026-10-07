import * as React from "react"

import {
  loadRoomMediaBootstrap,
  savePersonalRoomBackground,
  savePersonalRoomSound,
} from "@/lib/api/pomodoro/personal-room"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import {
  DEFAULT_BACKGROUND,
  parseBackgroundReference,
  sameBackgroundReference,
  serializeBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import {
  guestMediaBootstrap,
  type MediaBootstrap,
  type RoomMedia,
} from "@/lib/pomodoro/media-pair"
import {
  parseSoundReference,
  sameSoundReference,
  serializeSoundReference,
  type SoundReference,
} from "@/lib/pomodoro/sound-catalog"
import { followSound } from "@/lib/pomodoro/sound-engine"

/**
 * Which sound and theme are on screen, as a module-level store. See
 * `workspace/docs/personal-room.md`.
 *
 * Every page draws the pair of the room you are in. That is your personal
 * room, unless you are in somebody's hosted room, and then it is the pair the
 * host picked, for as long as you stay. A room never writes over your
 * personal pair, so leaving puts yours straight back.
 *
 * A guest has no personal room. The page's loader picks a random free pair on
 * every visit, and anything a guest picks lasts until the next one.
 */

type HostedRoom = Omit<RoomMedia, "sound" | "background"> & {
  sound: SoundReference | null
  background: BackgroundReference
}

type Snapshot = {
  personalBackground: BackgroundReference
  personalSound: SoundReference | null
  room: HostedRoom | null
  canUsePremiumMedia: boolean
}

let state: Snapshot = {
  personalBackground: DEFAULT_BACKGROUND,
  personalSound: null,
  room: null,
  canUsePremiumMedia: false,
}
const listeners = new Set<() => void>()
let primed = false
let loading = false

function emit() {
  for (const listener of listeners) listener()
}

/** The sound the player should hold: the hosted room's, or your own. */
function effectiveSound(current: Snapshot) {
  return current.room ? current.room.sound : current.personalSound
}

function setState(next: Partial<Snapshot>, soundChange: "pick" | "room" = "pick") {
  const before = effectiveSound(state)
  state = { ...state, ...next }
  emit()
  const after = effectiveSound(state)
  if (!sameSoundReference(before, after)) followSound(after, soundChange)
}

function hostedRoomFrom(room: RoomMedia): HostedRoom {
  return {
    ...room,
    sound: parseSoundReference(room.sound),
    // A room made before rooms had a pair draws the default scene.
    background: parseBackgroundReference(room.background) ?? DEFAULT_BACKGROUND,
  }
}

/** The store's value for what a loader read. */
function snapshotFrom(bootstrap: MediaBootstrap): Snapshot {
  const { personal } = bootstrap
  const scene = parseBackgroundReference(personal.background)
  const sound = parseSoundReference(personal.sound)
  // An upload the server would not resolve — deleted, still being prepared,
  // or not theirs — falls back to the default scene or to silence rather than
  // leaving a blank screen or a player with nothing to play.
  const background: BackgroundReference | null =
    scene?.type === "media"
      ? personal.backgroundUrl
        ? {
            ...scene,
            mediaUrl: personal.backgroundUrl,
            mediaKind: personal.backgroundKind === "video" ? "video" : "image",
          }
        : null
      : scene
  const personalSound: SoundReference | null =
    sound?.type === "media"
      ? personal.soundUrl
        ? { ...sound, mediaUrl: personal.soundUrl }
        : null
      : sound
  return {
    personalBackground: background ?? DEFAULT_BACKGROUND,
    personalSound,
    room: bootstrap.room ? hostedRoomFrom(bootstrap.room) : null,
    canUsePremiumMedia: bootstrap.canUsePremiumMedia === true,
  }
}

/**
 * Takes the loader's answer in the browser before anything is drawn, so the
 * first frame is already the right pair. Once only: after that the store is
 * the truth, and a choice made on a page is never overwritten by a stale load.
 */
function primeRoomMedia(bootstrap: MediaBootstrap) {
  if (typeof window === "undefined" || primed || loading) return
  state = snapshotFrom(bootstrap)
  primed = true
  followSound(effectiveSound(state), "prime")
}

/**
 * What the page's loader read, for every screen under the product shell. The
 * shell provides it, and every reader below it starts from the same answer.
 */
export const MediaBootstrapContext =
  React.createContext<MediaBootstrap | null>(null)

/**
 * For a page that was drawn without a loader's answer, and after signing in
 * or out: a member's pair is asked for, a guest's is picked at random.
 */
function ensureRoomMedia() {
  if (typeof window === "undefined" || primed || loading) return
  if (!productAuth().known) return
  if (!productAuth().authenticated) {
    setState({ ...snapshotFrom(guestMediaBootstrap()) }, "room")
    primed = true
    return
  }
  loading = true
  void loadRoomMediaBootstrap()
    .then((bootstrap) => {
      primed = true
      setState(snapshotFrom(bootstrap), "room")
    })
    .catch(() => {
      // A failed read keeps drawing what is on screen, and the next page
      // load asks again.
      primed = true
    })
    .finally(() => {
      loading = false
    })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const serverSnapshot: Snapshot = state

/** The hosted room you are now in, from a room snapshot. */
export function enterHostedRoom(room: {
  slug: string
  name: string
  role: "host" | "member"
  sound: string | null
  background: string | null
}) {
  const next = hostedRoomFrom(room)
  const current = state.room
  if (
    current &&
    current.slug === next.slug &&
    current.role === next.role &&
    current.name === next.name &&
    sameSoundReference(current.sound, next.sound) &&
    sameBackgroundReference(current.background, next.background)
  )
    return
  setState({ room: next }, "room")
}

/** Back to your personal room: you left, the room closed, or you were removed. */
export function leaveHostedRoom() {
  if (!state.room) return
  setState({ room: null }, "room")
}

/**
 * Puts a theme in your personal room. Saved for a member; for a guest it
 * lasts until the next visit. Resolves once the save has landed, so the
 * page can say so, and throws the server's refusal otherwise.
 */
export async function addBackgroundToPersonalRoom(reference: BackgroundReference) {
  const previous = state.personalBackground
  setState({ personalBackground: reference })
  if (!productAuth().authenticated) return
  try {
    await savePersonalRoomBackground(serializeBackgroundReference(reference))
  } catch (error) {
    setState({ personalBackground: previous })
    throw error
  }
}

/** Puts a sound in your personal room, or silence for null. The same rules. */
export async function addSoundToPersonalRoom(reference: SoundReference | null) {
  const previous = state.personalSound
  setState({ personalSound: reference })
  if (!productAuth().authenticated) return
  try {
    await savePersonalRoomSound(serializeSoundReference(reference))
  } catch (error) {
    setState({ personalSound: previous })
    throw error
  }
}

/**
 * A theme whose file failed to load. A hosted room's
 * scene is a catalogue picture, so its failure only draws the default here.
 * Your own room's theme falls back to the default and saves that, so a
 * deleted upload cannot leave a black screen on every visit.
 */
export function fallBackToDefaultBackground() {
  if (state.room) {
    if (!sameBackgroundReference(state.room.background, DEFAULT_BACKGROUND))
      setState({ room: { ...state.room, background: DEFAULT_BACKGROUND } }, "room")
    return
  }
  if (sameBackgroundReference(state.personalBackground, DEFAULT_BACKGROUND)) return
  void addBackgroundToPersonalRoom(DEFAULT_BACKGROUND).catch(() => undefined)
}

/**
 * The pair on screen, and the room it belongs to.
 *
 * **The first frame is the right pair, not the default.** The product shell
 * reads it in its loader and hands it down through `MediaBootstrapContext`.
 * The server draws with it, and the browser takes it into the store before
 * its first render, so the two agree and nothing swaps.
 *
 * `seed` is for the product shell itself, which reads the loader directly and
 * sits above the context it provides.
 */
export function useRoomMedia(seed?: MediaBootstrap | null) {
  const fromContext = React.useContext(MediaBootstrapContext)
  const bootstrap = seed ?? fromContext
  // In the browser this happens once, on the very first render, before the
  // store is read below. Repeating it is a no-op.
  if (bootstrap) primeRoomMedia(bootstrap)
  // The server's answer must be the same object on every call, and must come
  // from this request's loader, never from module state shared by requests.
  const serverValue = React.useMemo(
    () => (bootstrap ? snapshotFrom(bootstrap) : serverSnapshot),
    [bootstrap]
  )
  const snapshot = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => serverValue
  )
  React.useEffect(() => {
    ensureRoomMedia()
  }, [])
  return {
    ...snapshot,
    /** What is drawn behind the page: the hosted room's theme, or yours. */
    background: snapshot.room?.background ?? snapshot.personalBackground,
    /** The sound the player holds: the hosted room's, or yours. */
    sound: effectiveSound(snapshot),
    fallBackToDefault: fallBackToDefaultBackground,
  }
}

// Signing in, out, or as somebody else swaps whose pair this is. The first
// time the layout says who is here is not a swap: the loader's answer was
// already for that person, and a guest's random pair must not be re-rolled.
let authKnown = false
if (typeof window !== "undefined")
  subscribeProductAuth(() => {
    const firstAnswer = !authKnown
    authKnown = true
    if (!(firstAnswer && primed)) primed = false
    ensureRoomMedia()
  })
