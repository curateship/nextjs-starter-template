import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoMedia,
  aiVideoProjects,
  aiVideoTemplates,
  aiVideoViralVideos,
  type AiVideoTemplate,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import { summarizeTimeline, type ProjectTimeline } from "@/server/video-projects"
import type { ViralVideoAnalysis } from "@/server/video-analysis"
import type { EditorClip } from "@/pages/video-editor/editor-store"

// Scenes shorter than this make useless template slots and are skipped.
const MIN_SLOT_MS = 100

// Dashboard list rows — the timeline stays out of the list payload.
export type TemplateItem = {
  id: string
  name: string
  source_viral_video_id: string | null
  thumbnail_url: string | null
  slot_count: number
  duration_ms: number
  created_at: string
  updated_at: string
}

export type TemplateListResponse = {
  templates: TemplateItem[]
}

// Owned-row lookup; throws when the template doesn't exist or isn't the user's.
async function getOwnedTemplate(userId: string, templateId: string) {
  const [row] = await db
    .select()
    .from(aiVideoTemplates)
    .where(
      and(
        eq(aiVideoTemplates.id, templateId),
        eq(aiVideoTemplates.userId, userId)
      )
    )
    .limit(1)

  if (!row) {
    throw new Error("Template not found")
  }

  return row
}

function cleanTemplateName(value: string) {
  const name = value.trim()
  if (!name) {
    throw new Error("Template name is required")
  }
  return name.slice(0, 255)
}

// Slots are the replaceable clips only — the audio bed track doesn't count.
function countTemplateSlots(timeline: unknown) {
  const tracks = (timeline as ProjectTimeline | null)?.tracks
  if (!Array.isArray(tracks)) return 0
  let slots = 0
  for (const track of tracks) {
    if (!Array.isArray(track?.clips)) continue
    for (const clip of track.clips) {
      if (clip.replaceable) slots += 1
    }
  }
  return slots
}

