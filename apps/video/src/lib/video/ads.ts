import { z } from "zod"

import { BROLL_SENTENCE_PAUSE_MS } from "./b-roll"
import { LEFT_OF_CUT, RIGHT_OF_CUT } from "./clip-fades"
import {
  DEFAULT_CLIP_SPEED,
  MAX_CLIP_VOLUME,
  MIN_CLIP_VOLUME,
  clipSpeed,
  sourceMsAt,
  storedPlaybackValue,
} from "./clip-playback"
import {
  SAFE_BOX_ASPECT,
  SAFE_BOX_PLATFORM_IDS,
  placeInSafeBox,
  type SafeBox,
  type SafeBoxes,
} from "./safe-box"
import { SCRIPT_BASE_WORDS_PER_MINUTE } from "./script-check"
import { TEXT_FONT_IDS, DEFAULT_TEXT_FONT_ID } from "./text-fonts"
import { TEXT_STROKE_WIDTH_MAX } from "./text-lines"
import {
  MAX_TIMELINE_TRACKS,
  MAX_TRACK_CLIPS,
  type AdMode,
  type AspectRatio,
  type ProjectTimeline,
} from "./timeline-schema"
import { MIN_CLIP_MS } from "./timeline-utils"

/**
 * Ads on the timeline (`workspace/docs/ads.md`). Everything here is plain
 * arithmetic over the lanes, so the editor, the server and the tests share
 * one answer about where an ad goes and what it pushes along.
 *
 * An ad is a clip with an `ad` mark, on a lane marked `ads` at the top of the
 * timeline. A "pause" ad cuts every lane at its start and pushes the rest of
 * the video later by the ad's length; an "over" ad sits on top while the
 * video keeps running.
 */

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]
type NewId = () => string

/** An ad as laid down, before it has a place or an id of its own. */
export type AdTemplate = Omit<Clip, "id" | "startMs"> & {
  ad: NonNullable<Clip["ad"]>
}

// Tyler, 4 Nov 2026: "First 60s, last 30s".
export const AD_CLEAR_START_MS = 60_000
export const AD_CLEAR_END_MS = 30_000
// Tyler, 4 Nov 2026: "Bottom, 8 seconds".
export const TEXT_AD_MS = 8_000
const TEXT_AD_Y = 0.86
/** The short fade at each end of every ad. */
export const AD_FADE_MS = 500
/** Faster than this and a read sounds rushed, so fitting trims instead. */
export const AD_FIT_MAX_SPEED = 1.2
/** YouTube only takes ad breaks in videos at least this long. */
export const YOUTUBE_AD_BREAK_MIN_MS = 8 * 60_000
export const MAX_ADS_PLACED = 20

export const AD_TOO_SHORT_MESSAGE =
  "This video is too short to keep the first minute and the last 30 seconds clear of ads."
export const AD_NO_ROOM_MESSAGE =
  "The timeline has as many lanes or clips as it can hold, so the ad was not added."
export const AD_TOO_FEW_CURVES_MESSAGE =
  "This project needs at least 2 videos with viewer curves from YouTube. The ads went in equal parts instead."

export const AD_NOT_FOUND_MESSAGE = "That ad is not on your shelf any more."
export const AD_FILE_NOT_FOUND_MESSAGE = "That file is not in your media library."
export const AD_FILE_KIND_MESSAGE = "An ad is a video or a sound file."
export const AD_LOOK_NOT_FOUND_MESSAGE = "That look is not saved any more."
export const AD_SHELF_FULL_MESSAGE = "Your ads shelf holds 200 ads. Take one off first."
export const AD_LOOKS_FULL_MESSAGE = "You can keep 50 text ad looks. Forget one first."
export const AD_VOICE_NOT_YOURS_MESSAGE =
  "A sponsor read is said in a voice you cloned. Pick one of yours, or make one in Sounds, Voices."

/** How long a sponsor read can be. Tyler, 4 Nov 2026: "I pick each time". */
export const AD_READ_SECONDS = [15, 30, 60] as const
export type AdReadSeconds = (typeof AD_READ_SECONDS)[number]
/** The most a "what it is about" box holds. */
export const AD_ABOUT_MAX = 1000

/** How many words a read this long holds, at the pace scripts are checked against. */
export function adReadWords(seconds: AdReadSeconds) {
  return Math.round((seconds * SCRIPT_BASE_WORDS_PER_MINUTE) / 60)
}

// ------------------------------------------------------------- settings ---

/**
 * How many ads a video gets for its length, and when the Ads panel warns that
 * there are too many. Settings → App settings → Ads; Tyler, 4 Nov 2026: "I set
 * them in settings" and "I set it in settings".
 */
export const adRulesSchema = z
  .object({
    noAdsUnderMinutes: z.number().min(0).max(60),
    oneAdUpToMinutes: z.number().min(0).max(240),
    oneEveryMinutes: z.number().min(1).max(60),
    limitPercent: z.number().min(1).max(100),
  })
  .strict()
export type AdRules = z.infer<typeof adRulesSchema>

