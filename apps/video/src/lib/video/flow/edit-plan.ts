import { z } from "zod"

import { captionTextClips, type CaptionPlacement } from "@/lib/video/caption-look"
import { mapCaptionsToTimeline, type CaptionLine } from "@/lib/video/captions"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { wordsInStretch, type FileWord } from "@/lib/video/transcripts"
import { wordsToCaptions } from "@/lib/video/voice"

/**
 * The AI video node (workspace/docs/flow.md, "AI video"). The AI is sent the
 * prompt, the texts connected to it, and what is said in each connected
 * video with every line's time. It answers with stretches of those files in
 * the order they should play, and whether to add captions. This file turns
 * that answer into a timeline: each stretch cut at the edges of the words
 * inside it, laid end to end, with captions from the same words above.
 */

/** The most stretches one answer may hold; a lane takes 500 clips. */
const EDIT_PLAN_SEGMENTS_MAX = 200
/** A stretch shorter than this once cut to its words is left out. */
const EDIT_PLAN_SHORTEST_MS = 300
/** How many words each timed line the AI reads holds, at most. */
const WORDS_PER_LINE = 12
/** A pause this long starts a new line, so the AI sees where a cut can go. */
const LINE_BREAK_PAUSE_MS = 700

export const editPlanSchema = z.object({
  title: z.string().max(120).optional(),
  captions: z.boolean(),
  segments: z
    .array(
      z.object({
        file: z.string().min(1).max(8),
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
      })
    )
    .min(1)
    .max(EDIT_PLAN_SEGMENTS_MAX),
})

type EditPlan = z.infer<typeof editPlanSchema>

/** One connected video, as the AI is shown it. `key` is "F1", "F2" and so on. */
export type EditPlanFile = {
  key: string
  mediaId: string
  name: string
  durationMs: number
  words: FileWord[]
}

function seconds(ms: number) {
  return (ms / 1000).toFixed(1)
}

/**
 * What is said in one file, as timed lines: a new line at every pause
 * longer than 0.7 seconds, and at twelve words at the most.
 */
export function fileLines(file: EditPlanFile): string[] {
  const lines = [`File ${file.key}: "${file.name}", ${seconds(file.durationMs)} seconds long. What is said, with times in seconds:`]
  if (!file.words.length) {
    lines.push("(nothing is said in it)")
    return lines
  }
  const groups: FileWord[][] = []
  for (const word of file.words) {
    const group = groups.at(-1)
    const last = group?.at(-1)
    if (group && last && group.length < WORDS_PER_LINE && word.startMs - last.endMs <= LINE_BREAK_PAUSE_MS) group.push(word)
    else groups.push([word])
  }
  for (const words of groups) {
    lines.push(`[${seconds(words[0].startMs)}-${seconds(words.at(-1)!.endMs)}] ${words.map((word) => word.text).join(" ")}`)
  }
  return lines
}

/**
 * One stretch, cut to the words in it: it starts where its first word does
 * and ends where its last word does, so no word is cut in half. A stretch
 * with no words in it keeps the times it was given.
 */
function snapToWords(words: readonly FileWord[], fromMs: number, toMs: number) {
  const inside = wordsInStretch(words, fromMs, toMs)
  if (!inside.length) return { fromMs, toMs }
  return { fromMs: Math.max(0, inside[0].startMs), toMs: inside.at(-1)!.endMs }
}

/**
 * The timeline the plan makes: the stretches end to end on one lane, the
 * captions above them on their own. Stretches naming a file that wasn't
 * sent, running backwards, or too short once cut are left out and counted.
 */
export function planToTimeline(
  plan: EditPlan,
  files: readonly EditPlanFile[],
  options: {
    aspect: ProjectTimeline["aspect"]
    captions: CaptionPlacement | null
    newId: () => string
  }
): { timeline: ProjectTimeline; laidMs: number; stretches: number; skipped: number } {
  const byKey = new Map(files.map((file) => [file.key.toUpperCase(), file]))
  const videoClips: ProjectTimeline["tracks"][number]["clips"] = []
  const lines: CaptionLine[] = []
  let atMs = 0
  let skipped = 0
  for (const segment of plan.segments) {
    const file = byKey.get(segment.file.trim().toUpperCase())
    if (!file) {
      skipped += 1
      continue
    }
    const asked = {
      fromMs: Math.min(file.durationMs, Math.round(segment.start * 1000)),
      toMs: Math.min(file.durationMs, Math.round(segment.end * 1000)),
    }
    const { fromMs, toMs } = snapToWords(file.words, asked.fromMs, asked.toMs)
    const durationMs = Math.min(file.durationMs, toMs) - fromMs
    if (durationMs < EDIT_PLAN_SHORTEST_MS) {
      skipped += 1
      continue
    }
    videoClips.push({
      id: options.newId(),
      kind: "video",
      name: file.name.slice(0, 255),
      startMs: atMs,
      durationMs,
      trimStartMs: fromMs,
      mediaId: file.mediaId,
      sourceDurationMs: file.durationMs,
    })
    if (plan.captions && options.captions) {
      const heard = wordsInStretch(file.words, fromMs, fromMs + durationMs)
      lines.push(...mapCaptionsToTimeline(wordsToCaptions(heard), { startMs: atMs, durationMs, trimStartMs: fromMs }))
    }
    atMs += durationMs
  }
  const tracks: ProjectTimeline["tracks"] = []
  if (lines.length && options.captions) {
    tracks.push({ id: options.newId(), muted: false, clips: captionTextClips(lines, options.captions, { newId: options.newId }) })
  }
  tracks.push({ id: options.newId(), muted: false, clips: videoClips })
  return {
    timeline: { tracks, aspect: options.aspect },
    laidMs: atMs,
    stretches: videoClips.length,
    skipped,
  }
}
