import type { VideoMediaItem } from "@/lib/api/video/media"
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
  const sourceDurationMs = await loadMediaDurationMs(item.playback_url, kind)
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
  }
}