export const DEFAULT_AD_RULES: AdRules = {
  noAdsUnderMinutes: 1,
  oneAdUpToMinutes: 8,
  oneEveryMinutes: 4,
  limitPercent: 15,
}

/** Saved rules, with anything missing or unreadable taken from the defaults. */
export function readAdRules(value: unknown): AdRules {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const rules = { ...DEFAULT_AD_RULES }
  for (const key of Object.keys(DEFAULT_AD_RULES) as (keyof AdRules)[]) {
    const read = adRulesSchema.shape[key].safeParse(saved[key])
    if (read.success) rules[key] = read.data
  }
  return rules
}

/** How many ads the rules give a video this long. 12 minutes at the defaults is 3. */
export function adCountForLength(lengthMs: number, rules: AdRules) {
  const minutes = lengthMs / 60_000
  if (minutes < rules.noAdsUnderMinutes) return 0
  if (minutes <= rules.oneAdUpToMinutes) return 1
  return Math.min(MAX_ADS_PLACED, Math.max(1, Math.floor(minutes / rules.oneEveryMinutes)))
}

// ---------------------------------------------------------- text ad look ---

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i)

/** How a text ad looks. A saved look is one of these with a name. */
export const textAdLookSchema = z
  .object({
    fontId: z.enum(TEXT_FONT_IDS),
    fontSize: z.number().min(24).max(140),
    color: hexColor,
    /** The block of colour behind the words, or none. */
    boxColor: hexColor.nullable(),
    strokeColor: hexColor,
    strokeWidth: z.number().min(0).max(TEXT_STROKE_WIDTH_MAX),
  })
  .strict()
export type TextAdLook = z.infer<typeof textAdLookSchema>

export const DEFAULT_TEXT_AD_LOOK: TextAdLook = {
  fontId: DEFAULT_TEXT_FONT_ID,
  fontSize: 56,
  color: "#ffffff",
  boxColor: "#000000",
  strokeColor: "#000000",
  strokeWidth: 0,
}

export const TEXT_AD_MAX = 200

/** The look a text ad clip carries now, to save as a named look. */
export function lookOfTextAd(clip: Clip): TextAdLook {
  return {
    fontId: clip.fontId ?? DEFAULT_TEXT_AD_LOOK.fontId,
    fontSize: clip.fontSize ?? DEFAULT_TEXT_AD_LOOK.fontSize,
    color: clip.color ?? DEFAULT_TEXT_AD_LOOK.color,
    boxColor: clip.highlightColor ?? null,
    strokeColor: clip.strokeColor ?? DEFAULT_TEXT_AD_LOOK.strokeColor,
    strokeWidth: clip.strokeWidth ?? 0,
  }
}

/** A look's fields as they sit on a text clip. */
function textAdLookFields(look: TextAdLook) {
  return {
    fontId: look.fontId,
    fontSize: look.fontSize,
    color: look.color,
    highlightColor: look.boxColor ?? undefined,
    strokeColor: look.strokeWidth > 0 ? look.strokeColor : undefined,
    strokeWidth: look.strokeWidth > 0 ? look.strokeWidth : undefined,
  }
}

/**
 * The box a text ad keeps inside on a tall video: the platform the captions
 * are fitted for, or, with none picked, the edges every platform covers, so
 * no platform's buttons sit on it. Nothing on a video that is not tall.
 */
export function textAdSafeBox(
  aspect: AspectRatio,
  platform: keyof SafeBoxes | null,
  boxes: SafeBoxes
): SafeBox | null {
  if (aspect !== SAFE_BOX_ASPECT) return null
  if (platform) return boxes[platform]
  const all = SAFE_BOX_PLATFORM_IDS.map((id) => boxes[id])
  return {
    top: Math.max(...all.map((box) => box.top)),
    bottom: Math.max(...all.map((box) => box.bottom)),
    left: Math.max(...all.map((box) => box.left)),
    right: Math.max(...all.map((box) => box.right)),
  }
}

/** A text ad: words only, along the bottom, for 8 seconds, over the video. */
export function textAdTemplate({
  text,
  look,
  shelfId,
  safeBox,
}: {
  text: string
  look: TextAdLook
  shelfId?: string
  safeBox: SafeBox | null
}): AdTemplate {
  const words = text.trim().slice(0, TEXT_AD_MAX)
  const place = safeBox
    ? placeInSafeBox(
        {
          text: words,
          fontId: look.fontId,
          fontSize: look.fontSize,
          boxed: look.boxColor !== null,
          strokeWidth: look.strokeWidth,
          y: TEXT_AD_Y,
        },
        safeBox
      )
    : { x: 0.5, y: TEXT_AD_Y }
  return {
    kind: "text",
    name: words,
    text: words,
    durationMs: TEXT_AD_MS,
    trimStartMs: 0,
    ...textAdLookFields(look),
    ...place,
    pictureFadeInMs: AD_FADE_MS,
    pictureFadeOutMs: AD_FADE_MS,
    ad: { mode: "over", ...(shelfId ? { shelfId } : {}) },
  }
}

