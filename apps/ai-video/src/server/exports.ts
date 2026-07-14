import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import { z } from "zod"

import { DEFAULT_ACTOR_MODEL } from "@/lib/actor-models"
import {
  EXPORT_CAPTION_MAX_LENGTH,
  EXPORT_TITLE_MAX_LENGTH,
} from "@/lib/export-constraints"
import { getTextFont } from "@/lib/text-fonts"
import { db } from "@/server/db"
import {
  projectRenderThumbnailUrl,
  projectRenderThumbnailVersion,
} from "@/server/media-urls"
import {
  bodyToBytes,
  deleteFromR2,
  getFromR2,
  uploadToR2,
} from "@/server/media-storage"
import {
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "@/lib/timeline-schema"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoProjects, type AiVideoProject } from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import { generateJson } from "@/server/video-analysis"
import { ANALYSIS_MODEL } from "@/server/video-analysis"
import { getCurrentWorkspaceBrandKit } from "@/server/workspaces"
import type { EditorClip } from "@/pages/video-editor/editor-store"
import { generateActorImage } from "@/server/actor-actions"

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

export type ExportCoverFrame = {
  time_seconds: number
  image_data_url: string
}

export type ExportCoverFramesResult = {
  duration_seconds: number
  frames: ExportCoverFrame[]
}

export type GenerateExportCoverInput = {
  prompt: string
  referenceTimeSeconds?: number
  titleText: string
}

const COVER_FILMSTRIP_FRAME_COUNT = 10

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
      ? projectRenderThumbnailUrl(
          row.id,
          projectRenderThumbnailVersion(row.renderedAt, row.updatedAt)
        )
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
      "Description generation",
      {
        userId: user.id,
        action: {
          provider: "gemini",
          feature: "export_description",
          model: ANALYSIS_MODEL,
        },
      }
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

export async function getExportCoverFramesForCurrentUser(
  projectId: string
): Promise<ExportCoverFramesResult> {
  const user = await requireUser()
  const project = await getReadyExport(user.id, projectId)

  return withExportVideoFile(project, async (inputPath, dir) => {
    const duration = await probeVideoDuration(inputPath)
    const outputPattern = path.join(dir, "frame-%02d.jpg")
    await runCoverCommand("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `fps=${Math.max(COVER_FILMSTRIP_FRAME_COUNT / duration, 0.01)},scale=320:-2`,
      "-frames:v",
      String(COVER_FILMSTRIP_FRAME_COUNT),
      "-q:v",
      "5",
      outputPattern,
    ])
    const files = (await readdir(dir))
      .filter((file) => /^frame-\d+\.jpg$/.test(file))
      .sort()

    if (!files.length) {
      throw new Error("Cover frame extraction failed")
    }

    return {
      duration_seconds: duration,
      frames: await Promise.all(
        files.map(async (file, index) => ({
          time_seconds: Math.min(
            duration,
            (index * duration) / COVER_FILMSTRIP_FRAME_COUNT
          ),
          image_data_url: `data:image/jpeg;base64,${(
            await readFile(path.join(dir, file))
          ).toString("base64")}`,
        }))
      ),
    }
  })
}

export async function getExportCoverFrameForCurrentUser(
  projectId: string,
  timeSeconds: number
): Promise<ExportCoverFrame> {
  const user = await requireUser()
  const project = await getReadyExport(user.id, projectId)

  return withExportVideoFile(project, async (inputPath, dir) => {
    const duration = await probeVideoDuration(inputPath)
    const time = clampCoverTime(timeSeconds, duration)
    const outputPath = path.join(dir, "selected.jpg")
    await extractCoverFrame(inputPath, outputPath, time, 640)
    return {
      time_seconds: time,
      image_data_url: `data:image/jpeg;base64,${(
        await readFile(outputPath)
      ).toString("base64")}`,
    }
  })
}

