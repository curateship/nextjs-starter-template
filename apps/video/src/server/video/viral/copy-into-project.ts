import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { createVideo, getOwnedVideo } from "@/server/video/project-videos"
import { createOwnedProject } from "@/server/video/projects"
import { videoViralProjects, videoViralVideos } from "@/server/video/schema"
import { requireOwnedViralProject } from "@/server/video/viral/projects"
import {
  loadSavedVideo,
  saveVideoForBreakdown,
  type SavedVideoDetail,
} from "@/server/video/viral/saved-videos"

/**
 * Make this a template: a viral video becomes a new video that copies it,
 * in a new project named after it or in one of the person's own projects
 * (Tyler, 1 Nov 2026: asked which each time).
 *
 * The video is saved for breaking down first, which hands back the row that is
 * already there when the video was saved before. So pressing it twice makes
 * two videos on one saved video and downloads it once.
 */
export async function copyVideoIntoProject(
  userId: string,
  url: string,
  title: string | null,
  /** The Viral project it was pressed in, remembered on the new video. */
  viralProjectId: string | null = null,
  /** An existing project to add the video to; null makes a new project. */
  intoProjectId: string | null = null
): Promise<{ projectId: string; videoId: string }> {
  const viralProject = viralProjectId
    ? await requireOwnedViralProject(userId, viralProjectId)
    : null
  const saved = await saveVideoForBreakdown(userId, url, viralProject?.id ?? null)
  const name = (title ?? saved.title ?? "").trim() || "Copied video"
  if (intoProjectId) {
    const video = await createVideo(userId, intoProjectId, {
      name,
      sourceViralVideoId: saved.id,
      sourceViralProjectId: viralProject?.id ?? null,
    })
    return { projectId: video.project_id, videoId: video.id }
  }
  const made = await createOwnedProject(
    userId,
    name,
    db,
    null,
    saved.id,
    viralProject?.id ?? null
  )
  return { projectId: made.project.id, videoId: made.video }
}

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
  /**
   * The Viral project it was copied from and the video's own id there, so
   * "Open Viral" opens that project with the video playing. Null when it was
   * copied from anywhere else, or that project was deleted.
   */
  viral: { projectId: string; videoKey: string | null } | null
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
        .select({
          id: videoViralVideos.id,
          platform: videoViralVideos.platform,
          platformVideoId: videoViralVideos.platformVideoId,
        })
        .from(videoViralVideos)
        .where(
          and(
            eq(videoViralVideos.id, copier.sourceViralVideoId),
            eq(videoViralVideos.ownerId, userId)
          )
        )
    : []
  const [viralProject] = copier.sourceViralProjectId
    ? await db
        .select({ id: videoViralProjects.id })
        .from(videoViralProjects)
        .where(
          and(
            eq(videoViralProjects.id, copier.sourceViralProjectId),
            eq(videoViralProjects.ownerId, userId)
          )
        )
    : []
  return {
    copying: { id: copier.id, name: copier.name },
    video: owned ? await loadSavedVideo(userId, owned.id) : null,
    deletedVideoTitle: copier.sourceViralVideoId
      ? null
      : copier.sourceViralVideoTitle,
    viral: viralProject
      ? {
          projectId: viralProject.id,
          videoKey: owned ? `${owned.platform}:${owned.platformVideoId}` : null,
        }
      : null,
  }
}