/** A sponsor clip, or a read's sound, as an ad. It starts on "Your video pauses". */
export function clipAdTemplate({
  shelfId,
  name,
  mediaId,
  url,
  fileType,
  durationMs,
  mode = "pause",
  volume,
}: {
  shelfId: string
  name: string
  mediaId: string
  url: string
  fileType: "video" | "audio"
  durationMs: number
  mode?: AdMode
  /** From matchedVolume; absent plays it as recorded. */
  volume?: number
}): AdTemplate {
  return {
    kind: fileType,
    name,
    mediaId,
    url,
    durationMs,
    sourceDurationMs: durationMs,
    trimStartMs: 0,
    fadeInMs: AD_FADE_MS,
    fadeOutMs: AD_FADE_MS,
    ...(fileType === "video"
      ? { pictureFadeInMs: AD_FADE_MS, pictureFadeOutMs: AD_FADE_MS }
      : {}),
    ...(volume !== undefined && volume < MAX_CLIP_VOLUME ? { volume } : {}),
    ad: { mode, shelfId },
  }
}

// ---------------------------------------------------------------- lanes ---

export function isAd(clip: Clip): clip is Clip & { ad: NonNullable<Clip["ad"]> } {
  return clip.ad !== undefined
}

/** Every ad on the timeline, earliest first. */
export function adsOf(tracks: Track[]) {
  return tracks
    .flatMap((track) => track.clips.filter(isAd).map((clip) => ({ clip, track })))
    .sort((a, b) => a.clip.startMs - b.clip.startMs)
}

/** Where the last clip that is not an ad ends: the video's own length, pauses included. */
export function videoEndMs(tracks: Track[]) {
  let end = 0
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!isAd(clip)) end = Math.max(end, clip.startMs + clip.durationMs)
    }
  }
  return end
}

function timelineEndMs(tracks: Track[]) {
  let end = 0
  for (const track of tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.startMs + clip.durationMs)
  }
  return end
}

function sortClips(clips: Clip[]) {
  return [...clips].sort((a, b) => a.startMs - b.startMs)
}

function fitsAt(track: Track, startMs: number, durationMs: number) {
  const end = startMs + durationMs
  return track.clips.every(
    (clip) => end <= clip.startMs || startMs >= clip.startMs + clip.durationMs
  )
}

/**
 * The ad on an Ads lane at the top, the first one with room. With none free
 * a new Ads lane goes on top, so ads always cover the video. Null when the
 * timeline already holds as many lanes as a save allows.
 */
function putOnAdsLane(tracks: Track[], clip: Clip, newId: NewId): Track[] | null {
  const lane = tracks.find(
    (track) => track.ads && fitsAt(track, clip.startMs, clip.durationMs)
  )
  if (lane) {
    if (lane.clips.length >= MAX_TRACK_CLIPS) return null
    return tracks.map((track) =>
      track === lane ? { ...track, clips: sortClips([...track.clips, clip]) } : track
    )
  }
  if (tracks.length >= MAX_TIMELINE_TRACKS) return null
  return [{ id: newId(), muted: false, ads: true, clips: [clip] }, ...tracks]
}

// ---------------------------------------------------------------- ripple ---

/** The right-hand piece of a clip cut `offsetMs` in, starting at `startMs`. */
function rightPiece(clip: Clip, offsetMs: number, startMs: number, newId: NewId): Clip {
  return {
    ...clip,
    ...RIGHT_OF_CUT,
    id: newId(),
    startMs,
    durationMs: clip.durationMs - offsetMs,
    trimStartMs: sourceMsAt(clip, offsetMs),
    transition: undefined,
    pressFor: undefined,
    // A voice line cut in two is no longer the line the AI read.
    origin: clip.kind === "audio" ? undefined : clip.origin,
    wordTimes: clip.wordTimes
      ?.filter((word) => word.endMs > offsetMs)
      .map((word) => ({
        startMs: Math.max(0, word.startMs - offsetMs),
        endMs: word.endMs - offsetMs,
      })),
  }
}

/**
 * Room for a pause ad: every lane is cut at `atMs` and everything from there
 * on moves `gapMs` later. A clip that runs across `atMs` is split there, the
 * right piece carrying on from the same moment of its recording. An ad that
 * runs across it is never split, because half an ad is two ads; it stays
 * where it is. Null when a lane would pass the most clips a save allows.
 */
function rippleInsert(
  tracks: Track[],
  atMs: number,
  gapMs: number,
  newId: NewId
): Track[] | null {
  let tooMany = false
  const next = tracks.map((track) => {
    const clips = track.clips.flatMap((clip): Clip[] => {
      const end = clip.startMs + clip.durationMs
      if (end <= atMs) return [clip]
      if (clip.startMs >= atMs) return [{ ...clip, startMs: clip.startMs + gapMs }]
      if (isAd(clip)) return [clip]
      const offset = atMs - clip.startMs
      // A piece too short to keep: the clip moves whole, or stops at the cut.
      if (offset < MIN_CLIP_MS) return [{ ...clip, startMs: clip.startMs + gapMs }]
      if (end - atMs < MIN_CLIP_MS) return [{ ...clip, ...LEFT_OF_CUT, durationMs: offset }]
      return [
        { ...clip, ...LEFT_OF_CUT, durationMs: offset },
        rightPiece(clip, offset, atMs + gapMs, newId),
      ]
    })
    if (clips.length > MAX_TRACK_CLIPS) tooMany = true
    return clips.length === track.clips.length && clips.every((clip, i) => clip === track.clips[i])
      ? track
      : { ...track, clips: sortClips(clips) }
  })
  return tooMany ? null : next
}

