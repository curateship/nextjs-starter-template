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
  resolveBackgroundReference,
  sameBackgroundReference,
  serializeBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { EMPTY_CATALOG, type MediaCatalog } from "@/lib/pomodoro/catalog"
import {
  guestMediaBootstrap,
  type MediaBootstrap,
  type RoomMedia,
} from "@/lib/pomodoro/media-pair"
import {
  parseMediaPool,
  pickFromPool,
  poolSounds,
  poolThemes,
  serializeMediaPool,
  type MediaPool,
} from "@/lib/pomodoro/media-pool"
import {
  parseSoundReference,
  resolveSoundReference,
  sameSoundReference,
  serializeSoundReference,
  type SoundReference,
} from "@/lib/pomodoro/sound-catalog"
import { followSound, onSoundCycleEnding } from "@/lib/pomodoro/sound-engine"

/**
 * Which sound and theme are on screen, as a module-level store. See
 * `workspace/docs/personal-room.md` and `workspace/docs/shuffle-and-tags.md`.
 *
 * Every page draws the pair of the room you are in. That is your personal
 * room, unless you are in somebody's hosted room, and then it is the pair the
 * host picked, for as long as you stay. A room never writes over your
 * personal pair, so leaving puts yours straight back.
 *
 * Either half of a pair can be a group instead of one item: shuffle, or some
 * tags. The store then holds what is playing now as well as the group, and
 * picks the next one from the group when the sound is about to end (Tyler,
 * 8 Oct 2026). Each device picks for itself.
 *
 * A guest has no personal room. The page's loader picks a pair on every visit,
 * and anything a guest picks lasts until the next one.
 */

type Side = {
  /** The item playing or drawn now. */
  sound: SoundReference | null
  background: BackgroundReference
  /** The group it was picked from, when the choice is a group. */
  soundPool: MediaPool | null
  backgroundPool: MediaPool | null
}

type HostedRoom = Omit<RoomMedia, "sound" | "background"> &
  Side & {
    /** The room's stored pair, to tell a real change from a re-read. */
    stored: { sound: string | null; background: string | null }
  }

type Snapshot = {
  /** The Live themes and sounds, as the loader read them. */
  catalog: MediaCatalog
  /** What a gone pick falls back to: the admin's default theme, or Lofi girl. */
  fallbackBackground: BackgroundReference
  personal: Side
  room: HostedRoom | null
  canUsePremiumMedia: boolean
}

const EMPTY_SIDE: Side = {
  sound: null,
  background: DEFAULT_BACKGROUND,
  soundPool: null,
  backgroundPool: null,
}

let state: Snapshot = {
  catalog: EMPTY_CATALOG,
  fallbackBackground: DEFAULT_BACKGROUND,
  personal: EMPTY_SIDE,
  room: null,
  canUsePremiumMedia: false,
}
const listeners = new Set<() => void>()
let primed = false
let loading = false

function emit() {
  for (const listener of listeners) listener()
}

/** The side whose pair is on screen: the hosted room's, or yours. */
function shownSide(current: Snapshot): Side {
  return current.room ?? current.personal
}

function setState(next: Partial<Snapshot>, soundChange: "pick" | "room" = "pick") {
  const before = shownSide(state).sound
  state = { ...state, ...next }
  emit()
  const after = shownSide(state).sound
  if (!sameSoundReference(before, after)) followSound(after, soundChange)
}

type Pick = { catalog: MediaCatalog; canUsePremium: boolean; fallback: BackgroundReference }

/** One sound from a stored choice: the item, or one from its group. */
function soundFrom(
  stored: string | null,
  pick: string | null,
  context: Pick,
  avoidKey: string | null = null
): { sound: SoundReference | null; soundPool: MediaPool | null } {
  const pool = parseMediaPool(stored)
  if (!pool)
    return {
      sound: resolveSoundReference(context.catalog, parseSoundReference(stored)),
      soundPool: null,
    }
  const fromServer = resolveSoundReference(context.catalog, parseSoundReference(pick))
  const item = fromServer
    ? null
    : pickFromPool(poolSounds(context.catalog, pool, context.canUsePremium), Math.random, avoidKey)
  return {
    sound:
      fromServer ??
      (item ? resolveSoundReference(context.catalog, { type: "curated", key: item.key }) : null),
    soundPool: pool,
  }
}

