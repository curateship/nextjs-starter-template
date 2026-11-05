import type { VideoMediaItem } from "@/lib/api/video/media"
import { loadLoudness } from "@/lib/api/video/ads"
import { levelDbFor } from "@/lib/video/clip-level"
import {
  DEFAULT_IMAGE_DURATION_MS,
  editorId,
  loadMediaDurationMs,
} from "@/lib/video/timeline-utils"
import type { EditorClip } from "@/components/video-editor/editor-store"

/**
 * Turn a file in the library into a clip on the timeline.
 *
 * A video or a sound arrives at its own full length, which is read in the
 * browser here — nothing on the server knows how long a file runs. A picture
 * has no length of its own, so it gets the standard four seconds.
 */
export async function buildMediaClip(
  item: VideoMediaItem
): Promise<EditorClip> {
  if (item.file_type === "image") {
    return {
      id: editorId(),
      kind: "image",
      name: item.original_name,
      mediaId: item.id,
      url: item.url,
      trimStartMs: 0,
      startMs: 0,
      durationMs: DEFAULT_IMAGE_DURATION_MS,
    }
  }
  const kind = item.file_type === "video" ? "video" : "audio"
  const [sourceDurationMs, levelDb] = await Promise.all([
    loadMediaDurationMs(item.playback_url, kind),
    arrivalLevel(item.id),
  ])
  return {
    id: editorId(),
    kind,
    name: item.original_name,
    mediaId: item.id,
    url: item.playback_url,
    sourceDurationMs,
    trimStartMs: 0,
    startMs: 0,
    durationMs: sourceDurationMs,
    ...(levelDb !== undefined ? { levelDb } : {}),
  }
}

/** How long a drop waits for a file's loudness before it lands as recorded. */
const LEVEL_WAIT_MS = 4000

/**
 * The change that brings this file to the even loudness every dropped clip
 * gets (even-out-clip-volume.md). The background worker measures each upload
 * once, so this is usually a quick read. A file not measured yet is measured
 * now, and a drop that would wait longer than four seconds lands as recorded
 * while the measuring carries on for the next drop.
 */
async function arrivalLevel(mediaId: string): Promise<number | undefined> {
  const measured = loadLoudness([mediaId]).then(
    (loudness) => levelDbFor(loudness[mediaId]),
    () => undefined
  )
  const giveUp = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), LEVEL_WAIT_MS))
  return Promise.race([measured, giveUp])
}