const JOIN_IGNORED = new Set([
  "id",
  "startMs",
  "durationMs",
  "trimStartMs",
  "fadeInMs",
  "fadeOutMs",
  "pictureFadeInMs",
  "pictureFadeOutMs",
  "transition",
  "wordTimes",
  "origin",
  "pressFor",
])

function sameApartFromPlace(a: Clip, b: Clip) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JOIN_IGNORED.has(key)) continue
    const left = a[key as keyof Clip]
    const right = b[key as keyof Clip]
    if (JSON.stringify(left) !== JSON.stringify(right)) return false
  }
  if (a.kind === "video" || a.kind === "audio") {
    const carriesOn = a.trimStartMs + a.durationMs * clipSpeed(a)
    if (Math.abs(b.trimStartMs - carriesOn) > 2) return false
  }
  return true
}

/**
 * The two pieces a pause ad cut, put back into one clip once the ad has gone,
 * so placing ads again and again never leaves the video in splinters.
 */
function joinAt(track: Track, atMs: number): Track {
  const clips = sortClips(track.clips)
  const left = clips.find((clip) => Math.abs(clip.startMs + clip.durationMs - atMs) < 2)
  const right = clips.find((clip) => Math.abs(clip.startMs - atMs) < 2)
  if (!left || !right || left === right || !sameApartFromPlace(left, right)) return track
  const joined: Clip = {
    ...left,
    durationMs: left.durationMs + right.durationMs,
    fadeOutMs: right.fadeOutMs,
    pictureFadeOutMs: right.pictureFadeOutMs,
  }
  return {
    ...track,
    clips: clips.filter((clip) => clip !== right).map((clip) => (clip === left ? joined : clip)),
  }
}

const defaultId: NewId = () => globalThis.crypto.randomUUID()

/**
 * The opposite of rippleInsert: the stretch from `atMs` to `atMs + gapMs`
 * comes out of every lane and the rest moves back. A clip laid across that
 * stretch since, such as music, loses the part inside it, so nothing ends up
 * on top of anything else. A clip wholly inside it moves to `atMs`, and an ad
 * running across it stays as it is. The two pieces a pause ad cut join again.
 */
function rippleClose(
  tracks: Track[],
  atMs: number,
  gapMs: number,
  newId: NewId = defaultId
): Track[] {
  const gapEnd = atMs + gapMs
  return tracks.map((track) => {
    if (!track.clips.some((clip) => clip.startMs + clip.durationMs > atMs)) return track
    const clips = track.clips.flatMap((clip): Clip[] => {
      const start = clip.startMs
      const end = start + clip.durationMs
      if (end <= atMs) return [clip]
      if (start >= gapEnd) return [{ ...clip, startMs: start - gapMs }]
      if (isAd(clip)) return [clip]
      if (start < atMs) {
        const left: Clip = { ...clip, ...LEFT_OF_CUT, durationMs: atMs - start }
        return end <= gapEnd ? [left] : [left, rightPiece(clip, gapEnd - start, atMs, newId)]
      }
      if (end <= gapEnd) return [{ ...clip, startMs: atMs }]
      return [{ ...rightPiece(clip, gapEnd - start, atMs, newId), id: clip.id }]
    })
    return joinAt({ ...track, clips: sortClips(clips) }, atMs)
  })
}

/**
 * Clips laid after the ads were placed, such as a language copy's new voice
 * and its captions, made to pause at every pause ad the way the rest of the
 * video does: split where an ad starts, the rest carried on after it.
 */
export function pauseAtAds(tracks: Track[], clipIds: ReadonlySet<string>, newId: NewId): Track[] {
  const moving = new Set(clipIds)
  const pauses = adsOf(tracks)
    .filter(({ clip }) => clip.ad.mode === "pause")
    .map(({ clip }) => ({ atMs: clip.startMs, gapMs: clip.durationMs }))
  let current = tracks
  for (const { atMs, gapMs } of pauses) {
    current = current.map((track) => {
      if (!track.clips.some((clip) => moving.has(clip.id))) return track
      const clips = track.clips.flatMap((clip): Clip[] => {
        if (!moving.has(clip.id)) return [clip]
        const end = clip.startMs + clip.durationMs
        if (end <= atMs) return [clip]
        if (clip.startMs >= atMs) return [{ ...clip, startMs: clip.startMs + gapMs }]
        const offset = atMs - clip.startMs
        const right = rightPiece(clip, offset, atMs + gapMs, newId)
        moving.add(right.id)
        return [{ ...clip, ...LEFT_OF_CUT, durationMs: offset }, right]
      })
      return { ...track, clips: sortClips(clips) }
    })
  }
  return current
}