/** One theme from a stored choice: the item, one from its group, or the fallback. */
function backgroundFrom(
  stored: string | null,
  pick: string | null,
  context: Pick,
  avoidKey: string | null = null
): { background: BackgroundReference; backgroundPool: MediaPool | null } {
  const pool = parseMediaPool(stored)
  if (!pool)
    return {
      background:
        resolveBackgroundReference(context.catalog, parseBackgroundReference(stored)) ??
        context.fallback,
      backgroundPool: null,
    }
  const fromServer = resolveBackgroundReference(
    context.catalog,
    parseBackgroundReference(pick)
  )
  const item = fromServer
    ? null
    : pickFromPool(poolThemes(context.catalog, pool, context.canUsePremium), Math.random, avoidKey)
  return {
    background:
      fromServer ??
      (item
        ? resolveBackgroundReference(context.catalog, { type: "scene", key: item.key })
        : null) ??
      context.fallback,
    backgroundPool: pool,
  }
}

/**
 * A hosted room's pair, with files from the catalogue. A room made before
 * rooms had a pair, or one whose scene has since gone Draft or been deleted,
 * draws the fallback scene; a sound that went the same way is silence.
 */
function hostedRoomFrom(
  room: RoomMedia,
  context: Pick,
  picks: { sound: string | null; background: string | null } = { sound: null, background: null }
): HostedRoom {
  return {
    ...room,
    stored: { sound: room.sound, background: room.background },
    ...soundFrom(room.sound, picks.sound, context),
    ...backgroundFrom(room.background, picks.background, context),
  }
}

/** The store's value for what a loader read. */
function snapshotFrom(bootstrap: MediaBootstrap): Snapshot {
  const { personal, catalog } = bootstrap
  const fallback =
    resolveBackgroundReference(
      catalog,
      parseBackgroundReference(bootstrap.fallbackBackground)
    ) ?? DEFAULT_BACKGROUND
  const context: Pick = {
    catalog,
    canUsePremium: bootstrap.canUsePremiumMedia === true,
    fallback,
  }
  // The server's first pick belongs to whichever pair is on screen.
  const personalPicks = bootstrap.room ? { sound: null, background: null } : bootstrap.picks
  const soundSide = soundFrom(personal.sound, personalPicks.sound, context)
  const sceneSide = backgroundFrom(personal.background, personalPicks.background, context)
  // An upload the server would not resolve — deleted, still being prepared,
  // or not theirs — falls back to the default scene or to silence rather than
  // leaving a blank screen or a player with nothing to play.
  const scene = parseBackgroundReference(personal.background)
  const background: BackgroundReference =
    scene?.type === "media"
      ? personal.backgroundUrl
        ? {
            ...scene,
            mediaUrl: personal.backgroundUrl,
            mediaKind: personal.backgroundKind === "video" ? "video" : "image",
          }
        : fallback
      : sceneSide.background
  const sound = parseSoundReference(personal.sound)
  const personalSound: SoundReference | null =
    sound?.type === "media"
      ? personal.soundUrl
        ? { ...sound, mediaUrl: personal.soundUrl }
        : null
      : soundSide.sound
  return {
    catalog,
    fallbackBackground: fallback,
    personal: {
      sound: personalSound,
      soundPool: soundSide.soundPool,
      background,
      backgroundPool: sceneSide.backgroundPool,
    },
    room: bootstrap.room ? hostedRoomFrom(bootstrap.room, context, bootstrap.picks) : null,
    canUsePremiumMedia: context.canUsePremium,
  }
}

