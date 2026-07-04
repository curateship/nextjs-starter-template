import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteOwnedProjectMedia } from "@/server/media"
import { mediaFileUrl } from "@/server/media-urls"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoProjects, type AiVideoProject } from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import {
  createEmptyTimeline,
  parseTimelineForReset,
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
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function serializeProject(row: AiVideoProject): ProjectItem {
  const { timeline, error } = parseTimelineForReset(row.timeline)
  return serializeProjectFromTimeline(row, timeline, error)
}

function serializeProjectDetail(row: AiVideoProject): ProjectDetail {
  const { timeline, error } = parseTimelineForReset(row.timeline)
  return {
    ...serializeProjectFromTimeline(row, timeline, error),
    timeline: secureTimelineMediaUrls(timeline),
  }
}

export function secureTimelineMediaUrls(
  timeline: ProjectTimeline
): ProjectTimeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.mediaId ? { ...clip, url: mediaFileUrl(clip.mediaId) } : clip
      ),
    })),
  }
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
  return serializeProjectDetail(row)
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

  return serializeProjectDetail(created)
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

export async function saveProjectTimelineForCurrentUser(
  projectId: string,
  timeline: ProjectTimeline
): Promise<ProjectItem> {
  requireAppOrigin()
  const user = await requireUser()
  const normalizedTimeline = secureTimelineMediaUrls(
    requireCanonicalTimeline(timeline)
  )

  const [row] = await db
    .update(aiVideoProjects)
    .set({ timeline: normalizedTimeline, updatedAt: now() })
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
