import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { copyR2Object, deleteFromR2 } from "@/server/media-storage"
import {
  creatorAvatarUrl,
  mediaFileUrl,
  templateThumbnailUrl,
} from "@/server/media-urls"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoCreators,
  aiVideoMedia,
  aiVideoProjects,
  aiVideoTemplates,
  aiVideoViralVideos,
  type AiVideoCreator,
  type AiVideoMedia,
  type AiVideoTemplate,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import {
  createEmptyTimeline,
  parseTimelineForReset,
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "@/lib/timeline-schema"
import {
  cleanProjectName,
  secureTimelineMediaUrls,
  summarizeTimeline,
} from "@/server/video-projects"
import type { ViralVideoAnalysis } from "@/server/video-analysis"
import type { EditorClip } from "@/pages/video-editor/editor-store"

// Scenes shorter than this make useless template slots and are skipped.
const MIN_SLOT_MS = 100

// Dashboard list rows — the timeline stays out of the list payload.
export type TemplateSourceType = "analyzed" | "blank"
export type TemplateStructureTag =
  | "Analyzed"
  | "Blank"
  | "Structured"
  | "Hook"
  | "Problem"
  | "Agitation"
  | "Solution"
  | "Proof"
  | "CTA"
  | "Other"

export type TemplateItem = {
  id: string
  name: string
  source_viral_video_id: string | null
  source_type: TemplateSourceType
  structure_tags: TemplateStructureTag[]
  thumbnail_url: string | null
  slot_count: number
  duration_ms: number
  timeline_error: string | null
  // Author chip shown on the gallery card (from the source reel's creator).
  creator: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
  created_at: string
  updated_at: string
}

export type TemplateListResponse = {
  templates: TemplateItem[]
}

// Editor payload: just what EditorProvider needs to mount on a template's
// timeline (same shape as a project's, so the editor is reused as-is).
export type TemplateDetail = {
  id: string
  name: string
  source_viral_video_id: string | null
  source_type: TemplateSourceType
  structure_tags: TemplateStructureTag[]
  thumbnail_url: string | null
  timeline_error: string | null
  timeline: ProjectTimeline
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
function countTemplateSlots(timeline: ProjectTimeline) {
  let slots = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.replaceable) slots += 1
    }
  }
  return slots
}

function normalizeStructureLabel(value: unknown): TemplateStructureTag | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === "cta") return "CTA"
  if (normalized === "hook") return "Hook"
  if (normalized === "problem") return "Problem"
  if (normalized === "agitation") return "Agitation"
  if (normalized === "solution") return "Solution"
  if (normalized === "proof") return "Proof"
  if (normalized === "other") return "Other"
  return null
}

function deriveStructureTags(
  timeline: ProjectTimeline,
  sourceViralVideoId: string | null
): TemplateStructureTag[] {
  const tags = new Set<TemplateStructureTag>()
  tags.add(sourceViralVideoId ? "Analyzed" : "Blank")

  let replaceableSlots = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (!clip.replaceable) continue
      replaceableSlots += 1
      const tag = normalizeStructureLabel(clip.segmentLabel)
      tags.add(tag ?? "Other")
    }
  }

  if (replaceableSlots > 0) tags.add("Structured")
  return Array.from(tags)
}

