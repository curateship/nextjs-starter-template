import * as React from "react"

import {
  readMusicBeats,
  requestCleanSound,
  type BeatsState,
  type CleanSoundState,
} from "@/lib/api/video/sound-tools"
import { beatTimelineTimes } from "@/lib/video/beats"
import {
  cleanSoundKey,
  type VoiceCleanStrength,
} from "@/lib/video/voice-clean"

/**
 * What the editor knows about the two sound tools the background worker
 * makes things for: each cleaned copy of a file's sound, and each music
 * file's beats.
 *
 * One store for the whole editor, outside React, so the preview, the
 * timeline and the inspector all read the same answer and only one of them
 * asks the server. A copy or a set of beats still being made is asked about
 * again every few seconds, the way a waveform is, until it is ready or gives
 * up.
 */

const CLEAN_POLL_MS = 3000
const BEATS_POLL_MS = 5000
// Ten minutes of asking, longer than the worker takes on a long file.
const MAX_POLLS = 200

const listeners = new Set<() => void>()
const cleanStates = new Map<string, CleanSoundState>()
const cleanPolls = new Map<string, number>()
const cleanAsking = new Set<string>()
const beatStates = new Map<string, BeatsState | "none">()
const beatPolls = new Map<string, number>()
let beatsTimer: ReturnType<typeof setTimeout> | null = null
let beatsAsking = false
const TOO_LONG_MESSAGE = "Cleaning the sound is taking too long"

function changed() {
  listeners.forEach((listener) => listener())
}

/** A short text that changes only when what a state says changes. */
function cleanSignature(state: CleanSoundState | undefined) {
  if (!state) return "preparing"
  if (state.status === "ready") return `ready ${state.url}`
  if (state.status === "failed") return `failed ${state.error}`
  return "preparing"
}

function beatsSignature(state: BeatsState | "none" | undefined) {
  if (!state || state === "none") return "none"
  return state.status === "ready" ? `ready ${state.beats.length}` : "preparing"
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Cleaning the sound failed"
}

async function askClean(mediaId: string, strength: VoiceCleanStrength, retry = false) {
  const key = cleanSoundKey(mediaId, strength)
  if (cleanAsking.has(key)) return
  cleanAsking.add(key)
  const before = cleanSignature(cleanStates.get(key))
  try {
    const state = await requestCleanSound(mediaId, strength, retry)
    cleanStates.set(key, state)
  } catch (error) {
    cleanStates.set(key, { status: "failed", error: errorText(error) })
  } finally {
    cleanAsking.delete(key)
  }
  // Still preparing is not news: nothing redraws until the answer changes.
  if (cleanSignature(cleanStates.get(key)) !== before) changed()
  const state = cleanStates.get(key)
  const polls = (cleanPolls.get(key) ?? 0) + 1
  cleanPolls.set(key, polls)
  if (state?.status !== "preparing") return
  if (polls < MAX_POLLS) {
    setTimeout(() => void askClean(mediaId, strength), CLEAN_POLL_MS)
  } else {
    // Given up on, it reads as failed, so the inspector offers Try again
    // rather than spinning for good.
    cleanStates.set(key, { status: "failed", error: TOO_LONG_MESSAGE })
    changed()
  }
}

/** Ask for a copy the first time anything wants it. */
function ensureClean(mediaId: string, strength: VoiceCleanStrength) {
  const key = cleanSoundKey(mediaId, strength)
  if (cleanStates.has(key) || cleanAsking.has(key)) return
  cleanStates.set(key, { status: "preparing" })
  void askClean(mediaId, strength)
}

/** Put a copy that failed back in the worker's queue. */
export function retryCleanSound(mediaId: string, strength: VoiceCleanStrength) {
  const key = cleanSoundKey(mediaId, strength)
  cleanStates.set(key, { status: "preparing" })
  cleanPolls.delete(key)
  changed()
  void askClean(mediaId, strength, true)
}

type CleanClip = { kind: string; mediaId?: string; voiceClean?: VoiceCleanStrength }

/**
 * Where every cleaned copy these clips need stands, keyed by
 * `<media>:<strength>`. Asking for one starts it being made.
 */
