import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteOwnedProjectMedia } from "@/server/media"
import { mediaFileUrl } from "@/server/media-urls"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoProjects, type AiVideoProject } from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import { normalizeTimelineTextFonts } from "@/lib/timeline-normalization"
import type {
  AspectRatio,
  EditorTrack,
} from "@/pages/video-editor/editor-store"

// Serialized editor state stored in the project's `timeline` jsonb column.
export type ProjectTimeline = {
  tracks: EditorTrack[]
  aspect: AspectRatio
}

// Dashboard list rows — no timeline payload over the wire, just derived stats.
export type ProjectItem = {
  id: string
  name: string
  template_id: string | null
  project_type: "regular" | "template"
  clip_count: number
  duration_ms: number
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

// New projects start empty and vertical (9:16) — this is a short-form reel
// app, so portrait is the common case and the editor's preview fills the stage
// instead of letterboxing a vertical clip into a wide frame.
const EMPTY_TIMELINE: ProjectTimeline = { tracks: [], aspect: "9:16" }

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
export function summarizeTimeline(timeline: unknown) {
  let clipCount = 0
  let durationMs = 0
  const tracks = (timeline as ProjectTimeline | null)?.tracks
  if (Array.isArray(tracks)) {
    for (const track of tracks) {
      if (!Array.isArray(track?.clips)) continue
      for (const clip of track.clips) {
        clipCount += 1
        durationMs = Math.max(
          durationMs,
          (clip.startMs ?? 0) + (clip.durationMs ?? 0)
        )
      }
    }
  }
  return { clipCount, durationMs }
}

function serializeProject(row: AiVideoProject): ProjectItem {
  const stats = summarizeTimeline(row.timeline)
  return {
    id: row.id,
    name: row.name,
    template_id: row.templateId,
    project_type: row.templateId ? "template" : "regular",
    clip_count: stats.clipCount,
    duration_ms: stats.durationMs,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function serializeProjectDetail(row: AiVideoProject): ProjectDetail {
  return {
    ...serializeProject(row),
    timeline: secureTimelineMediaUrls(
      normalizeTimelineTextFonts(
        (row.timeline as ProjectTimeline | null) ?? EMPTY_TIMELINE
      )
    ),
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
      timeline: EMPTY_TIMELINE,
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
    normalizeTimelineTextFonts(timeline)
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
