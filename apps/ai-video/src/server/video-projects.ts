import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteOwnedProjectMedia } from "@/server/media"
import {
  mediaFileUrl,
  mediaProxyUrl,
  projectRenderThumbnailUrl,
  projectRenderThumbnailVersion,
} from "@/server/media-urls"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoMedia,
  aiVideoProjects,
  type AiVideoProject,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import {
  createEmptyTimeline,
  parseTimelineForReset,
  PROJECT_CONFLICT_MESSAGE,
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "@/lib/timeline-schema"

// Dashboard list rows — no timeline payload over the wire, just derived stats.
export type ProjectItem = {
  id: string
  name: string
  template_id: string | null
  project_type: "regular" | "template"
  clip_count: number
  duration_ms: number
  timeline_error: string | null
  // Optimistic-concurrency token; send it back with the next timeline save.
  version: number
  // Latest-render mirror (render-queue.ts) for the dashboard status badge.
  render_status: "idle" | "queued" | "rendering" | "ready" | "error"
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

// Editor payload: the summary plus the full timeline to hydrate the store.
export type ProjectDetail = ProjectItem & {
  timeline: ProjectTimeline
}

export type ProjectListResponse = {
  projects: ProjectItem[]
}

// Owned-row lookup; throws when the project doesn't exist or isn't the user's.
async function getOwnedProject(userId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, userId))
    )
    .limit(1)

  if (!row) {
    throw new Error("Project not found")
  }

  return row
}

// Exported so the template→project flow names new projects the same way.
export function cleanProjectName(value: string) {
  const name = value.trim()
  if (!name) {
    throw new Error("Project name is required")
  }
  return name.slice(0, 255)
}

// Derives the dashboard stats (clip count, timeline length) from the stored
// timeline JSON without trusting its shape. Shared with video-templates,
// which stores the same timeline shape.
export function summarizeTimeline(timeline: ProjectTimeline) {
  let clipCount = 0
  let durationMs = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      clipCount += 1
      durationMs = Math.max(durationMs, clip.startMs + clip.durationMs)
    }
  }
  return { clipCount, durationMs }
}

function serializeProjectFromTimeline(
  row: AiVideoProject,
  timeline: ProjectTimeline,
  timelineError: string | null
): ProjectItem {
  const stats = summarizeTimeline(timeline)
  return {
    id: row.id,
    name: row.name,
    template_id: row.templateId,
    project_type: row.templateId ? "template" : "regular",
    clip_count: stats.clipCount,
    duration_ms: stats.durationMs,
    timeline_error: timelineError,
    version: row.version,
    render_status:
      (row.renderStatus as ProjectItem["render_status"]) ?? "idle",
    thumbnail_url:
      row.renderStatus === "ready" && row.renderThumbnailStoragePath
        ? projectRenderThumbnailUrl(
            row.id,
            projectRenderThumbnailVersion(row.renderedAt, row.updatedAt)
          )
        : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function serializeProject(row: AiVideoProject): ProjectItem {
  const { timeline, error } = parseTimelineForReset(row.timeline)
  return serializeProjectFromTimeline(row, timeline, error)
}

async function serializeProjectDetail(
  row: AiVideoProject,
  userId: string
): Promise<ProjectDetail> {
  const { timeline, error } = parseTimelineForReset(row.timeline)
  return {
    ...serializeProjectFromTimeline(row, timeline, error),
    timeline: await secureTimelineMediaUrlsForEditing(userId, timeline),
  }
}

export function secureTimelineMediaUrls(
  timeline: ProjectTimeline,
  proxyUrls: ReadonlyMap<string, string> = new Map()
): ProjectTimeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.mediaId
          ? {
              ...clip,
              url: proxyUrls.get(clip.mediaId) ?? mediaFileUrl(clip.mediaId),
            }
          : clip
      ),
    })),
  }
}

export async function secureTimelineMediaUrlsForEditing(
  userId: string,
  timeline: ProjectTimeline
) {
  const mediaIds = Array.from(
    new Set(
      timeline.tracks.flatMap((track) =>
        track.clips.flatMap((clip) => (clip.mediaId ? [clip.mediaId] : []))
      )
    )
  )
  const rows = mediaIds.length
    ? await db
        .select({
          id: aiVideoMedia.id,
          proxyStatus: aiVideoMedia.proxyStatus,
          proxyStoragePath: aiVideoMedia.proxyStoragePath,
          proxyGeneratedAt: aiVideoMedia.proxyGeneratedAt,
        })
        .from(aiVideoMedia)
        .where(
          and(
            eq(aiVideoMedia.userId, userId),
            inArray(aiVideoMedia.id, mediaIds)
          )
        )
    : []
  const proxyUrls = new Map(
    rows.flatMap((row) =>
      row.proxyStatus === "ready" && row.proxyStoragePath
        ? [[row.id, mediaProxyUrl(row.id, row.proxyGeneratedAt)] as const]
        : []
    )
  )
  return secureTimelineMediaUrls(timeline, proxyUrls)
}

