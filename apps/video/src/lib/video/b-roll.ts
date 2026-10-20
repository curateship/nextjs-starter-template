import type { CaptionLine } from "@/lib/video/captions"
import { findCaptionSource } from "@/lib/video/captions"
import {
  MAX_TIMELINE_TRACKS,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"

/**
 * B-roll from Pexels, on both sides of the wire (see
 * `workspace/docs/b-roll.md`).
 *
 * The voice line is cut into sentences, the writer names one search phrase
 * per sentence, Pexels answers each phrase with a few clips, and the picked
 * clips are laid on a lane of their own under the sentences they belong to.
 * Nothing here talks to a provider or a database, so the browser can import
 * it and every rule can be checked on its own.
 */

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]

/** One word as it is heard, in timeline time. */
export type TimedWord = { text: string; startMs: number; endMs: number }

export type BrollSentence = {
  id: string
  text: string
  startMs: number
  endMs: number
}

/** A sentence shorter than this is joined to the one beside it. */
export const BROLL_MIN_SENTENCE_MS = 1500

/**
 * With no full stops in the words (Whisper drops them), a pause at least this
 * long ends a sentence instead.
 */
export const BROLL_SENTENCE_PAUSE_MS = 400

/** One phrase per sentence, and Pexels allows 200 searches an hour. */
export const BROLL_MAX_SENTENCES = 200

/** How many clips each sentence is offered. */
export const BROLL_CANDIDATES = 4

/** A phrase is one to three words. */
const BROLL_PHRASE_MAX_WORDS = 3
export const BROLL_PHRASE_MAX_CHARACTERS = 60

/** Pexels' free allowance: 200 requests an hour. */
export const PEXELS_HOURLY_LIMIT = 200

/** The shortest side a picked file may have, so 720p and up. */
export const BROLL_MIN_FILE_SIDE = 720

export const BROLL_NO_KEY_MESSAGE = "Needs a Pexels key"
export const BROLL_NO_VOICE_MESSAGE =
  "There is no talking on the timeline to find B-roll for. Add a voice line or a talking clip first."
export const BROLL_NO_SPEECH_MESSAGE =
  "No words could be made out on the voice line."
export const BROLL_TOO_MANY_MESSAGE = `This voice line has more than ${BROLL_MAX_SENTENCES} sentences. B-roll covers ${BROLL_MAX_SENTENCES} at most, the searches Pexels allows in an hour.`
export const BROLL_KEY_REFUSED_MESSAGE =
  "Pexels refused the key. Check it in Settings → Pexels."
export const BROLL_PEXELS_DOWN_MESSAGE =
  "Pexels could not be reached. Try again in a moment."
export const BROLL_NO_ROOM_MESSAGE = `This project already has ${MAX_TIMELINE_TRACKS} tracks, the most it can hold. Delete an empty track to make room for the B-roll lane.`
export const BROLL_DOWNLOAD_FAILED_MESSAGE =
  "A Pexels clip could not be downloaded, so nothing was placed. Try Place again, or pick another clip."
export const BROLL_PHRASES_FAILED_MESSAGE =
  "The writer did not give one search phrase per sentence. Try again."

/** The refusals worded for a person, shown as they are. */
export const SAFE_BROLL_ERRORS = new Set([
  BROLL_NO_KEY_MESSAGE,
  BROLL_NO_VOICE_MESSAGE,
  BROLL_NO_SPEECH_MESSAGE,
  BROLL_TOO_MANY_MESSAGE,
  BROLL_KEY_REFUSED_MESSAGE,
  BROLL_PEXELS_DOWN_MESSAGE,
  BROLL_NO_ROOM_MESSAGE,
  BROLL_DOWNLOAD_FAILED_MESSAGE,
  BROLL_PHRASES_FAILED_MESSAGE,
])

/**
 * The words of a voiceover's kept caption lines, one by one. A line carries
 * its words' times by position; a line whose times do not match its words
 * shares its time out evenly instead, the same rule the captions use.
 */
export function wordsFromCaptionLines(lines: CaptionLine[]): TimedWord[] {
  return lines.flatMap((line) => {
    const texts = line.text.split(/\s+/).filter(Boolean)
    if (!texts.length) return []
    if (line.words?.length === texts.length) {
      return texts.map((text, index) => ({ text, ...line.words![index] }))
    }
    const share = (line.endMs - line.startMs) / texts.length
    return texts.map((text, index) => ({
      text,
      startMs: Math.round(line.startMs + share * index),
      endMs: Math.round(line.startMs + share * (index + 1)),
    }))
  })
}