function serializeTemplate(
  row: AiVideoTemplate,
  thumbnailStoragePath: string | null = null
): TemplateItem {
  const stats = summarizeTimeline(row.timeline)
  return {
    id: row.id,
    name: row.name,
    source_viral_video_id: row.sourceViralVideoId,
    thumbnail_url: thumbnailStoragePath
      ? getPublicMediaUrl(thumbnailStoragePath)
      : null,
    slot_count: countTemplateSlots(row.timeline),
    duration_ms: stats.durationMs,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listTemplatesForCurrentUser(): Promise<TemplateListResponse> {
  const user = await requireUser()
  const rows = await db
    .select({
      template: aiVideoTemplates,
      thumbnailStoragePath: aiVideoViralVideos.thumbnailStoragePath,
    })
    .from(aiVideoTemplates)
    .leftJoin(
      aiVideoViralVideos,
      eq(aiVideoTemplates.sourceViralVideoId, aiVideoViralVideos.id)
    )
    .where(eq(aiVideoTemplates.userId, user.id))
    .orderBy(desc(aiVideoTemplates.createdAt))

  return {
    templates: rows.map((r) =>
      serializeTemplate(r.template, r.thumbnailStoragePath ?? null)
    ),
  }
}

// Turns an analyzed viral video into a template: the timeline is the original
// reel cut into its detected scenes, every slot replaceable in the editor
// (CapCut behavior) with durations locked to the original pacing.
export async function createTemplateFromViralVideoForCurrentUser(
  videoId: string,
  name: string
): Promise<TemplateItem> {
  requireAppOrigin()
  const user = await requireUser()

  const [video] = await db
    .select()
    .from(aiVideoViralVideos)
    .where(
      and(
        eq(aiVideoViralVideos.id, videoId),
        eq(aiVideoViralVideos.userId, user.id)
      )
    )
    .limit(1)
  if (!video) {
    throw new Error("Video not found")
  }

  const analysis = video.analysis as ViralVideoAnalysis | null
  if (video.status !== "ready" || !analysis || !video.mediaId) {
    throw new Error("Video analysis is not ready")
  }

  const [media] = await db
    .select()
    .from(aiVideoMedia)
    .where(
      and(eq(aiVideoMedia.id, video.mediaId), eq(aiVideoMedia.userId, user.id))
    )
    .limit(1)
  if (!media) {
    throw new Error("Video analysis is not ready")
  }

  const timeline = buildTemplateTimeline(
    analysis,
    video.mediaId,
    getPublicMediaUrl(media.storagePath),
    video.durationMs
  )

  const createdAt = now()
  const [created] = await db
    .insert(aiVideoTemplates)
    .values({
      id: uuid(),
      userId: user.id,
      name: cleanTemplateName(name),
      sourceViralVideoId: video.id,
      timeline,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!created) {
    throw new Error("Template was not created")
  }

  return serializeTemplate(created)
}

export async function renameTemplateForCurrentUser(
  templateId: string,
  name: string
): Promise<TemplateItem> {
  requireAppOrigin()
  const user = await requireUser()

  const [row] = await db
    .update(aiVideoTemplates)
    .set({ name: cleanTemplateName(name), updatedAt: now() })
    .where(
      and(
        eq(aiVideoTemplates.id, templateId),
        eq(aiVideoTemplates.userId, user.id)
      )
    )
    .returning()

  if (!row) {
    throw new Error("Template not found")
  }

  return serializeTemplate(row)
}

export async function deleteTemplateForCurrentUser(
  templateId: string
): Promise<{ templateId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  await getOwnedTemplate(user.id, templateId)

  await db
    .delete(aiVideoTemplates)
    .where(
      and(
        eq(aiVideoTemplates.id, templateId),
        eq(aiVideoTemplates.userId, user.id)
      )
    )

  return { templateId }
}

export async function deleteTemplatesForCurrentUser(
  templateIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(templateIds))
  const rows = await db
    .delete(aiVideoTemplates)
    .where(
      and(
        eq(aiVideoTemplates.userId, user.id),
        inArray(aiVideoTemplates.id, uniqueIds)
      )
    )
    .returning({ id: aiVideoTemplates.id })

  return { deletedCount: rows.length }
}

// "Use template": copy the template timeline into a fresh project the editor
// opens; the slots stay replaceable there.
export async function createProjectFromTemplateForCurrentUser(
  templateId: string
): Promise<{ projectId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const template = await getOwnedTemplate(user.id, templateId)
  const createdAt = now()

  const [created] = await db
    .insert(aiVideoProjects)
    .values({
      id: uuid(),
      userId: user.id,
      name: template.name,
      // Remembered so the script writer can reach the source reel's analysis.
      templateId: template.id,
      timeline: template.timeline,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!created) {
    throw new Error("Project was not created")
  }

  return { projectId: created.id }
}

// One video track of slot clips: each detected scene becomes a clip trimmed
// into the same downloaded media file (trimStartMs = scene start), labeled
// with the narrative role active during that scene.
function buildTemplateTimeline(
  analysis: ViralVideoAnalysis,
  mediaId: string,
  mediaUrl: string,
  videoDurationMs: number | null
): ProjectTimeline {
  const ranges = analysis.scenes.length ? analysis.scenes : analysis.segments
  const usable = ranges.filter(
    (range) => range.endMs - range.startMs >= MIN_SLOT_MS
  )
  const lastEndMs = usable.length ? usable[usable.length - 1].endMs : 0
  const sourceDurationMs = videoDurationMs ?? lastEndMs

  const clips: EditorClip[] = usable.map((range) => ({
    id: uuid(),
    kind: "video",
    name: roleAt(analysis, range) ?? "Clip",
    startMs: range.startMs,
    durationMs: range.endMs - range.startMs,
    trimStartMs: range.startMs,
    mediaId,
    url: mediaUrl,
    sourceDurationMs,
    replaceable: true,
    segmentLabel: roleAt(analysis, range) ?? undefined,
  }))

  // The original soundtrack lives on its own track, spanning the whole reel.
  // The video track is muted so audio doesn't play twice — and so the original
  // sound bed survives when slots are replaced with the user's own footage.
  const audioClip: EditorClip = {
    id: uuid(),
    kind: "audio",
    name: "Original Audio",
    startMs: 0,
    durationMs: sourceDurationMs,
    trimStartMs: 0,
    mediaId,
    url: mediaUrl,
    sourceDurationMs,
  }

  return {
    tracks: [
      { id: uuid(), muted: true, clips },
      { id: uuid(), muted: false, clips: [audioClip] },
    ],
    // Reels are vertical.
    aspect: "9:16",
  }
}

// The narrative role covering a scene's midpoint, capitalized for display.
function roleAt(
  analysis: ViralVideoAnalysis,
  range: { startMs: number; endMs: number }
) {
  const midpoint = (range.startMs + range.endMs) / 2
  const segment = analysis.segments.find(
    (candidate) => midpoint >= candidate.startMs && midpoint < candidate.endMs
  )
  if (!segment) return null
  return segment.role === "cta"
    ? "CTA"
    : segment.role.charAt(0).toUpperCase() + segment.role.slice(1)
}