// ------------------------------------------------------- laying an ad -----

/**
 * One ad at `atMs`: a pause ad first makes room, then the ad goes on the Ads
 * lane. Returns the lanes and the ad's id, or why it could not go.
 */
export function layAd(
  tracks: Track[],
  template: AdTemplate,
  atMs: number,
  newId: NewId,
  id = newId()
): { tracks: Track[]; clipId: string } | { refusal: string } {
  const startMs = Math.max(0, Math.round(atMs))
  const clip: Clip = { ...template, id, startMs }
  const made =
    template.ad.mode === "pause"
      ? rippleInsert(tracks, startMs, clip.durationMs, newId)
      : tracks
  const laid = made && putOnAdsLane(made, clip, newId)
  return laid ? { tracks: laid, clipId: id } : { refusal: AD_NO_ROOM_MESSAGE }
}

/** Takes one ad off, closing the gap a pause ad made. */
export function removeAd(tracks: Track[], clipId: string): Track[] {
  const found = adsOf(tracks).find(({ clip }) => clip.id === clipId)
  if (!found) return tracks
  const without = tracks
    .map((track) =>
      track === found.track
        ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }
        : track
    )
    // An Ads lane left empty goes too.
    .filter((track) => !track.ads || track.clips.length > 0)
  return found.clip.ad.mode === "pause"
    ? rippleClose(without, found.clip.startMs, found.clip.durationMs)
    : without
}

/** Every ad off at once. */
export function removeAllAds(tracks: Track[]): Track[] {
  return adsOf(tracks)
    .reverse()
    .reduce((current, { clip }) => removeAd(current, clip.id), tracks)
}

/**
 * The same ad, changed and laid again where it was: a new mode, a new length,
 * a new speed or a new file. A pause ad's gap closes and opens again at the
 * new length, so the video after it moves with it.
 */
export function changeAd(
  tracks: Track[],
  clipId: string,
  change: (clip: Clip & { ad: NonNullable<Clip["ad"]> }) => Partial<Clip>,
  newId: NewId
): Track[] | { refusal: string } {
  const found = adsOf(tracks).find(({ clip }) => clip.id === clipId)
  if (!found) return tracks
  const { id, startMs, ...rest } = found.clip
  const template = { ...rest, ...change(found.clip) } as AdTemplate
  const laid = layAd(removeAd(tracks, clipId), template, startMs, newId, id)
  return "refusal" in laid ? laid : laid.tracks
}

/**
 * An ad dragged to `toMs` by hand. It is no longer one Place ads looks after,
 * so later edits leave it where it was put.
 */
export function moveAd(
  tracks: Track[],
  clipId: string,
  toMs: number,
  newId: NewId
): Track[] | { refusal: string } {
  const found = adsOf(tracks).find(({ clip }) => clip.id === clipId)
  if (!found) return tracks
  const { clip } = found
  // With a pause ad's gap closed, everything after it is earlier by its
  // length. A spot inside the ad's own gap has no video under it, so it means
  // the cut the ad already sits at.
  const end = clip.startMs + clip.durationMs
  const target =
    clip.ad.mode !== "pause" || toMs <= clip.startMs
      ? toMs
      : toMs >= end
        ? toMs - clip.durationMs
        : clip.startMs
  const { id, startMs: _from, ...rest } = clip
  const template = { ...rest, ad: { ...clip.ad, auto: undefined } } as AdTemplate
  const laid = layAd(removeAd(tracks, clipId), template, target, newId, id)
  return "refusal" in laid ? laid : laid.tracks
}

// ------------------------------------------------------ where they go -----

type Span = { startMs: number; endMs: number }

/**
 * When someone is speaking: each word of the captions on the timeline, or
 * the whole caption where it has no word times.
 */
export function speechSpans(tracks: Track[]): Span[] {
  const spans: Span[] = []
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "text" || isAd(clip)) continue
      if (clip.wordTimes?.length) {
        for (const word of clip.wordTimes) {
          spans.push({ startMs: clip.startMs + word.startMs, endMs: clip.startMs + word.endMs })
        }
      } else if (clip.spokenBy) {
        spans.push({ startMs: clip.startMs, endMs: clip.startMs + clip.durationMs })
      }
    }
  }
  return spans.sort((a, b) => a.startMs - b.startMs)
}

/** The middle of every gap in the speech long enough to be a pause between sentences. */
function speechPauses(spans: Span[]): number[] {
  const pauses: number[] = []
  let speakingUntil: number | null = null
  for (const span of spans) {
    if (speakingUntil !== null && span.startMs - speakingUntil >= BROLL_SENTENCE_PAUSE_MS) {
      pauses.push(Math.round((speakingUntil + span.startMs) / 2))
    }
    speakingUntil = Math.max(speakingUntil ?? 0, span.endMs)
  }
  return pauses
}

