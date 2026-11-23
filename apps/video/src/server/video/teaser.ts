import { z } from "zod"

import { PICTURE_READER_MODEL, TEASER_FRAMES_PER_ASK, teaserCostCents } from "@/lib/video/ai-estimates"
import {
  TEASER_NO_VIDEO_MESSAGE,
  teaserStillGrid,
  type ScoredMoment,
} from "@/lib/video/teaser"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { runAiCall } from "@/server/ai/usage"
import { generateJson, requireGeminiKey } from "@/server/video/gemini"
import { requireVideoBudget, videoSpendMetadata } from "@/server/video/project-spend"
import { renderTimelineStills } from "@/server/video/render"

/**
 * The teaser's moments, scored (workspace/docs/teaser.md): a still along the
 * video clips at most every second, up to 300, each scored 0 to 100 by
 * Gemini for how well it would work as a one to three second moment of a
 * teaser. Only the video clips are drawn, so words and stickers laid over
 * them never sway a score. Nothing is saved; the editor lays the teaser.
 */

const STILL_MAX_SIDE = 384

const scoresSchema = z.object({
  frames: z
    .array(z.object({ index: z.number().int(), score: z.number(), reason: z.string().max(200).optional() }))
    .max(60),
})

export async function scoreTeaserMoments({
  userId,
  videoId,
  signal,
}: {
  userId: string
  videoId: string
  /** Fires when Cancel is pressed. Checked before each paid ask, so a cancel stops the spending. */
  signal?: AbortSignal
}): Promise<ScoredMoment[]> {
  const unchecked = await requireVideoBudget(userId, videoId, 0)
  const timeline = requireCanonicalTimeline(unchecked.timeline)
  const grid = teaserStillGrid(timeline.tracks)
  if (!grid.times.length) throw new Error(TEASER_NO_VIDEO_MESSAGE)
  const times = grid.times.map((still) => still.atMs)
  const video = await requireVideoBudget(userId, videoId, teaserCostCents(times.length))
  const apiKey = await requireGeminiKey()

  // Only the video, so the stills show the footage itself.
  const footage = {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.kind === "video"),
    })),
  }
  // The whole grid in one pass, then only the stills where video shows.
  const drawn = await renderTimelineStills({
    userId,
    timeline: footage,
    fromMs: 0,
    toMs: grid.endMs,
    everyMs: grid.stepMs,
    maxSide: STILL_MAX_SIDE,
  })
  const stills = grid.times
    .map((still) => drawn[still.index])
    .filter((still): still is Uint8Array => !!still)
  if (stills.length !== times.length) throw new Error(TEASER_NO_VIDEO_MESSAGE)

  const scored: ScoredMoment[] = []
  for (let first = 0; first < stills.length; first += TEASER_FRAMES_PER_ASK) {
    signal?.throwIfAborted()
    const batch = stills.slice(first, first + TEASER_FRAMES_PER_ASK)
    const answer = await runAiCall(
      {
        userId,
        provider: "gemini",
        model: PICTURE_READER_MODEL,
        feature: "teaser_moments",
        metadata: videoSpendMetadata(video),
      },
      async () => {
        const reply = await generateJson({
          apiKey,
          model: PICTURE_READER_MODEL,
          label: "Scoring teaser moments",
          schema: scoresSchema,
          parts: [
            {
              text: `These ${batch.length} pictures are frames from one video, in order, numbered 1 to ${batch.length}. Score each from 0 to 100 for how well a one to three second moment around it would work in a short teaser for the video: high for a striking, sharp, well-lit frame with something worth seeing (a view, food, action, a face reacting), low for blurry, dark, empty, in-between or repeated frames. Give each a reason of a few words. Answer only JSON like {"frames":[{"index":1,"score":82,"reason":"steam rising off the noodles"}]}.`,
            },
            ...batch.map((bytes) => ({
              inline_data: { mime_type: "image/jpeg", data: Buffer.from(bytes).toString("base64") },
            })),
          ],
        })
        return {
          result: reply.value,
          usage: { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens },
        }
      }
    )
    for (const frame of answer.frames) {
      if (frame.index < 1 || frame.index > batch.length) continue
      scored.push({
        atMs: times[first + frame.index - 1],
        score: Math.min(100, Math.max(0, Math.round(frame.score))),
        reason: (frame.reason ?? "").slice(0, 120),
      })
    }
  }
  return scored
}
