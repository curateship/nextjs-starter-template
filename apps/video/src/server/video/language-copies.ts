import { captionTextClips } from "@/lib/video/caption-look"
import type { SpokenLine } from "@/lib/video/remake-clip"
import { DEFAULT_FRAME_RATE, DEFAULT_RENDER_QUALITY } from "@/lib/video/render"
import {
  layVoiceover,
  voiceoverRefusal,
  VOICEOVER_NO_ROOM_MESSAGE,
} from "@/lib/video/saved-voiceovers"
import {
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import {
  capitalsLocale,
  TRANSLATE_ORIGINAL_VOLUME,
  TRANSLATE_PAST_THE_END_MESSAGE,
  TRANSLATE_SOURCE_GONE_MESSAGE,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  getOwnedVideo,
  insertLanguageCopy,
  type VideoItem,
} from "@/server/video/project-videos"
import { renderRefusalReason, timelineEndMs } from "@/server/video/render"
import {
  enqueueRenderJobs,
  refuseFullQueue,
  type RenderJobSummary,
} from "@/server/video/render-queue"
import { getCaptionSettings } from "@/server/video/settings"

/**
 * One language of Every language in one press
 * (workspace/docs/another-language.md): a copy of the video, in the same
 * project, with the translation read aloud over the original, and its export
 * queued.
 *
 * The copy is made from the video as it is saved now, with the new voice on
 * a lane of its own from where the talking starts, its captions in the saved
 * look above everything, and the original talking turned down to a fifth,
 * exactly as the single-language tool lays them in the editor. The original
 * video is only read.
 */

export type LanguageCopyResult = {
  language: TranslateLanguage
  video: VideoItem
  /** The copy's export, or null when the queue refused it. */
  exports: RenderJobSummary[] | null
  /** Why the export was not queued, in words, when it was not. */
  exportProblem: string | null
}

/** Said when a voice was read and paid for but could not be laid. */
const KEPT_IN_VOICES = "The voice is saved in the Voices panel."

function hasClip(timeline: ProjectTimeline, clipId: string) {
  return timeline.tracks.some((track) =>
    track.clips.some((clip) => clip.id === clipId)
  )
}

/**
 * Checked before anything is paid for: the video is the caller's, its
 * timeline reads, the talking it was translated from is still on it, the new
 * voice starts inside the video, a voice and its captions still fit, and
 * the copy's export would be taken. The export is asked again once the copy
 * is made, and a refusal then leaves the copy standing.
 */
export async function checkLanguageCopy(
  {
    userId,
    videoId,
    sourceClipId,
    startsAtMs,
  }: {
    userId: string
    videoId: string
    sourceClipId: string
    startsAtMs: number
  },
  database: CustomShellDb = db
) {
  const source = await getOwnedVideo(userId, videoId, database)
  const timeline = requireCanonicalTimeline(source.timeline)
  if (!hasClip(timeline, sourceClipId)) {
    throw new Error(TRANSLATE_SOURCE_GONE_MESSAGE)
  }
  if (startsAtMs >= timelineEndMs(timeline.tracks)) {
    throw new Error(TRANSLATE_PAST_THE_END_MESSAGE)
  }
  // A voice with captions needs two more lanes.
  if (voiceoverRefusal(timeline.tracks, [null])) {
    throw new Error(VOICEOVER_NO_ROOM_MESSAGE)
  }
  const refusal = renderRefusalReason(timeline)
  if (refusal) throw new Error(refusal)
  await refuseFullQueue(userId, 1, database)
}

/** Lays the voice that was read on a copy, then queues the copy's export. */
export async function makeLanguageCopy(
  {
    userId,
    videoId,
    sourceClipId,
    language,
    said,
    startsAtMs,
  }: {
    userId: string
    videoId: string
    sourceClipId: string
    language: TranslateLanguage
    said: SpokenLine
    /** Where the original talking starts; the new voice starts there too. */
    startsAtMs: number
  },
  database: CustomShellDb = db
): Promise<LanguageCopyResult> {
  // Read again after the voice, which took a while: the copy is made from
  // the video as it is saved at this moment.
  const source = await getOwnedVideo(userId, videoId, database)
  const timeline = requireCanonicalTimeline(source.timeline)
  if (!hasClip(timeline, sourceClipId)) {
    throw new Error(`${TRANSLATE_SOURCE_GONE_MESSAGE}. ${KEPT_IN_VOICES}`)
  }
  if (voiceoverRefusal(timeline.tracks, said.captions)) {
    throw new Error(`${VOICEOVER_NO_ROOM_MESSAGE} ${KEPT_IN_VOICES}`)
  }
  const audioId = uuid()
  const captions = captionTextClips(
    said.captions,
    { ...(await getCaptionSettings(database)), aspect: timeline.aspect },
    {
      atMs: startsAtMs,
      spokenBy: audioId,
      locale: capitalsLocale(language),
      newId: uuid,
    }
  )
  const tracks = layVoiceover(
    timeline.tracks,
    {
      audio: {
        id: audioId,
        kind: "audio",
        name: said.name,
        mediaId: said.mediaId,
        url: said.url,
        startMs: startsAtMs,
        durationMs: said.durationMs,
        trimStartMs: 0,
        sourceDurationMs: said.durationMs,
        origin: said.origin,
      },
      captions,
      quieten: { clipId: sourceClipId, volume: TRANSLATE_ORIGINAL_VOLUME },
    },
    uuid
  )
  const video = await insertLanguageCopy(
    source,
    language,
    { ...timeline, tracks },
    database
  )

  // The copy stands whatever the queue says; a refused export is said, and
  // can be asked for again from the copy.
  try {
    const exports = await enqueueRenderJobs({
      userId,
      videoId: video.id,
      aspects: [timeline.aspect],
      quality: DEFAULT_RENDER_QUALITY,
      frameRate: DEFAULT_FRAME_RATE,
      title: video.name,
      database,
    })
    return { language, video, exports, exportProblem: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    return {
      language,
      video,
      exports: null,
      exportProblem: message || "The export could not be queued",
    }
  }
}
