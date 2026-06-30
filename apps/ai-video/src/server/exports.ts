import { and, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { z } from "zod"

import {
  EXPORT_CAPTION_MAX_LENGTH,
  EXPORT_TITLE_MAX_LENGTH,
} from "@/lib/export-constraints"
import { db } from "@/server/db"
import { deleteFromR2 } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoProjects, type AiVideoProject } from "@/server/schema"
import { requireUser } from "@/server/security"
import { generateJson } from "@/server/video-analysis"
import { getCurrentWorkspaceBrandKit } from "@/server/workspaces"
import type { ProjectTimeline } from "@/server/video-projects"
import type { EditorClip } from "@/pages/video-editor/editor-store"

export type ExportItem = {
  id: string
  project_id: string
  name: string
  caption: string
  file_size: number | null
  thumbnail_url: string | null
  exported_at: string
}

export type ExportListResponse = {
  exports: ExportItem[]
}

export type ExportDescriptionResult = {
  description: string
}

export type ExportUpdateInput = {
  title: string
  caption: string
}

const descriptionSchema = z.object({
  description: z.string().min(1).max(EXPORT_CAPTION_MAX_LENGTH),
})

function serializeExport(row: AiVideoProject): ExportItem {
  const title = row.renderTitle?.trim() || row.name
  return {
    id: row.id,
    project_id: row.id,
    name: title,
    caption: row.renderCaption ?? "",
    file_size: row.renderFileSize,
    thumbnail_url: row.renderThumbnailStoragePath
      ? `/api/v1/projects/${row.id}/render-thumbnail?v=${encodeURIComponent(
          (row.renderedAt ?? row.updatedAt).toISOString()
        )}`
      : null,
    exported_at: (row.renderedAt ?? row.updatedAt).toISOString(),
  }
}

export async function listExportsForCurrentUser(): Promise<ExportListResponse> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.userId, user.id),
        eq(aiVideoProjects.renderStatus, "ready"),
        isNotNull(aiVideoProjects.renderStoragePath),
        isNotNull(aiVideoProjects.renderedAt)
      )
    )
    .orderBy(desc(aiVideoProjects.renderedAt))

  return { exports: rows.map(serializeExport) }
}

export async function getExportForCurrentUser(
  projectId: string
): Promise<ExportItem> {
  const user = await requireUser()
  const [row] = await readyExportRowsForUser(user.id, [projectId])
  if (!row) {
    throw new Error("Export not found")
  }
  return serializeExport(row)
}

export async function updateExportForCurrentUser(
  projectId: string,
  input: ExportUpdateInput
): Promise<ExportItem> {
  requireAppOrigin()
  const user = await requireUser()
  const title = cleanExportTitle(input.title)
  const caption = cleanExportCaption(input.caption)

  const [row] = await db
    .update(aiVideoProjects)
    .set({ renderTitle: title, renderCaption: caption })
    .where(
      and(
        eq(aiVideoProjects.id, projectId),
        eq(aiVideoProjects.userId, user.id),
        eq(aiVideoProjects.renderStatus, "ready"),
        isNotNull(aiVideoProjects.renderStoragePath)
      )
    )
    .returning()

  if (!row) {
    throw new Error("Export not found")
  }

  return serializeExport(row)
}

export async function deleteExportForCurrentUser(
  projectId: string
): Promise<{ projectId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const [row] = await readyExportRowsForUser(user.id, [projectId])
  if (!row) {
    throw new Error("Export not found")
  }

  await deleteExportObjects(row)
  await clearExportRows(user.id, [projectId])
  return { projectId }
}

export async function deleteExportsForCurrentUser(
  projectIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(projectIds))
  if (!uniqueIds.length) {
    return { deletedCount: 0 }
  }

  const rows = await readyExportRowsForUser(user.id, uniqueIds)
  if (!rows.length) {
    return { deletedCount: 0 }
  }

  for (const row of rows) {
    await deleteExportObjects(row)
  }

  const ids = rows.map((row) => row.id)
  await clearExportRows(user.id, ids)
  return { deletedCount: ids.length }
}