export async function saveExportFrameCoverForCurrentUser(
  projectId: string,
  timeSeconds: number
): Promise<ExportItem> {
  requireAppOrigin()
  const user = await requireUser()
  const project = await getReadyExport(user.id, projectId)
  const bytes = await withExportVideoFile(project, async (inputPath, dir) => {
    const duration = await probeVideoDuration(inputPath)
    const outputPath = path.join(dir, "cover.jpg")
    await extractCoverFrame(
      inputPath,
      outputPath,
      clampCoverTime(timeSeconds, duration)
    )
    return readFile(outputPath)
  })

  return replaceExportCover(project, bytes, "image/jpeg")
}

export async function generateExportCoverForCurrentUser(
  projectId: string,
  input: GenerateExportCoverInput
): Promise<ExportItem> {
  requireAppOrigin()
  const user = await requireUser()
  const project = await getReadyExport(user.id, projectId)
  const prompt = input.prompt.trim()
  if (!prompt) {
    throw new Error("Cover prompt is required")
  }

  let referencePath: string | null = null
  try {
    const referenceTimeSeconds = input.referenceTimeSeconds
    if (referenceTimeSeconds !== undefined) {
      const referenceBytes = await withExportVideoFile(
        project,
        async (inputPath, dir) => {
          const duration = await probeVideoDuration(inputPath)
          const outputPath = path.join(dir, "reference.jpg")
          await extractCoverFrame(
            inputPath,
            outputPath,
            clampCoverTime(referenceTimeSeconds, duration)
          )
          return readFile(outputPath)
        }
      )
      referencePath = `render-cover-references/${user.id}/${project.id}-${uuid()}.jpg`
      await uploadToR2(referencePath, referenceBytes, "image/jpeg")
    }

    const aspect = requireCanonicalTimeline(project.timeline).aspect
    const image = await generateActorImage(
      user.id,
      `Create a polished ${aspect} social video cover image. ${prompt}\nDo not add words, captions, logos, watermarks, or interface elements.`,
      DEFAULT_ACTOR_MODEL,
      referencePath
        ? { storagePath: referencePath, mimeType: "image/jpeg" }
        : null
    )
    const title = input.titleText.trim()
    const finalImage = title
      ? {
          bytes: await stampCoverTitle(
            image.bytes,
            image.mimeType,
            title,
            await getCurrentWorkspaceBrandKit(user.id)
          ),
          mimeType: "image/png",
        }
      : image

    return replaceExportCover(project, finalImage.bytes, finalImage.mimeType)
  } finally {
    if (referencePath) {
      await deleteFromR2(referencePath).catch(() => undefined)
    }
  }
}

function descriptionPrompt(project: AiVideoProject, ctaPhrases: string[]) {
  const timeline = requireCanonicalTimeline(project.timeline)
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
        isNotNull(aiVideoProjects.renderStoragePath),
        isNotNull(aiVideoProjects.renderedAt)
      )
    )
}

async function getReadyExport(userId: string, projectId: string) {
  const [project] = await readyExportRowsForUser(userId, [projectId])
  if (!project) {
    throw new Error("Export not found")
  }
  return project
}

async function withExportVideoFile<T>(
  project: AiVideoProject,
  run: (inputPath: string, dir: string) => Promise<T>
) {
  if (!project.renderStoragePath) {
    throw new Error("Export not found")
  }
  const dir = await mkdtemp(path.join(tmpdir(), "export-cover-"))
  const inputPath = path.join(dir, "render.mp4")
  try {
    const object = await getFromR2(project.renderStoragePath)
    await writeFile(inputPath, await bodyToBytes(object.Body))
    return await run(inputPath, dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function replaceExportCover(
  project: AiVideoProject,
  bytes: Uint8Array,
  mimeType: string
) {
  if (!project.renderedAt) {
    throw new Error("Export not found")
  }
  const extension = mimeType === "image/png" ? "png" : "jpg"
  const storagePath = `render-thumbnails/${project.userId}/${project.id}-${uuid()}.${extension}`
  await uploadToR2(storagePath, bytes, mimeType)

  let updated: AiVideoProject | undefined
  try {
    const rows = await db
      .update(aiVideoProjects)
      .set({ renderThumbnailStoragePath: storagePath, updatedAt: now() })
      .where(
        and(
          eq(aiVideoProjects.id, project.id),
          eq(aiVideoProjects.userId, project.userId),
          eq(aiVideoProjects.renderStatus, "ready"),
          isNotNull(aiVideoProjects.renderStoragePath),
          eq(aiVideoProjects.renderedAt, project.renderedAt),
          project.renderThumbnailStoragePath
            ? eq(
                aiVideoProjects.renderThumbnailStoragePath,
                project.renderThumbnailStoragePath
              )
            : isNull(aiVideoProjects.renderThumbnailStoragePath)
        )
      )
      .returning()
    updated = rows[0]
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }

  if (!updated) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw new Error("Export not found")
  }
  if (
    project.renderThumbnailStoragePath &&
    project.renderThumbnailStoragePath !== storagePath
  ) {
    await deleteFromR2(project.renderThumbnailStoragePath).catch(
      () => undefined
    )
  }
  return serializeExport(updated)
}

async function probeVideoDuration(inputPath: string) {
  const output = await runCoverCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ])
  const duration = Number(output)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Cover frame extraction failed")
  }
  return duration
}

