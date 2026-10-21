import { and, eq } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireViralProjectBudget } from "@/server/video/project-spend"
import { videoViralProjectLinks, videoViralVideos } from "@/server/video/schema"
import { parseVideoLink } from "@/server/video/viral/download"
import { requireOwnedViralProject } from "@/server/video/viral/projects"
import {
  saveVideo,
  type SavedVideoDetail,
} from "@/server/video/viral/saved-videos"
import { viralSays } from "@/lib/video/viral"

/**
 * Pasting a video's link into a Viral project (viral task 08).
 *
 * The video is saved and broken down exactly as Break it down saves a search
 * result, through the same row and the same worker, so a link pasted twice,
 * or a video already saved from a search, is one row and never two. The only
 * thing a paste adds is `video_viral_project_links`, which is why the video
 * shows in this project at all: a saved video is its owner's, not a project's.
 */

/** Said when the link is not one YouTube, TikTok or Instagram video. */
export const PASTE_LINK_REFUSED =
  "That is not a link to one video. Paste a YouTube, TikTok or Instagram video, such as youtube.com/shorts/…, tiktok.com/@name/video/… or instagram.com/reel/…. Profiles, playlists and other sites can't be added."

export type PastedLink = {
  /** `platform:id`, the project screen's open record. */
  key: string
  video: SavedVideoDetail
  /** It was saved before, here or from another project, so this is that copy. */
  alreadySaved: boolean
}

/**
 * Saves the video for breaking down and puts it in the project. The link is
 * checked before anything is written, which also keeps yt-dlp to the three
 * platforms (`parseVideoLink`). The spend limit is checked only when the AI
 * would actually run, so a video already broken down opens even in a project
 * that has spent its limit.
 */
export async function pasteVideoLink(
  ownerId: string,
  projectId: string,
  pasted: string
): Promise<PastedLink> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (project.isSample) {
    throw viralSays(
      "A sample project's videos are made up, so nothing can be pasted into it. Make your own project to try it."
    )
  }

  const url = withHttps(pasted)
  let link: ReturnType<typeof parseVideoLink>
  try {
    link = parseVideoLink(url)
  } catch {
    throw viralSays(PASTE_LINK_REFUSED)
  }

  const [existing] = await db
    .select({ wantsAnalysis: videoViralVideos.wantsAnalysis })
    .from(videoViralVideos)
    .where(
      and(
        eq(videoViralVideos.ownerId, ownerId),
        eq(videoViralVideos.platform, link.platform),
        eq(videoViralVideos.platformVideoId, link.platformVideoId)
      )
    )
  if (!existing?.wantsAnalysis) {
    await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, 0)
  }

  const video = await saveVideo(ownerId, url, project.id, true)
  await db
    .insert(videoViralProjectLinks)
    .values({ projectId: project.id, savedVideoId: video.id, createdAt: now() })
    .onConflictDoNothing()

  return {
    key: `${link.platform}:${link.platformVideoId}`,
    video,
    alreadySaved: Boolean(existing),
  }
}

/**
 * A link copied from an app often arrives without its `https://`, and an old
 * one with `http://`. Both are the same video, so both are read as https.
 * Anything else with a scheme is left alone for the link check to refuse.
 */
export function withHttps(pasted: string): string {
  const trimmed = pasted.trim()
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
