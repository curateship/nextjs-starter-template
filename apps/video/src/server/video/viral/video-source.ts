import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { getOwnedVideo } from "@/server/video/project-videos"
import { videoViralVideos } from "@/server/video/schema"
import {
  loadSavedVideo,
  type SavedVideoDetail,
} from "@/server/video/viral/saved-videos"

/** The editor's Copy panel: the viral video one video copies, if it copies one. */
export type ProjectSourceDetail = {
  /** The video in the editor that does the copying. */
  copying: { id: string; name: string }
  video: SavedVideoDetail | null
  /**
   * The copied video's title when that saved video was deleted, so the panel
   * says "The original video, <title>, was deleted" instead of claiming the
   * video never copied one. Null while the video is still there.
   */
  deletedVideoTitle: string | null
}

export async function loadVideoSource(
  userId: string,
  videoId: string
): Promise<ProjectSourceDetail> {
  const copier = await getOwnedVideo(userId, videoId)
  // A source saved by someone else is never shown, even if the column points
  // at it.
  const [owned] = copier.sourceViralVideoId
    ? await db
        .select({ id: videoViralVideos.id })
        .from(videoViralVideos)
        .where(
          and(
            eq(videoViralVideos.id, copier.sourceViralVideoId),
            eq(videoViralVideos.ownerId, userId)
          )
        )
    : []
  return {
    copying: { id: copier.id, name: copier.name },
    video: owned ? await loadSavedVideo(userId, owned.id) : null,
    deletedVideoTitle: copier.sourceViralVideoId
      ? null
      : copier.sourceViralVideoTitle,
  }
}