async function extractCoverFrame(
  inputPath: string,
  outputPath: string,
  timeSeconds: number,
  maxWidth?: number
) {
  await runCoverCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ss",
    timeSeconds.toFixed(3),
    "-frames:v",
    "1",
    ...(maxWidth ? ["-vf", `scale=${maxWidth}:-2`] : []),
    "-q:v",
    "4",
    outputPath,
  ])
}

function clampCoverTime(timeSeconds: number, duration: number) {
  return Math.max(0, Math.min(timeSeconds, Math.max(0, duration - 0.05)))
}

async function stampCoverTitle(
  bytes: Uint8Array,
  mimeType: string,
  title: string,
  brandKit: Awaited<ReturnType<typeof getCurrentWorkspaceBrandKit>>
) {
  const dir = await mkdtemp(path.join(tmpdir(), "cover-title-"))
  const inputPath = path.join(
    dir,
    mimeType === "image/png" ? "input.png" : "input.jpg"
  )
  try {
    await writeFile(inputPath, bytes)
    const sizeOutput = await runCoverCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      inputPath,
    ])
    const [width, height] = sizeOutput.trim().split("x").map(Number)
    if (!width || !height) {
      throw new Error("Cover generation failed")
    }

    const font = getTextFont(brandKit.fonts.heading)
    const fontFile = path.join(COVER_FONT_DIR, font.fileName)
    if (!existsSync(fontFile)) {
      throw new Error("Cover font is missing on the server")
    }
    const fontSize = Math.max(
      height * 0.035,
      Math.min(height * 0.09, (width * 0.84) / (title.length * font.widthRatio))
    )
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <image href="data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${height * 0.004}" stdDeviation="${height * 0.008}" flood-color="#000000" flood-opacity="0.75"/></filter>
  <text x="${width / 2}" y="${height * 0.84}" text-anchor="middle" filter="url(#shadow)" font-family="${escapeXml(font.family)}" font-weight="${font.weight}" font-size="${fontSize}" fill="${brandKit.captionStyle.color}">${escapeXml(title)}</text>
</svg>`
    const { Resvg } = loadCoverResvg()
    return new Resvg(svg, {
      font: {
        fontFiles: [fontFile],
        loadSystemFonts: false,
        defaultFontFamily: font.family,
      },
    })
      .render()
      .asPng()
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function runCoverCommand(command: "ffmpeg" | "ffprobe", args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { timeout: 30_000 })
    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.on("error", () => reject(new Error("Cover frame extraction failed")))
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error("Cover frame extraction failed"))
    })
  })
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    }
    return entities[character] ?? character
  })
}

const COVER_FONT_DIR = path.join(
  fileURLToPath(new URL("../../public", import.meta.url)),
  "fonts"
)
const requireCoverNative = createRequire(import.meta.url)
function loadCoverResvg() {
  return requireCoverNative(
    "@resvg/resvg-js"
  ) as typeof import("@resvg/resvg-js")
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
