import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import {
  createOwnedProject,
  getOwnedProject,
  type ProjectItem,
} from "@/server/video/projects"
import { videoViralVideos } from "@/server/video/schema"
import {
  loadSavedVideo,
  saveVideoForBreakdown,
  type SavedVideoDetail,
} from "@/server/video/viral/saved-videos"

/**
 * Copy this: a viral video becomes a new project that copies it.
 *
 * The video is saved for breaking down first, which hands back the row that is
 * already there when the video was saved before. So pressing Copy this twice
 * makes two projects on one saved video and downloads it once.
 */
export async function copyVideoIntoProject(
  userId: string,
  url: string,
  title: string | null
): Promise<ProjectItem> {
  const saved = await saveVideoForBreakdown(userId, url)
  const name = (title ?? saved.title ?? "").trim() || "Copied video"
  return createOwnedProject(userId, name, db, null, saved.id)
}

/** The project's Copy tab: the video it copies, if it copies one. */
export type ProjectSourceDetail = {
  project: { id: string; name: string }
  video: SavedVideoDetail | null
}

export async function loadProjectSource(
  userId: string,
  projectId: string
): Promise<ProjectSourceDetail> {
  const project = await getOwnedProject(userId, projectId)
  // A source saved by someone else is never shown, even if the column points
  // at it.
  const [owned] = project.sourceViralVideoId
    ? await db
        .select({ id: videoViralVideos.id })
        .from(videoViralVideos)
        .where(
          and(
            eq(videoViralVideos.id, project.sourceViralVideoId),
            eq(videoViralVideos.ownerId, userId)
          )
        )
    : []
  return {
    project: { id: project.id, name: project.name },
    video: owned ? await loadSavedVideo(userId, owned.id) : null,
  }
}