export async function generateExportDescriptionForCurrentUser(
  projectId: string
): Promise<ExportDescriptionResult> {
  requireAppOrigin()
  const user = await requireUser()
  const [project] = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.id, projectId),
        eq(aiVideoProjects.userId, user.id)
      )
    )
    .limit(1)

  if (
    !project ||
    project.renderStatus !== "ready" ||
    !project.renderStoragePath
  ) {
    throw new Error("Export not found")
  }

  try {
    const brandKit = await getCurrentWorkspaceBrandKit(user.id)
    const result = await generateJson(
      [{ text: descriptionPrompt(project, brandKit.ctaPhrases) }],
      descriptionSchema,
      "Description generation"
    )
    return { description: result.description.trim() }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Video analysis is not configured"
    ) {
      throw new Error("Description generation is not configured")
    }
    throw error
  }
}

function descriptionPrompt(project: AiVideoProject, ctaPhrases: string[]) {
  const timeline = project.timeline as ProjectTimeline
  const context = collectTimelineContext(timeline)
  const exportedAt = project.renderedAt?.toISOString() ?? "unknown"
  const title = project.renderTitle?.trim() || project.name

  return `You are writing a concise social video description for an exported video.

Export title: ${title}
Exported at: ${exportedAt}

Saved timeline context:
${context || "(No saved timeline text or clip names.)"}
${ctaPhrases.length ? `\nSaved CTA phrases:\n${ctaPhrases.map((phrase) => `- ${phrase}`).join("\n")}` : ""}

Return ONLY a JSON object with this exact shape:
{ "description": "..." }

Rules:
- Use the export title and saved timeline context only.
- Write 2-4 polished sentences suitable for a social post or video description.
- If a saved CTA phrase fits naturally, use or adapt one.
- Do not invent names, claims, URLs, or hashtags that are not supported by the context.
- If context is sparse, keep the description general and useful.`
}

function cleanExportTitle(value: string) {
  const title = value.trim()
  if (!title) {
    throw new Error("Export title is required")
  }
  return title.slice(0, EXPORT_TITLE_MAX_LENGTH)
}

function cleanExportCaption(value: string) {
  return value.trim().slice(0, EXPORT_CAPTION_MAX_LENGTH)
}

function readyExportRowsForUser(userId: string, projectIds: string[]) {
  return db
    .select()
    .from(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.userId, userId),
        inArray(aiVideoProjects.id, projectIds),
        eq(aiVideoProjects.renderStatus, "ready"),
        isNotNull(aiVideoProjects.renderStoragePath)
      )
    )
}

async function deleteExportObjects(row: AiVideoProject) {
  if (row.renderStoragePath) {
    await deleteFromR2(row.renderStoragePath)
  }

  if (row.renderThumbnailStoragePath) {
    await deleteFromR2(row.renderThumbnailStoragePath).catch((error) => {
      console.warn(
        "Failed to delete export thumbnail",
        row.renderThumbnailStoragePath,
        error
      )
    })
  }
}

async function clearExportRows(userId: string, projectIds: string[]) {
  await db
    .update(aiVideoProjects)
    .set({
      renderStatus: null,
      renderError: null,
      renderStoragePath: null,
      renderFileSize: null,
      renderThumbnailStoragePath: null,
      renderTitle: null,
      renderCaption: null,
      renderedAt: null,
    })
    .where(
      and(
        eq(aiVideoProjects.userId, userId),
        inArray(aiVideoProjects.id, projectIds)
      )
    )
}

function collectTimelineContext(timeline: ProjectTimeline) {
  const lines: { startMs: number; text: string }[] = []

  for (const track of timeline.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      const text = describeClip(clip)
      if (text) lines.push({ startMs: clip.startMs ?? 0, text })
    }
  }

  const unique = new Set<string>()
  return lines
    .sort((a, b) => a.startMs - b.startMs)
    .map((line) => line.text)
    .filter((line) => {
      const key = line.toLowerCase()
      if (unique.has(key)) return false
      unique.add(key)
      return true
    })
    .slice(0, 80)
    .join("\n")
    .slice(0, 8000)
}

function describeClip(clip: EditorClip) {
  if (clip.kind === "text") {
    const text = clip.text?.trim()
    return text ? `Text/caption: ${text.slice(0, 500)}` : null
  }

  const name = clip.name?.trim()
  if (!name) return null
  return `${clip.kind} clip: ${name.slice(0, 255)}`
}
