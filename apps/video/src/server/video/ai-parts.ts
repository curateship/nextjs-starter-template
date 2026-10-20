import { inArray } from "drizzle-orm"

import {
  aiPartsOfTimeline,
  type AiPart,
  type KnownAiMedia,
} from "@/lib/video/ai-parts"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { OPENAI_VOICES } from "@/lib/video/voice"
import { db, type CustomShellDb } from "@/server/db"
import {
  videoAiGenerations,
  videoFirstFrames,
  videoVoiceovers,
} from "@/server/video/schema"

/**
 * Which parts of a timeline the AI made (`workspace/docs/say-what-ai-made.md`).
 *
 * A clip's recipe says it best. A clip without one can still show a file the
 * AI made: a first frame or a shot dragged in from Media, a voiceover laid
 * again from the Voices panel, or anything laid down before recipes existed.
 * Those files are found by id in the tables that made them.
 */
export async function workOutAiParts(
  timeline: ProjectTimeline,
  database: CustomShellDb = db
): Promise<AiPart[]> {
  const mediaIds = Array.from(
    new Set(
      timeline.tracks.flatMap((track) =>
        track.clips.flatMap((clip) =>
          !clip.origin && clip.mediaId ? [clip.mediaId] : []
        )
      )
    )
  )
  const known = new Map<string, KnownAiMedia>()
  if (mediaIds.length) {
    const [voiceovers, frames, shots] = await Promise.all([
      database
        .select({
          mediaId: videoVoiceovers.mediaId,
          voiceId: videoVoiceovers.voiceId,
        })
        .from(videoVoiceovers)
        .where(inArray(videoVoiceovers.mediaId, mediaIds)),
      database
        .select({
          mediaId: videoFirstFrames.imageMediaId,
          model: videoFirstFrames.model,
        })
        .from(videoFirstFrames)
        .where(inArray(videoFirstFrames.imageMediaId, mediaIds)),
      database
        .select({
          mediaId: videoAiGenerations.outputMediaId,
          model: videoAiGenerations.model,
        })
        .from(videoAiGenerations)
        .where(inArray(videoAiGenerations.outputMediaId, mediaIds)),
    ])
    // A voiceover keeps its voice, not its company. OpenAI's voices are a
    // fixed list of names; every other voice is ElevenLabs'.
    for (const row of voiceovers) {
      const openai = OPENAI_VOICES.some((voice) => voice.id === row.voiceId)
      known.set(row.mediaId, {
        kind: "voice",
        speaker: openai ? "openai" : "elevenlabs",
      })
    }
    for (const row of frames) {
      known.set(row.mediaId, { kind: "picture", model: row.model })
    }
    for (const row of shots) {
      if (row.mediaId) known.set(row.mediaId, { kind: "clip", model: row.model })
    }
  }
  return aiPartsOfTimeline(timeline, known)
}