/** Equal parts: 3 ads in 12 minutes are at 3:00, 6:00 and 9:00. */
function equalSpots(lengthMs: number, count: number) {
  return Array.from({ length: count }, (_, index) => (lengthMs * (index + 1)) / (count + 1))
}

/**
 * Where `count` ads go in a video `lengthMs` long. The first minute and the
 * last 30 seconds stay clear; each spot then moves to the nearest pause
 * between sentences within half a part of it, or at least out of the word it
 * fell in. `wanted` replaces equal parts with spots of the caller's own.
 */
export function adSpots({
  lengthMs,
  count,
  spans,
  wanted,
  clearStartMs = AD_CLEAR_START_MS,
  clearEndMs = AD_CLEAR_END_MS,
}: {
  lengthMs: number
  count: number
  spans: Span[]
  wanted?: number[]
  clearStartMs?: number
  clearEndMs?: number
}): number[] | { refusal: string } {
  if (count < 1) return []
  const lo = clearStartMs
  const hi = lengthMs - clearEndMs
  if (hi <= lo) return { refusal: AD_TOO_SHORT_MESSAGE }
  let spots = wanted ?? equalSpots(lengthMs, count)
  if (spots.some((spot) => spot < lo || spot > hi)) {
    spots = equalSpots(hi - lo, count).map((spot) => lo + spot)
  }
  const pauses = speechPauses(spans).filter((pause) => pause >= lo && pause <= hi)
  const reach = lengthMs / (count + 1) / 2
  const used = new Set<number>()
  return spots
    .map((spot) => {
      const nearest = pauses
        .filter((pause) => !used.has(pause) && Math.abs(pause - spot) <= reach)
        .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))[0]
      if (nearest !== undefined) {
        used.add(nearest)
        return nearest
      }
      const inWord = spans.find((span) => span.startMs < spot && span.endMs > spot)
      if (!inWord) return Math.round(spot)
      // Out of the word, but never into the clear ends.
      const after = inWord.endMs
      const before = inWord.startMs
      return after <= hi ? after : before >= lo ? before : Math.round(spot)
    })
    // One talk with no gap can send two spots to the same word's end; the
    // second keeps its own spot instead.
    .map((spot, index, all) => (all.indexOf(spot) === index ? spot : Math.round(spots[index])))
    .sort((a, b) => a - b)
}

/**
 * Spots where people usually keep watching: the viewer curves of the
 * project's other videos, averaged along the video, highest first, kept at
 * least half a part apart and outside the clear ends. Null with fewer than 2
 * curves, which is too little to go on.
 */
export function viewerSpots({
  curves,
  lengthMs,
  count,
  clearStartMs = AD_CLEAR_START_MS,
  clearEndMs = AD_CLEAR_END_MS,
}: {
  /** Each curve is points of how far into the video (0 to 1) and how many were watching (0 to 1). */
  curves: { ratio: number; watch: number }[][]
  lengthMs: number
  count: number
  clearStartMs?: number
  clearEndMs?: number
}): number[] | null {
  const usable = curves.filter((curve) => curve.length >= 2)
  if (usable.length < 2 || count < 1) return null
  const steps = 100
  const lo = clearStartMs / lengthMs
  const hi = (lengthMs - clearEndMs) / lengthMs
  if (hi <= lo) return null
  const at = (curve: { ratio: number; watch: number }[], ratio: number) => {
    const sorted = [...curve].sort((a, b) => a.ratio - b.ratio)
    const after = sorted.findIndex((point) => point.ratio >= ratio)
    if (after <= 0) return sorted[after === -1 ? sorted.length - 1 : 0].watch
    const a = sorted[after - 1]
    const b = sorted[after]
    const share = b.ratio === a.ratio ? 0 : (ratio - a.ratio) / (b.ratio - a.ratio)
    return a.watch + (b.watch - a.watch) * share
  }
  const candidates = Array.from({ length: steps + 1 }, (_, index) => index / steps)
    .filter((ratio) => ratio >= lo && ratio <= hi)
    .map((ratio) => ({
      ratio,
      watch: usable.reduce((total, curve) => total + at(curve, ratio), 0) / usable.length,
    }))
    .sort((a, b) => b.watch - a.watch || a.ratio - b.ratio)
  const apart = 1 / (count + 1) / 2
  const picked: number[] = []
  for (const candidate of candidates) {
    if (picked.every((ratio) => Math.abs(ratio - candidate.ratio) >= apart)) {
      picked.push(candidate.ratio)
    }
    if (picked.length === count) break
  }
  return picked.map((ratio) => Math.round(ratio * lengthMs)).sort((a, b) => a - b)
}

/** The ads Place ads put down, earliest first. */
function autoAds(tracks: Track[]) {
  return adsOf(tracks).filter(({ clip }) => clip.ad.auto)
}

/** Every placed ad taken off, gaps closed, so what is left is the video and any ad put by hand. */
function withoutAutoAds(tracks: Track[]) {
  return autoAds(tracks)
    .reverse()
    .reduce((current, { clip }) => removeAd(current, clip.id), tracks)
}

