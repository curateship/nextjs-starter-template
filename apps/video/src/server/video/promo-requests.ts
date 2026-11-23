import { and, desc, eq, isNull } from "drizzle-orm"

import { now as currentTime, uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications, customShellUsers } from "@/server/schema"
import { videoAddress } from "@/server/video/promo-link"
import { insertVideo } from "@/server/video/project-videos"
import { videoProjects, videoProjectVideos } from "@/server/video/schema"

/**
 * Ask for a video, from a Promo project (part 42, `workspace/docs/send-to-promo.md`).
 * Promo lists Video's projects, then sends a brief; Video makes a draft video
 * in the picked project, keeps the brief on it, and rings the bell.
 *
 * Video is one site and the Promo key is the site's, so the projects offered
 * are every active admin's, and the new video belongs to whoever owns the
 * project picked. A member's projects are never offered.
 */

export const REQUEST_BRIEF_MAX = 4_000
const NAME_MAX = 80

/** The first line of a brief, cut to a name's length. */
export function requestedVideoName(brief: string): string {
  const first = brief.trim().split("\n")[0]?.trim() ?? ""
  return (first.length > NAME_MAX ? `${first.slice(0, NAME_MAX - 1).trimEnd()}…` : first) || "Asked for in Promo"
}

/** The projects Promo's Ask for a video lists: every active admin's, not archived, newest first. */
export async function requestableProjects(db: CustomShellDb = defaultDb): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: videoProjects.id, name: videoProjects.name })
    .from(videoProjects)
    .innerJoin(customShellUsers, eq(customShellUsers.id, videoProjects.userId))
    .where(and(isNull(videoProjects.archivedAt), eq(customShellUsers.role, "admin"), eq(customShellUsers.status, "active")))
    .orderBy(desc(videoProjects.updatedAt))
    .limit(200)
}

export class RequestRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Makes the draft video for a brief from Promo, and rings its owner's bell. */
export async function makeRequestedVideo(
  request: { projectId: string; brief: string; promoProjectName: string },
  db: CustomShellDb = defaultDb,
  at: Date = currentTime()
): Promise<{ videoId: string; editUrl: string }> {
  const brief = request.brief.trim()
  if (!brief) throw new RequestRefusal(400, "Write what the video should be first.")
  const [project] = await db
    .select({ id: videoProjects.id, userId: videoProjects.userId })
    .from(videoProjects)
    .innerJoin(customShellUsers, eq(customShellUsers.id, videoProjects.userId))
    .where(
      and(
        eq(videoProjects.id, request.projectId),
        isNull(videoProjects.archivedAt),
        eq(customShellUsers.role, "admin"),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)
  if (!project) throw new RequestRefusal(404, "That Video project isn't there any more. Pick another one.")

  const name = requestedVideoName(brief)
  // One step, so a draft never exists without its brief.
  const video = await db.transaction(async (tx) => {
    const made = await insertVideo(project.userId, project.id, { name, status: "draft" }, tx)
    await tx.update(videoProjectVideos).set({ promoBrief: brief }).where(eq(videoProjectVideos.id, made.id))
    return made
  })
  try {
    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: project.userId,
      type: "app_activity",
      message: `${name} was asked for in Promo`.slice(0, 300),
      detail: request.promoProjectName ? `From ${request.promoProjectName}.` : "From Promo.",
      createdAt: at,
    })
    await publishNotificationCreated(project.userId, db)
  } catch (error) {
    // The video is made either way; the bell is a nicety.
    console.error("The asked-for video's notice could not be written", video.id, error)
  }
  return {
    videoId: video.id,
    editUrl: `${videoAddress()}/admin/video-editor/${encodeURIComponent(project.id)}?video=${encodeURIComponent(video.id)}`,
  }
}
