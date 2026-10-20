import { ACTOR_IMAGE_MODELS, videoModelName } from "@/lib/video/asset-factories"
import { isMovingOrigin, isPictureOrigin } from "@/lib/video/clip-origin"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { formatClock } from "@/lib/video/timeline-utils"
import { VOICE_SPEAKERS, type VoiceSpeakerId } from "@/lib/video/voice"

/**
 * Which parts of an export the AI made, written in the words YouTube's
 * "altered or synthetic content" box and TikTok's AI label want
 * (`workspace/docs/say-what-ai-made.md`).
 *
 * The render works it out from the very timeline it draws, so the list
 * always belongs to the file. Nothing here reads the database: a file that
 * carries no recipe of its own is named in `known` by the server.
 */

export type AiPart =
  | { kind: "script"; tool: "brief" | "hook" }
  | { kind: "voice"; speaker: VoiceSpeakerId; atSeconds: number[] }
  | { kind: "picture"; model: string; atSeconds: number[] }
  | { kind: "clip"; model: string; atSeconds: number[] }
  | { kind: "translation" }

/** A file the AI made, found by its id when the clip showing it has no recipe. */
export type KnownAiMedia =
  | { kind: "voice"; speaker: VoiceSpeakerId }
  | { kind: "picture"; model: string }
  | { kind: "clip"; model: string }

/** What the export's window says when the list is empty. */
export const NOTHING_MADE_BY_AI = "Nothing here was made by AI."

/** Past this many places, a line gives the count and the span instead. */
const MAX_LISTED_TIMES = 6

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

/**
 * Walks the timeline the way the render does. A clip of no length is not in
 * the file. A voice line on a muted lane, muted itself or turned all the way
 * down is not heard, so it says nothing about the voice, the words or a
 * translation. Pictures and moving clips show whatever their sound is doing.
 */
export function aiPartsOfTimeline(
  timeline: ProjectTimeline,
  known: ReadonlyMap<string, KnownAiMedia> = new Map()
): AiPart[] {
  const scripts = new Set<"brief" | "hook">()
  const voices = new Map<VoiceSpeakerId, number[]>()
  const pictures = new Map<string, number[]>()
  const clips = new Map<string, number[]>()
  let translated = false

  const add = (into: Map<string, number[]>, key: string, clip: Clip) => {
    const at = into.get(key) ?? []
    at.push(Math.floor(clip.startMs / 1000))
    into.set(key, at)
  }

  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.durationMs <= 0) continue
      const heard = !track.muted && !clip.muted && clip.volume !== 0
      const origin = clip.origin
      if (origin && isPictureOrigin(origin)) {
        add(pictures, origin.model, clip)
      } else if (origin && isMovingOrigin(origin)) {
        add(clips, origin.model, clip)
      } else if (origin) {
        if (!heard) continue
        add(voices, origin.voice.speaker, clip)
        if (origin.tool === "brief-voice") scripts.add("brief")
        if (origin.tool === "hook") scripts.add("hook")
        if (origin.tool === "translate") translated = true
      } else if (clip.mediaId) {
        const made = known.get(clip.mediaId)
        if (made?.kind === "picture") add(pictures, made.model, clip)
        if (made?.kind === "clip") add(clips, made.model, clip)
        if (made?.kind === "voice" && heard) add(voices, made.speaker, clip)
      }
    }
  }

  const times = (at: number[]) =>
    Array.from(new Set(at)).sort((a, b) => a - b)
  return [
    ...(["brief", "hook"] as const)
      .filter((tool) => scripts.has(tool))
      .map((tool) => ({ kind: "script" as const, tool })),
    ...Array.from(voices, ([speaker, at]) => ({
      kind: "voice" as const,
      speaker,
      atSeconds: times(at),
    })),
    ...Array.from(pictures, ([model, at]) => ({
      kind: "picture" as const,
      model,
      atSeconds: times(at),
    })),
    ...Array.from(clips, ([model, at]) => ({
      kind: "clip" as const,
      model,
      atSeconds: times(at),
    })),
    ...(translated ? [{ kind: "translation" as const }] : []),
  ]
}

/** A picture model in everyday words, such as "Nano Banana 2". */
function pictureModelName(model: string) {
  const known = ACTOR_IMAGE_MODELS.find((item) => item.id === model)
  return known ? known.label.split(" · ")[0] : model
}

function speakerName(speaker: VoiceSpeakerId) {
  return VOICE_SPEAKERS.find((item) => item.id === speaker)?.label ?? speaker
}

const clock = (seconds: number) => formatClock(seconds * 1000)

function joinWords(words: string[]) {
  if (words.length < 2) return words.join("")
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

/** "Picture at 0:04", "Pictures at 0:00 and 0:04", "12 pictures from 0:00 to 1:02". */
function placed(one: string, many: string, atSeconds: number[]) {
  if (atSeconds.length === 1) return `${one} at ${clock(atSeconds[0])}`
  if (atSeconds.length <= MAX_LISTED_TIMES) {
    return `${many} at ${joinWords(atSeconds.map(clock))}`
  }
  const first = clock(atSeconds[0])
  const last = clock(atSeconds[atSeconds.length - 1])
  return `${atSeconds.length} ${many.toLowerCase()} from ${first} to ${last}`
}

/**
 * One line per part, in plain words. The voices share a line, because a
 * viewer hears one voice track whichever company read each line. With
 * `handEdited`, the script and picture lines say a person edited them too.
 */
export function aiPartLines(parts: AiPart[], handEdited: boolean): string[] {
  const edited = handEdited ? " and edited by hand" : ""
  const lines: string[] = []
  const speakers = parts.flatMap((part) =>
    part.kind === "voice" ? [speakerName(part.speaker)] : []
  )
  for (const part of parts) {
    if (part.kind === "script") {
      lines.push(
        part.tool === "brief"
          ? `Script written with AI${edited}`
          : `Opening line written with AI${edited}`
      )
    } else if (part.kind === "voice") {
      if (lines.some((line) => line.startsWith("Voice read by AI"))) continue
      lines.push(`Voice read by AI (${joinWords(speakers)})`)
    } else if (part.kind === "picture") {
      lines.push(
        `${placed("Picture", "Pictures", part.atSeconds)} made by AI (${pictureModelName(part.model)})${edited}`
      )
    } else if (part.kind === "clip") {
      lines.push(
        `${placed("Video clip", "Video clips", part.atSeconds)} made by AI (${videoModelName(part.model)})`
      )
    } else {
      lines.push("Translated into another language by AI")
    }
  }
  return lines
}

/** The lines as one paragraph, ready to paste into an upload form. */
export function aiPartsParagraph(parts: AiPart[], handEdited: boolean) {
  const lines = aiPartLines(parts, handEdited)
  return lines.length
    ? lines.map((line) => `${line}.`).join(" ")
    : NOTHING_MADE_BY_AI
}

/** Whether the "Edited by hand" tick changes any line. */
export function aiPartsTakeHandEdits(parts: AiPart[]) {
  return parts.some((part) => part.kind === "script" || part.kind === "picture")
}