/** The video's length without the ads Place ads put down: what the next Place ads splits up. */
export function lengthForPlacing(tracks: Track[]) {
  return videoEndMs(withoutAutoAds(tracks))
}

/** Lays ads at spots measured on `base`, the latest first so no spot moves. */
function layAll(
  base: Track[],
  placed: { template: AdTemplate; atMs: number; id?: string }[],
  newId: NewId
): Track[] | { refusal: string } {
  let tracks = base
  for (const { template, atMs, id } of [...placed].sort((a, b) => b.atMs - a.atMs)) {
    const laid = layAd(tracks, template, atMs, newId, id ?? newId())
    if ("refusal" in laid) return laid
    tracks = laid.tracks
  }
  return tracks
}

/**
 * Place ads: `count` copies of the ad, in equal parts (or at `wanted`), kept
 * out of the clear ends and moved to pauses. Ads placed before are taken off
 * first, so pressing it again lays a fresh set; ads put by hand stay.
 */
export function placeAds(
  tracks: Track[],
  template: AdTemplate,
  count: number,
  newId: NewId,
  wanted?: number[]
): Track[] | { refusal: string } {
  const base = withoutAutoAds(tracks)
  const spots = adSpots({
    lengthMs: videoEndMs(base),
    count: Math.min(count, MAX_ADS_PLACED),
    spans: speechSpans(base),
    wanted,
  })
  if (!Array.isArray(spots)) return spots
  const auto: AdTemplate = { ...template, ad: { ...template.ad, auto: true } }
  return layAll(base, spots.map((atMs) => ({ template: auto, atMs })), newId)
}

/** An ad at the very start or the very end, on purpose, past the clear ends. */
export function placeAdAtEdge(
  tracks: Track[],
  template: AdTemplate,
  edge: "start" | "end",
  newId: NewId
) {
  return layAd(tracks, template, edge === "start" ? 0 : videoEndMs(tracks), newId)
}

/**
 * After an edit that made the video longer or shorter, the placed ads move
 * so each sits at the same share of the way through, still at a pause and
 * outside the clear ends. Ads moved by hand, and a locked Ads lane, stay put.
 */
export function respaceAds(before: Track[], after: Track[], newId: NewId): Track[] {
  const placed = autoAds(after)
  if (!placed.length || placed.some(({ track }) => track.locked)) return after
  const oldLength = videoEndMs(withoutAutoAds(before))
  const base = withoutAutoAds(after)
  const newLength = videoEndMs(base)
  if (!oldLength || Math.abs(oldLength - newLength) < 1) return after
  // Where each ad sits in the video without the placed ads' own gaps.
  let gapsBefore = 0
  const shares = placed.map(({ clip }) => {
    const share = (clip.startMs - gapsBefore) / oldLength
    if (clip.ad.mode === "pause") gapsBefore += clip.durationMs
    return share
  })
  const spots = adSpots({
    lengthMs: newLength,
    count: placed.length,
    spans: speechSpans(base),
    wanted: shares.map((share) => share * newLength),
  })
  if (!Array.isArray(spots)) return after
  const relaid = layAll(
    base,
    // Each ad keeps its id, so a picked ad stays picked.
    placed.map(({ clip }, index) => {
      const { id, startMs: _start, ...template } = clip
      return { template: template as AdTemplate, atMs: spots[index], id }
    }),
    newId
  )
  return Array.isArray(relaid) ? relaid : after
}

/** Every ad from one shelf ad becomes another, in its place and mode. */
export function swapAds(
  tracks: Track[],
  fromShelfId: string,
  to: AdTemplate,
  newId: NewId
): Track[] | { refusal: string } {
  let current = tracks
  for (const { clip } of adsOf(tracks).reverse()) {
    if (clip.ad.shelfId !== fromShelfId) continue
    const changed = changeAd(
      current,
      clip.id,
      (old) => ({
        ...Object.fromEntries(Object.keys(old).map((key) => [key, undefined])),
        ...to,
        // A text ad always sits over the video; a clip keeps its mode.
        ad: { ...to.ad, mode: to.kind === "text" ? "over" : old.ad.mode, auto: old.ad.auto },
      }),
      newId
    )
    if (!Array.isArray(changed)) return changed
    current = changed
  }
  return current
}

// -------------------------------------------------------------- length ---

/**
 * An ad fitted to `targetMs`: sped up, never past 1.2 times, and trimmed at
 * the end for whatever is still over. A 33 second ad fits 30 seconds by speed
 * alone. A text ad just runs for that long.
 */
export function fitAdToLength(clip: Clip, targetMs: number): Partial<Clip> {
  const target = Math.max(MIN_CLIP_MS, Math.round(targetMs))
  if (clip.kind !== "video" && clip.kind !== "audio") return { durationMs: target }
  // The recording from where the clip starts in it to its end, at normal speed.
  const recordingMs =
    (clip.sourceDurationMs ?? clip.trimStartMs + clip.durationMs * clipSpeed(clip)) -
    clip.trimStartMs
  const speed = Math.min(AD_FIT_MAX_SPEED, Math.max(DEFAULT_CLIP_SPEED, recordingMs / target))
  return {
    speed: storedPlaybackValue(Math.round(speed * 1000) / 1000, DEFAULT_CLIP_SPEED),
    durationMs: Math.round(Math.min(target, recordingMs / speed)),
  }
}