export async function listProjectsForCurrentUser(): Promise<ProjectListResponse> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(aiVideoProjects)
    .where(eq(aiVideoProjects.userId, user.id))
    .orderBy(desc(aiVideoProjects.updatedAt))

  return { projects: rows.map(serializeProject) }
}

export async function getProjectForCurrentUser(
  projectId: string
): Promise<ProjectDetail> {
  const user = await requireUser()
  const row = await getOwnedProject(user.id, projectId)
  return serializeProjectDetail(row, user.id)
}

export async function createProjectForCurrentUser(data: {
  name: string
}): Promise<ProjectDetail> {
  requireAppOrigin()
  const user = await requireUser()
  const createdAt = now()

  const [created] = await db
    .insert(aiVideoProjects)
    .values({
      id: uuid(),
      userId: user.id,
      name: cleanProjectName(data.name),
      // New projects start empty and vertical (9:16), the common short-form case.
      timeline: createEmptyTimeline(),
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!created) {
    throw new Error("Project was not created")
  }

  return serializeProjectDetail(created, user.id)
}

export async function renameProjectForCurrentUser(
  projectId: string,
  name: string
): Promise<ProjectItem> {
  requireAppOrigin()
  const user = await requireUser()

  const [row] = await db
    .update(aiVideoProjects)
    .set({ name: cleanProjectName(name), updatedAt: now() })
    .where(
      and(
        eq(aiVideoProjects.id, projectId),
        eq(aiVideoProjects.userId, user.id)
      )
    )
    .returning()

  if (!row) {
    throw new Error("Project not found")
  }

  return serializeProject(row)
}

// The one timeline write path. Compare-and-swap: the update only lands while
// the project is still at `expectedVersion`, so a save built on a stale copy
// (a second tab, or a server-side writer that read earlier) is rejected
// instead of overwriting newer work. Every writer must go through this.
// Ownership is enforced here via `userId`; callers own requireAppOrigin and
// requireUser, as with the other helpers in this module.
export async function writeProjectTimeline(
  userId: string,
  projectId: string,
  timeline: ProjectTimeline,
  expectedVersion: number
): Promise<AiVideoProject> {
  const normalizedTimeline = secureTimelineMediaUrls(
    requireCanonicalTimeline(timeline)
  )

  const [row] = await db
    .update(aiVideoProjects)
    .set({
      timeline: normalizedTimeline,
      version: expectedVersion + 1,
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoProjects.id, projectId),
        eq(aiVideoProjects.userId, userId),
        eq(aiVideoProjects.version, expectedVersion)
      )
    )
    .returning()

  if (row) {
    return row
  }

  // Nothing updated — either the project is gone (or not ours), or it moved
  // past the version this write was based on. Only the second is a conflict.
  const [existing] = await db
    .select({ id: aiVideoProjects.id })
    .from(aiVideoProjects)
    .where(
      and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, userId))
    )
    .limit(1)

  throw new Error(existing ? PROJECT_CONFLICT_MESSAGE : "Project not found")
}

export async function saveProjectTimelineForCurrentUser(
  projectId: string,
  timeline: ProjectTimeline,
  expectedVersion: number
): Promise<ProjectItem> {
  requireAppOrigin()
  const user = await requireUser()
  const row = await writeProjectTimeline(
    user.id,
    projectId,
    timeline,
    expectedVersion
  )
  return serializeProject(row)
}

export async function deleteProjectForCurrentUser(
  projectId: string
): Promise<{ projectId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  await getOwnedProject(user.id, projectId)
  await deleteOwnedProjectMedia(user.id, [projectId])

  await db
    .delete(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.id, projectId),
        eq(aiVideoProjects.userId, user.id)
      )
    )

  return { projectId }
}

export async function deleteProjectsForCurrentUser(
  projectIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(projectIds))
  if (!uniqueIds.length) {
    return { deletedCount: 0 }
  }

  const ownedProjects = await db
    .select({ id: aiVideoProjects.id })
    .from(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.userId, user.id),
        inArray(aiVideoProjects.id, uniqueIds)
      )
    )
  const ownedIds = ownedProjects.map((project) => project.id)
  if (!ownedIds.length) {
    return { deletedCount: 0 }
  }

  await deleteOwnedProjectMedia(user.id, ownedIds)

  const rows = await db
    .delete(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.userId, user.id),
        inArray(aiVideoProjects.id, ownedIds)
      )
    )
    .returning({ id: aiVideoProjects.id })

  return { deletedCount: rows.length }
}