/** A word that ends a sentence: a full stop, ! or ?, before any quote. */
function endsSentence(text: string) {
  return /[.!?…]["'”’)\]]*$/.test(text.trim())
}

/**
 * The voice line's words cut into sentences, each from its first word's start
 * to its last word's end. Full stops decide where one ends. Words with no full
 * stops at all (Whisper drops them) are cut at every pause of 400ms or more.
 * Then a sentence shorter than 1.5 seconds is joined to the one after it, or
 * to the one before when it is the last.
 */
export function splitSentences(words: TimedWord[]): BrollSentence[] {
  const heard = [...words]
    .filter((word) => word.text.trim())
    .sort((a, b) => a.startMs - b.startMs)
  const punctuated = heard.some((word) => endsSentence(word.text))
  const runs: TimedWord[][] = []
  let run: TimedWord[] = []
  heard.forEach((word, index) => {
    run.push(word)
    const next = heard[index + 1]
    const ends = punctuated
      ? endsSentence(word.text)
      : !next || next.startMs - word.endMs >= BROLL_SENTENCE_PAUSE_MS
    if (ends || !next) {
      runs.push(run)
      run = []
    }
  })
  const sentences = runs.map((one) => ({
    text: one.map((word) => word.text.trim()).join(" "),
    startMs: one[0].startMs,
    endMs: Math.max(...one.map((word) => word.endMs)),
  }))
  return mergeShortSentences(sentences).map((sentence, index) => ({
    id: `s${index + 1}`,
    ...sentence,
  }))
}

type Span = { text: string; startMs: number; endMs: number }

function mergeShortSentences(sentences: Span[]): Span[] {
  const merged = [...sentences]
  let index = 0
  while (merged.length > 1 && index < merged.length) {
    const sentence = merged[index]
    if (sentence.endMs - sentence.startMs >= BROLL_MIN_SENTENCE_MS) {
      index += 1
      continue
    }
    // The last sentence has nothing after it, so it joins the one before.
    const into = index === merged.length - 1 ? index - 1 : index
    const first = merged[into]
    const second = merged[into + 1]
    merged.splice(into, 2, {
      text: `${first.text} ${second.text}`,
      startMs: first.startMs,
      endMs: Math.max(first.endMs, second.endMs),
    })
    // The joined sentence may still be short, so it is looked at again.
    index = into
  }
  return merged
}

/**
 * A phrase as it is searched: spaces tidied, quotes and full stops off, and
 * no more than three words. Empty means there is nothing to search.
 */
export function cleanPhrase(value: string) {
  return value
    .replace(/["“”.,;:!?]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, BROLL_PHRASE_MAX_WORDS)
    .join(" ")
    .slice(0, BROLL_PHRASE_MAX_CHARACTERS)
}

/** Pexels' orientation for the project's shape. */
export function pexelsOrientation(
  aspect: AspectRatio
): "portrait" | "landscape" | "square" {
  if (aspect === "9:16") return "portrait"
  if (aspect === "1:1") return "square"
  return "landscape"
}

/** One clip Pexels offered for a sentence, with the file that would be used. */
export type BrollCandidate = {
  pexelsId: number
  /** The clip's page on pexels.com, kept in the credit. */
  pageUrl: string
  photographer: string
  photographerUrl: string
  /** A still of the clip, shown in the grid. */
  pictureUrl: string
  /** The smallest file, played only while the pointer is over the still. */
  previewUrl: string
  /** The file Place downloads: the smallest at 720p or above. */
  fileUrl: string
  width: number
  height: number
  durationMs: number
}

type PexelsFile = {
  link: string
  width: number | null
  height: number | null
  file_type?: string | null
}

/** Only Pexels' own video host is downloaded from. */
export function isPexelsFileUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "videos.pexels.com"
  } catch {
    return false
  }
}

function playable(file: PexelsFile) {
  return (
    file.file_type === "video/mp4" &&
    isPexelsFileUrl(file.link) &&
    (file.width ?? 0) > 0 &&
    (file.height ?? 0) > 0
  )
}

const pixels = (file: PexelsFile) => (file.width ?? 0) * (file.height ?? 0)

/**
 * The file Place downloads: the smallest MP4 whose shorter side is at least
 * 720 pixels, so a 4K original is never fetched when a 720p copy is there.
 * Null when Pexels has no copy that sharp.
 */
export function pickPexelsFile<File extends PexelsFile>(files: File[]): File | null {
  const sharp = files.filter(
    (file) =>
      playable(file) &&
      Math.min(file.width ?? 0, file.height ?? 0) >= BROLL_MIN_FILE_SIDE
  )
  return sharp.sort((a, b) => pixels(a) - pixels(b))[0] ?? null
}

/** The smallest playable file, for the moving preview in the grid. */
export function pickPreviewFile<File extends PexelsFile>(files: File[]): File | null {
  return files.filter(playable).sort((a, b) => pixels(a) - pixels(b))[0] ?? null
}

/**
 * Which clip a row starts ticked on: Pexels' best match that runs at least as
 * long as the sentence, so nothing has to hold on its last frame. When none
 * is long enough, the longest. Null for a row with no clips.
 */
export function suggestedCandidate(
  candidates: BrollCandidate[],
  sentenceMs: number
): number | null {
  if (!candidates.length) return null
  const longEnough = candidates.findIndex((one) => one.durationMs >= sentenceMs)
  if (longEnough >= 0) return longEnough
  let longest = 0
  candidates.forEach((one, index) => {
    if (one.durationMs > candidates[longest].durationMs) longest = index
  })
  return longest
}

/**
 * The credit Pexels asks for, kept as the library file's alt text so it
 * travels with the file: "Video by Jane Doe on Pexels: <page>
 * (photographer: <their page>)".
 */
export function brollCredit(candidate: {
  photographer: string
  photographerUrl: string
  pageUrl: string
}) {
  const by = candidate.photographer.trim() || "an unnamed photographer"
  return `Video by ${by} on Pexels: ${candidate.pageUrl} (photographer: ${candidate.photographerUrl})`
}

/** A picked clip once it is in the library, ready to lay down. */
export type BrollPlacement = {
  startMs: number
  endMs: number
  mediaId: string
  url: string
  name: string
  /** How long the Pexels file runs. */
  sourceDurationMs: number
}

/**
 * Where the B-roll lane goes: straight above the highest lane with pictures
 * or video on it, so it covers the speaker and any stills, and stays under
 * captions and text. With no pictures anywhere, straight above the voice.
 */
export function brollLaneIndex(tracks: Track[]) {
  const picture = tracks.findIndex((track) =>
    track.clips.some((clip) => clip.kind === "video" || clip.kind === "image")
  )
  if (picture >= 0) return picture
  const voice = findCaptionSource(tracks)
  const voiceIndex = voice
    ? tracks.findIndex((track) => track.id === voice.trackId)
    : -1
  return voiceIndex >= 0 ? voiceIndex : tracks.length
}

/**
 * The picked clips on one new lane, each starting where its sentence starts
 * and running as long as the sentence, muted, filling the frame. A clip
 * shorter than its sentence runs past the end of its file, which the preview
 * and the export both draw as its last frame held. Nothing already on the
 * timeline moves. Null when the project has no room for another lane.
 */
export function landBroll(
  tracks: Track[],
  placements: BrollPlacement[],
  newId: () => string
): Track[] | null {
  if (!placements.length) return tracks
  if (tracks.length + 1 > MAX_TIMELINE_TRACKS) return null
  const clips: Clip[] = [...placements]
    .sort((a, b) => a.startMs - b.startMs)
    .map((placement) => ({
      id: newId(),
      kind: "video",
      name: placement.name,
      mediaId: placement.mediaId,
      url: placement.url,
      startMs: Math.round(placement.startMs),
      durationMs: Math.max(1, Math.round(placement.endMs - placement.startMs)),
      trimStartMs: 0,
      sourceDurationMs: placement.sourceDurationMs,
      muted: true,
      fit: "cover",
    }))
  const at = brollLaneIndex(tracks)
  const lane: Track = { id: newId(), muted: false, clips }
  return [...tracks.slice(0, at), lane, ...tracks.slice(at)]
}