/**
 * How loud an ad plays so it matches the voice in the video: an ad measured
 * louder than the voice is turned down by the difference. A quieter one stays
 * as it is, because a clip can only be turned down.
 */
export function matchedVolume(adLufs: number | null, voiceLufs: number | null) {
  if (adLufs === null || voiceLufs === null || adLufs <= voiceLufs) return undefined
  const gain = Math.pow(10, (voiceLufs - adLufs) / 20)
  return Math.round(Math.min(MAX_CLIP_VOLUME, Math.max(MIN_CLIP_VOLUME, gain)) * 100) / 100
}

/**
 * The file whose sound stands for the voice in this video: the one that is
 * heard longest and is not music or an ad.
 */
export function voiceMediaId(tracks: Track[]): string | null {
  const heard = new Map<string, number>()
  for (const track of tracks) {
    if (track.muted || track.duck || track.ads) continue
    for (const clip of track.clips) {
      if (!clip.mediaId || clip.muted || isAd(clip)) continue
      if (clip.kind !== "video" && clip.kind !== "audio") continue
      heard.set(clip.mediaId, (heard.get(clip.mediaId) ?? 0) + clip.durationMs)
    }
  }
  let best: string | null = null
  for (const [mediaId, ms] of heard) {
    if (best === null || ms > (heard.get(best) ?? 0)) best = mediaId
  }
  return best
}

// ----------------------------------------------------------- reporting ---

/** How much of the video is ads: "3 ads, 1 min 30 of a 12 min video". */
export function adLoad(tracks: Track[], limitPercent: number) {
  const ads = adsOf(tracks)
  const adMs = ads.reduce((total, { clip }) => total + clip.durationMs, 0)
  const videoMs = timelineEndMs(tracks)
  return {
    count: ads.length,
    adMs,
    videoMs,
    tooMany: videoMs > 0 && (adMs / videoMs) * 100 > limitPercent,
  }
}

/** Minutes and seconds the way people say them: "1 min 30", "12 min", "45 sec". */
export function formatAdLength(ms: number) {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (!minutes) return `${rest} sec`
  return rest ? `${minutes} min ${String(rest).padStart(2, "0")}` : `${minutes} min`
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, "0")
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`
}

/** The ads that break the video, as against words over it: every ad that is not text. */
function breakAds(tracks: Track[]) {
  return adsOf(tracks).filter(({ clip }) => clip.kind !== "text")
}

/**
 * Where each ad break starts, as YouTube Studio takes them: "3:02, 6:10,
 * 9:05". `tooShort` says the video is under the 8 minutes YouTube needs.
 */
export function adBreakTimes(tracks: Track[]) {
  return {
    times: breakAds(tracks).map(({ clip }) => clock(clip.startMs)).join(", "),
    tooShort: timelineEndMs(tracks) < YOUTUBE_AD_BREAK_MIN_MS,
  }
}

/** Where the ad breaks start, for the marks on the progress bar. */
export function adBreakStarts(tracks: Track[]) {
  return breakAds(tracks).map(({ clip }) => clip.startMs)
}

/** What an export keeps about its ads, for the marks on its viewer curve. */
export type ExportAd = { startMs: number; endMs: number; name: string }

/**
 * How many out of 100 viewers were still watching just before an ad starts
 * and just after it ends, read off the viewer curve at those moments.
 */
export function watchingAroundAd(
  points: { ratio: number; watch: number }[],
  lengthSeconds: number,
  ad: ExportAd
) {
  if (points.length < 2 || lengthSeconds <= 0) return null
  const sorted = [...points].sort((a, b) => a.ratio - b.ratio)
  const at = (ms: number) => {
    const ratio = Math.min(1, Math.max(0, ms / 1000 / lengthSeconds))
    const after = sorted.findIndex((point) => point.ratio >= ratio)
    if (after <= 0) return sorted[after === -1 ? sorted.length - 1 : 0].watch
    const a = sorted[after - 1]
    const b = sorted[after]
    const share = b.ratio === a.ratio ? 0 : (ratio - a.ratio) / (b.ratio - a.ratio)
    return a.watch + (b.watch - a.watch) * share
  }
  return {
    before: Math.round(at(ad.startMs) * 100),
    after: Math.round(at(ad.endMs) * 100),
  }
}

export function adsOfTimeline(tracks: Track[], lengthMs: number): ExportAd[] {
  return adsOf(tracks)
    .filter(({ clip }) => clip.startMs < lengthMs)
    .map(({ clip }) => ({
      startMs: clip.startMs,
      endMs: Math.min(lengthMs, clip.startMs + clip.durationMs),
      name: clip.name,
    }))
}
