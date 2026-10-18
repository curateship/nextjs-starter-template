import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import {
  createOwnedProject,
  getOwnedProject,
  type ProjectItem,
} from "@/server/video/projects"
import { videoViralProjects, videoViralVideos } from "@/server/video/schema"
import { requireOwnedViralProject } from "@/server/video/viral/projects"
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
  title: string | null,
  /** The Viral project Copy this was pressed in, remembered on the new one. */
  viralProjectId: string | null = null
): Promise<ProjectItem> {
  const viralProject = viralProjectId
    ? await requireOwnedViralProject(userId, viralProjectId)
    : null
  const saved = await saveVideoForBreakdown(userId, url, viralProject?.id ?? null)
  const name = (title ?? saved.title ?? "").trim() || "Copied video"
  return createOwnedProject(
    userId,
    name,
    db,
    null,
    saved.id,
    viralProject?.id ?? null
  )
}

/** The project's Copy tab: the video it copies, if it copies one. */
export type ProjectSourceDetail = {
  project: { id: string; name: string }
  video: SavedVideoDetail | null
  /**
   * The Viral project it was copied from and the video's own id there, so
   * "Open Viral" opens that project with the video playing. Null when it was
   * copied from anywhere else, or that project was deleted.
   */
  viral: { projectId: string; videoKey: string | null } | null
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
        .select({
          id: videoViralVideos.id,
          platform: videoViralVideos.platform,
          platformVideoId: videoViralVideos.platformVideoId,
        })
        .from(videoViralVideos)
        .where(
          and(
            eq(videoViralVideos.id, project.sourceViralVideoId),
            eq(videoViralVideos.ownerId, userId)
          )
        )
    : []
  const [viralProject] = project.sourceViralProjectId
    ? await db
        .select({ id: videoViralProjects.id })
        .from(videoViralProjects)
        .where(
          and(
            eq(videoViralProjects.id, project.sourceViralProjectId),
            eq(videoViralProjects.ownerId, userId)
          )
        )
    : []
  return {
    project: { id: project.id, name: project.name },
    video: owned ? await loadSavedVideo(userId, owned.id) : null,
    viral: viralProject
      ? {
          projectId: viralProject.id,
          videoKey: owned ? `${owned.platform}:${owned.platformVideoId}` : null,
        }
      : null,
  }
}
