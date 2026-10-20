import { and, eq } from "drizzle-orm"

import {
  CAPTIONS_FAILED_MESSAGE,
  CAPTIONS_MAX_SOURCE_MS,
  CAPTIONS_NONE_HEARD_MESSAGE,
  CAPTIONS_NOT_POSSIBLE_MESSAGE,
  CAPTIONS_TOO_LONG_MESSAGE,
  findCaptionSource,
  mapCaptionsToTimeline,
  type CaptionsResult,
} from "@/lib/video/captions"
import { sourceEndMs, sourceSpanMs } from "@/lib/video/clip-playback"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { pickTranscriber } from "@/lib/video/ai-choices"
import { wordsInStretch } from "@/lib/video/transcripts"
import { wordsToCaptions } from "@/lib/video/voice"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { requireGeminiKey } from "@/server/video/gemini"
import { videoProjects } from "@/server/video/schema"
import { getAiDefaults } from "@/server/video/settings"
import { fileWords } from "@/server/video/transcripts"

/**
 * Writing the captions.
 *
 * The words of the project's main talking clip come from the file's saved
 * transcript (`src/server/video/transcripts.ts`). The first time a file is
 * captioned its whole sound is written down and saved, and every later run on
 * any clip of that file reads the saved words for nothing. The words of the
 * stretch the clip plays are cut into short lines and moved onto the
 * timeline. Turning those into clips is the editor's job, so this can be
 * checked on its own and so the whole insertion is one thing to undo.
 *
 * Only the sound is sent, never the picture: it is a fraction of the size, and
 * the times come back tighter for it.
 */

const CAPTIONS_LABEL = "Captions"

/**
 * Captions for one project of the caller's own.
 *
 * Writing the file down is one call on the meter however many pieces it goes
 * in, and a failure charges nothing. Saved words cost nothing at all.
 */
export async function writeProjectCaptions(
  userId: string,
  projectId: string
): Promise<CaptionsResult> {
  const [project] = await db
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)

  const timeline = requireCanonicalTimeline(project.timeline)
  const chosen = findCaptionSource(timeline.tracks)
  if (!chosen?.clip.mediaId) throw new Error(CAPTIONS_NOT_POSSIBLE_MESSAGE)
  // The sound the clip plays, at the recording's own pace. The file behind it
  // is measured again once it is opened, because that is what is written down.
  if (sourceSpanMs(chosen.clip) > CAPTIONS_MAX_SOURCE_MS) {
    throw new Error(CAPTIONS_TOO_LONG_MESSAGE)
  }

  // The file is looked up as this person's own, so a hand-edited timeline
  // cannot pull somebody else's recording into a transcript.
  const [media] = await db
    .select()
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.id, chosen.clip.mediaId),
        eq(customShellMedia.userId, userId)
      )
    )
    .limit(1)
  if (!media) throw new Error(CAPTIONS_NOT_POSSIBLE_MESSAGE)

  const source = {
    clipId: chosen.clip.id,
    trackId: chosen.trackId,
    kind: chosen.clip.kind as "video" | "audio",
    mediaId: chosen.clip.mediaId,
    startMs: chosen.clip.startMs,
    durationMs: chosen.clip.durationMs,
    trimStartMs: chosen.clip.trimStartMs,
    speed: chosen.clip.speed,
  }

  // Whichever AI has been chosen writes it down. With no key for either, the
  // Gemini key is the one asked for, as it always has been.
  const transcriber = pickTranscriber(
    await getAiDefaults(),
    await getAiKeysSaved()
  )
  if (!transcriber) await requireGeminiKey()
  if (!transcriber) throw new Error(CAPTIONS_FAILED_MESSAGE)

  const words = await fileWords({
    userId,
    media,
    transcriber,
    feature: "caption_generation",
    label: CAPTIONS_LABEL,
    projectId,
    tooLongMessage: CAPTIONS_TOO_LONG_MESSAGE,
    failedMessage: CAPTIONS_FAILED_MESSAGE,
  })

  // Only the stretch the clip plays, cut into lines of its own so no line
  // runs over the clip's edges. The times are still file time here, which is
  // what `mapCaptionsToTimeline` expects.
  const heard = wordsInStretch(
    words,
    chosen.clip.trimStartMs,
    sourceEndMs(chosen.clip)
  )
  const captions = mapCaptionsToTimeline(wordsToCaptions(heard), source)
  if (!captions.length) throw new Error(CAPTIONS_NONE_HEARD_MESSAGE)
  return { captions, source }
}