function serializeTemplate(
  row: AiVideoTemplate,
  creator: AiVideoCreator | null = null
): TemplateItem {
  const { timeline, error } = parseTimelineForReset(row.timeline)
  const stats = summarizeTimeline(timeline)
  return {
    id: row.id,
    name: row.name,
    source_viral_video_id: row.sourceViralVideoId,
    source_type: row.sourceViralVideoId ? "analyzed" : "blank",
    structure_tags: deriveStructureTags(timeline, row.sourceViralVideoId),
    thumbnail_url: row.thumbnailStoragePath
      ? templateThumbnailUrl(row.id, row.updatedAt)
      : null,
    slot_count: countTemplateSlots(timeline),
    duration_ms: stats.durationMs,
    timeline_error: error,
    creator: creator
      ? {
          username: creator.username,
          display_name: creator.displayName,
          avatar_url: creator.avatarStoragePath
            ? creatorAvatarUrl(creator.id, creator.updatedAt)
            : null,
        }
      : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listTemplatesForCurrentUser(): Promise<TemplateListResponse> {
  const user = await requireUser()
  const rows = await db
    .select({
      template: aiVideoTemplates,
      creator: aiVideoCreators,
    })
    .from(aiVideoTemplates)
    .leftJoin(
      aiVideoViralVideos,
      eq(aiVideoTemplates.sourceViralVideoId, aiVideoViralVideos.id)
    )
    // Source reel → its creator, for the gallery card's author chip.
    .leftJoin(
      aiVideoCreators,
      eq(aiVideoViralVideos.creatorId, aiVideoCreators.id)
    )
    .where(eq(aiVideoTemplates.userId, user.id))
    .orderBy(desc(aiVideoTemplates.createdAt))

  return {
    templates: rows.map((r) => serializeTemplate(r.template, r.creator)),
  }
}

// Load a template's timeline for the editor (Edit Template). Same payload the
// project editor uses, so EditorProvider mounts on it unchanged.
export async function getTemplateForEditingForCurrentUser(
  templateId: string
): Promise<TemplateDetail> {
  const user = await requireUser()
  const row = await getOwnedTemplate(user.id, templateId)
  const { timeline, error } = parseTimelineForReset(row.timeline)
  return {
    id: row.id,
    name: row.name,
    source_viral_video_id: row.sourceViralVideoId,
    source_type: row.sourceViralVideoId ? "analyzed" : "blank",
    structure_tags: deriveStructureTags(timeline, row.sourceViralVideoId),
    thumbnail_url: row.thumbnailStoragePath
      ? templateThumbnailUrl(row.id, row.updatedAt)
      : null,
    timeline_error: error,
    timeline: secureTimelineMediaUrls(timeline),
  }
}

export async function setTemplateCoverForCurrentUser(
  templateId: string,
  mediaId: string | null
): Promise<{ templateId: string; thumbnail_url: string | null }> {
  requireAppOrigin()
  const user = await requireUser()
  const template = await getOwnedTemplate(user.id, templateId)
  if (!mediaId) {
    await db
      .update(aiVideoTemplates)
      .set({ thumbnailStoragePath: null, updatedAt: now() })
      .where(
        and(
          eq(aiVideoTemplates.id, template.id),
          eq(aiVideoTemplates.userId, user.id)
        )
      )

    if (template.thumbnailStoragePath) {
      await deleteFromR2(template.thumbnailStoragePath).catch(() => undefined)
    }

    return { templateId: template.id, thumbnail_url: null }
  }

  const [media] = await db
    .select()
    .from(aiVideoMedia)
    .where(and(eq(aiVideoMedia.id, mediaId), eq(aiVideoMedia.userId, user.id)))
    .limit(1)

  if (!media) {
    throw new Error("Media not found")
  }
  if (media.fileType !== "image") {
    throw new Error("Template cover must be an image")
  }

  const ext = media.storagePath.split(".").pop() || "jpg"
  const thumbnailStoragePath = `templates/${user.id}/${template.id}/cover-${media.id}.${ext}`
  await copyR2Object(media.storagePath, thumbnailStoragePath)
  const updatedAt = now()

  try {
    await db
      .update(aiVideoTemplates)
      .set({ thumbnailStoragePath, updatedAt })
      .where(
        and(
          eq(aiVideoTemplates.id, template.id),
          eq(aiVideoTemplates.userId, user.id)
        )
      )
  } catch (error) {
    await deleteFromR2(thumbnailStoragePath).catch(() => undefined)
    throw error
  }

  if (
    template.thumbnailStoragePath &&
    template.thumbnailStoragePath !== thumbnailStoragePath
  ) {
    await deleteFromR2(template.thumbnailStoragePath).catch(() => undefined)
  }

  return {
    templateId: template.id,
    thumbnail_url: templateThumbnailUrl(template.id, updatedAt),
  }
}

// Persist edits made to a template's timeline in the editor. Derived fields
// (slot_count, duration_ms) recompute from this on the next list load.
export async function saveTemplateTimelineForCurrentUser(
  templateId: string,
  timeline: ProjectTimeline
): Promise<{ templateId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const normalizedTimeline = secureTimelineMediaUrls(
    requireCanonicalTimeline(timeline)
  )

  const [row] = await db
    .update(aiVideoTemplates)
    .set({ timeline: normalizedTimeline, updatedAt: now() })
    .where(
      and(
        eq(aiVideoTemplates.id, templateId),
        eq(aiVideoTemplates.userId, user.id)
      )
    )
    .returning({ id: aiVideoTemplates.id })

  if (!row) {
    throw new Error("Template not found")
  }

  return { templateId: row.id }
}

// Copies the source reel's footage into a template-owned media object (R2 file
// + DB row) so the template's clips keep working after the reel is deleted.
async function copyMediaForTemplate(
  userId: string,
  templateId: string,
  source: AiVideoMedia
): Promise<AiVideoMedia> {
  const id = uuid()
  const ext = source.storagePath.split(".").pop() || "mp4"
  const storagePath = `templates/${userId}/${templateId}/${id}.${ext}`
  await copyR2Object(source.storagePath, storagePath)
  const ts = now()
  const [row] = await db
    .insert(aiVideoMedia)
    .values({
      id,
      userId,
      filename: source.filename,
      originalName: source.originalName,
      altText: source.altText,
      fileSize: source.fileSize,
      mimeType: source.mimeType,
      fileType: source.fileType,
      storagePath,
      projectId: null,
      source: "template",
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  return row
}

// Copies the source reel's thumbnail into a template-owned R2 object (display
// only — no media row). Returns the new storage path.
async function copyTemplateThumbnail(
  userId: string,
  templateId: string,
  sourcePath: string
): Promise<string> {
  const ext = sourcePath.split(".").pop() || "jpg"
  const storagePath = `templates/${userId}/${templateId}/thumbnail.${ext}`
  await copyR2Object(sourcePath, storagePath)
  return storagePath
}

// Best-effort cleanup of the copies above when the template insert fails, so a
// failure doesn't orphan R2 objects or a media row.
async function rollbackTemplateCopies(
  media: AiVideoMedia,
  thumbnailPath: string | null
) {
  await deleteFromR2(media.storagePath).catch(() => undefined)
  if (thumbnailPath) {
    await deleteFromR2(thumbnailPath).catch(() => undefined)
  }
  try {
    await db.delete(aiVideoMedia).where(eq(aiVideoMedia.id, media.id))
  } catch {
    // best effort
  }
}

// Turns an analyzed viral video into a template: the timeline is the original
// reel cut into its detected scenes, every slot replaceable in the editor
// (CapCut behavior) with durations locked to the original pacing. The footage
// and thumbnail are COPIED into template-owned storage so the template survives
// deletion of the source reel/creator.
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

  // Copy footage + thumbnail into template-owned storage before inserting, so
  // the template never depends on the source reel surviving.
  const templateId = uuid()
  const copiedMedia = await copyMediaForTemplate(user.id, templateId, media)
  const thumbnailStoragePath = video.thumbnailStoragePath
    ? await copyTemplateThumbnail(
        user.id,
        templateId,
        video.thumbnailStoragePath
      )
    : null

  const timeline = buildTemplateTimeline(
    analysis,
    copiedMedia.id,
    mediaFileUrl(copiedMedia.id),
    video.durationMs
  )

  const createdAt = now()
  let created: AiVideoTemplate
  try {
    const [row] = await db
      .insert(aiVideoTemplates)
      .values({
        id: templateId,
        userId: user.id,
        name: cleanTemplateName(name),
        sourceViralVideoId: video.id,
        thumbnailStoragePath,
        timeline,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    if (!row) {
      throw new Error("Template was not created")
    }
    created = row
  } catch (error) {
    await rollbackTemplateCopies(copiedMedia, thumbnailStoragePath)
    throw error
  }

  // Caller discards this and reloads the templates list (which re-derives the
  // creator chip from the join), so no creator lookup is needed here.
  return serializeTemplate(created)
}

// Create an empty template from scratch (no source reel). It opens in the
// editor for the user to build by hand — the counterpart to building one from
// an analyzed reel in the Viral Archive.
export async function createBlankTemplateForCurrentUser(
  name: string
): Promise<TemplateItem> {
  requireAppOrigin()
  const user = await requireUser()

  const createdAt = now()
  const [created] = await db
    .insert(aiVideoTemplates)
    .values({
      id: uuid(),
      userId: user.id,
      name: cleanTemplateName(name),
      timeline: createEmptyTimeline(),
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!created) {
    throw new Error("Template was not created")
  }

  // No source reel → no thumbnail or creator chip (the gallery shows a
  // placeholder icon until the user adds footage in the editor).
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
// opens; the slots stay replaceable there. The user names the project (the
// "Use" dialog), so the project isn't tied to the template's name.
export async function createProjectFromTemplateForCurrentUser(
  templateId: string,
  name: string
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
      name: cleanProjectName(name),
      // Remembered so the script writer can reach the source reel's analysis.
      templateId: template.id,
      timeline: secureTimelineMediaUrls(
        requireCanonicalTimeline(template.timeline)
      ),
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