function contextNow(): Pick {
  return {
    catalog: state.catalog,
    canUsePremium: state.canUsePremiumMedia,
    fallback: state.fallbackBackground,
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
  followSound(shownSide(state).sound, "prime")
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
    setState({ ...snapshotFrom(guestMediaBootstrap(state.catalog)) }, "room")
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
  const current = state.room
  // The same room re-read keeps what it is playing, group or not, so a room
  // snapshot every few seconds never reshuffles the pair.
  if (
    current &&
    current.slug === room.slug &&
    current.role === room.role &&
    current.name === room.name &&
    current.stored.sound === room.sound &&
    current.stored.background === room.background
  )
    return
  setState({ room: hostedRoomFrom(room, contextNow()) }, "room")
}

/** Back to your personal room: you left, the room closed, or you were removed. */
export function leaveHostedRoom() {
  if (!state.room) return
  setState({ room: null }, "room")
}

function setPersonal(next: Partial<Side>) {
  setState({ personal: { ...state.personal, ...next } })
}

/**
 * Puts a theme in your personal room. Saved for a member; for a guest it
 * lasts until the next visit. Resolves once the save has landed, so the
 * page can say so, and throws the server's refusal otherwise.
 */
export async function addBackgroundToPersonalRoom(reference: BackgroundReference) {
  const previous = state.personal
  setPersonal({ background: reference, backgroundPool: null })
  if (!productAuth().authenticated) return
  try {
    await savePersonalRoomBackground(serializeBackgroundReference(reference))
  } catch (error) {
    setState({ personal: previous })
    throw error
  }
}

/**
 * Puts a sound in your personal room, or silence for null. The same rules.
 * Silence is saved as `none`, so an admin's default for people who never
 * picked does not replace it.
 */
export async function addSoundToPersonalRoom(reference: SoundReference | null) {
  const previous = state.personal
  setPersonal({ sound: reference, soundPool: null })
  if (!productAuth().authenticated) return
  try {
    await savePersonalRoomSound(serializeSoundReference(reference) ?? "none")
  } catch (error) {
    setState({ personal: previous })
    throw error
  }
}

/**
 * Puts a group in your personal room: shuffle, or some tags. Something from
 * it starts at once, and the next one comes when the sound ends.
 */
export async function addSoundPoolToPersonalRoom(pool: MediaPool) {
  const previous = state.personal
  setPersonal(soundFrom(serializeMediaPool(pool), null, contextNow()))
  if (!productAuth().authenticated) return
  try {
    await savePersonalRoomSound(serializeMediaPool(pool))
  } catch (error) {
    setState({ personal: previous })
    throw error
  }
}

export async function addBackgroundPoolToPersonalRoom(pool: MediaPool) {
  const previous = state.personal
  setPersonal(backgroundFrom(serializeMediaPool(pool), null, contextNow()))
  if (!productAuth().authenticated) return
  try {
    await savePersonalRoomBackground(serializeMediaPool(pool))
  } catch (error) {
    setState({ personal: previous })
    throw error
  }
}

/**
 * The next item of every group on screen: a new sound when the sound is a
 * group, a new theme when the theme is, at the same moment. Called when the
 * playing sound is about to end, and by the header's next button.
 */
export function playNextFromPools() {
  const side = shownSide(state)
  if (!side.soundPool && !side.backgroundPool) return
  const context = contextNow()
  const next: Partial<Side> = {}
  if (side.soundPool) {
    const currentKey = side.sound?.type === "curated" ? side.sound.key : null
    Object.assign(
      next,
      soundFrom(serializeMediaPool(side.soundPool), null, context, currentKey)
    )
  }
  if (side.backgroundPool) {
    const currentKey = side.background.type === "scene" ? side.background.key : null
    Object.assign(
      next,
      backgroundFrom(serializeMediaPool(side.backgroundPool), null, context, currentKey)
    )
  }
  if (state.room) setState({ room: { ...state.room, ...next } }, "room")
  else setState({ personal: { ...state.personal, ...next } }, "room")
}

/**
 * The themes the dashboard's arrows step through: the group's when the theme
 * is a group, otherwise every Live theme the plan allows, in the admin's order.
 */
function steppableThemes(side: Side, context: Pick) {
  return side.backgroundPool
    ? poolThemes(context.catalog, side.backgroundPool, context.canUsePremium)
    : context.catalog.themes.filter((theme) => context.canUsePremium || !theme.locked)
}

/**
 * The theme before or after the one on screen, from the dashboard's arrows.
 * Tyler, 9 Oct 2026: "add a hover over back and forth arrow here to change
 * themes". Inside a group the arrows move through the group and the group
 * stays, the same as the header's next button. With one theme picked, the
 * next one is saved as the pick. Never in a hosted room, whose theme is the
 * room's.
 */
export async function stepPersonalBackground(direction: 1 | -1) {
  if (state.room) return
  const context = contextNow()
  const list = steppableThemes(state.personal, context)
  if (!list.length) return
  const current = state.personal.background
  const at = current.type === "scene" ? list.findIndex((theme) => theme.key === current.key) : -1
  const next =
    at === -1
      ? list[direction === 1 ? 0 : list.length - 1]
      : list[(at + direction + list.length) % list.length]
  const reference = resolveBackgroundReference(context.catalog, { type: "scene", key: next.key })
  if (!reference) return
  if (state.personal.backgroundPool) {
    setPersonal({ background: reference })
    return
  }
  await addBackgroundToPersonalRoom(reference)
}

/**
 * A theme whose file failed to load. A hosted room's scene only draws the
 * fallback here. Your own room's theme falls back to the admin's default (or
 * Lofi girl) and saves that, so a deleted upload cannot leave a black screen
 * on every visit. A group keeps its group and just draws the fallback.
 */
export function fallBackToDefaultBackground() {
  // The admin's default itself would not load: Lofi girl, which ships with the
  // app, is the last word.
  const fallback = sameBackgroundReference(shownSide(state).background, state.fallbackBackground)
    ? DEFAULT_BACKGROUND
    : state.fallbackBackground
  if (state.room) {
    if (!sameBackgroundReference(state.room.background, fallback))
      setState({ room: { ...state.room, background: fallback } }, "room")
    return
  }
  if (sameBackgroundReference(state.personal.background, fallback)) return
  if (state.personal.backgroundPool) {
    setPersonal({ background: fallback })
    return
  }
  void addBackgroundToPersonalRoom(fallback).catch(() => undefined)
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
  const shown = shownSide(snapshot)
  return {
    catalog: snapshot.catalog,
    canUsePremiumMedia: snapshot.canUsePremiumMedia,
    room: snapshot.room,
    personalSound: snapshot.personal.sound,
    personalBackground: snapshot.personal.background,
    personalSoundPool: snapshot.personal.soundPool,
    personalBackgroundPool: snapshot.personal.backgroundPool,
    /** What is drawn behind the page: the hosted room's theme, or yours. */
    background: shown.background,
    /** The sound the player holds: the hosted room's, or yours. */
    sound: shown.sound,
    /** The groups on screen, when the pair is shuffle or tags. */
    soundPool: shown.soundPool,
    backgroundPool: shown.backgroundPool,
    fallBackToDefault: fallBackToDefaultBackground,
  }
}

/**
 * The Live themes and sounds, for a page that lists them or names one. It is
 * the list the page's own loader read, so the server and the browser draw the
 * same cards.
 */
export function useMediaCatalog() {
  return useRoomMedia().catalog
}


// Signing in, out, or as somebody else swaps whose pair this is. The first
// time the layout says who is here is not a swap: the loader's answer was
// already for that person, and a guest's random pair must not be re-rolled.
let authKnown = false
if (typeof window !== "undefined") {
  subscribeProductAuth(() => {
    const firstAnswer = !authKnown
    authKnown = true
    if (!(firstAnswer && primed)) primed = false
    ensureRoomMedia()
  })
  // The sound is about to end: the next of each group on screen.
  onSoundCycleEnding(playNextFromPools)
}