export function useCleanSounds(clips: CleanClip[]) {
  const wanted = React.useMemo(() => {
    const keys = new Map<string, [string, VoiceCleanStrength]>()
    for (const clip of clips) {
      if (!clip.voiceClean || !clip.mediaId) continue
      if (clip.kind !== "audio" && clip.kind !== "video") continue
      keys.set(cleanSoundKey(clip.mediaId, clip.voiceClean), [clip.mediaId, clip.voiceClean])
    }
    return keys
  }, [clips])
  React.useEffect(() => {
    for (const [mediaId, strength] of wanted.values()) ensureClean(mediaId, strength)
  }, [wanted])
  // Only these copies' answers, so a clip redraws when its own copy changes
  // and not when somebody else's does.
  const signature = () =>
    [...wanted.keys()].map((key) => cleanSignature(cleanStates.get(key))).join("|")
  const seen = React.useSyncExternalStore(subscribe, signature, signature)
  return React.useMemo(() => {
    void seen
    const states = new Map<string, CleanSoundState>()
    for (const key of wanted.keys()) {
      states.set(key, cleanStates.get(key) ?? { status: "preparing" })
    }
    return states
  }, [wanted, seen])
}

/** One round of asking at a time, however many callers want one. */
function scheduleBeats(delayMs: number) {
  if (beatsTimer || beatsAsking) return
  beatsTimer = setTimeout(() => void askBeats(), delayMs)
}

async function askBeats() {
  beatsTimer = null
  const preparing = [...beatStates.entries()]
    .filter(([, state]) => state !== "none" && state.status === "preparing")
    .map(([mediaId]) => mediaId)
  // A file still not found after ten minutes is given up on: no ticks.
  for (const mediaId of preparing) {
    if ((beatPolls.get(mediaId) ?? 0) >= MAX_POLLS) beatStates.set(mediaId, "none")
  }
  const asking = preparing.filter((mediaId) => beatStates.get(mediaId) !== "none")
  if (!asking.length) return
  beatsAsking = true
  try {
    const found = await readMusicBeats(asking)
    for (const mediaId of asking) {
      beatPolls.set(mediaId, (beatPolls.get(mediaId) ?? 0) + 1)
      beatStates.set(mediaId, found[mediaId] ?? "none")
    }
  } catch {
    // Snapping to beats is a help, not a requirement: a failed read leaves
    // the clips snapping to edges the way they always did.
    for (const mediaId of asking) beatStates.set(mediaId, "none")
  } finally {
    beatsAsking = false
  }
  changed()
  const stillPreparing = [...beatStates.values()].some(
    (state) => state !== "none" && state.status === "preparing"
  )
  if (stillPreparing) scheduleBeats(BEATS_POLL_MS)
}

/**
 * Asks again about a file this editor last heard had no beats: the Music
 * panel calls it when a file is marked as music, so its ticks arrive
 * without a reload.
 */
export function forgetBeats(mediaId: string) {
  if (beatStates.get(mediaId) !== "none") return
  beatStates.set(mediaId, { status: "preparing" })
  beatPolls.delete(mediaId)
  scheduleBeats(0)
}

/**
 * The beats of every sound file on the timeline that is marked as music,
 * keyed by file. A file that is not music, or has no steady beat, has none.
 */
export function useMusicBeats(mediaIds: string[]) {
  const key = [...new Set(mediaIds)].sort().join("|")
  React.useEffect(() => {
    let added = false
    for (const mediaId of key ? key.split("|") : []) {
      if (beatStates.has(mediaId)) continue
      beatStates.set(mediaId, { status: "preparing" })
      added = true
    }
    if (added) scheduleBeats(0)
  }, [key])
  const signature = () =>
    (key ? key.split("|") : []).map((mediaId) => beatsSignature(beatStates.get(mediaId))).join("|")
  const seen = React.useSyncExternalStore(subscribe, signature, signature)
  return React.useMemo(() => {
    void seen
    const beats = new Map<string, number[]>()
    for (const mediaId of key ? key.split("|") : []) {
      const state = beatStates.get(mediaId)
      if (state && state !== "none" && state.status === "ready" && state.beats.length) {
        beats.set(mediaId, state.beats)
      }
    }
    return beats
  }, [key, seen])
}

type BeatClip = {
  id: string
  kind: string
  mediaId?: string
  startMs: number
  durationMs: number
  trimStartMs: number
  speed?: number
}

/**
 * Every beat of every music clip on the timeline, in timeline time, for a
 * dragged clip to snap to. The dragged clip's own beats are left out: they
 * move with it, so they can never be somewhere to land.
 */
export function beatTimesOnTimeline(
  tracks: { clips: BeatClip[] }[],
  excludeClipId: string
) {
  const times: number[] = []
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId || clip.kind !== "audio" || !clip.mediaId) continue
      const state = beatStates.get(clip.mediaId)
      if (!state || state === "none" || state.status !== "ready") continue
      times.push(...beatTimelineTimes(clip, state.beats))
    }
  }
  return times
}
