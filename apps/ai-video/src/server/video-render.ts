import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import {
  bodyToBytes,
  deleteFromR2,
  getFromR2,
  uploadToR2,
} from "@/server/media-storage"
import { getSoundEffect } from "@/lib/sound-effects"
import { requireTextFont } from "@/lib/text-fonts"
import {
  requireCanonicalTimeline,
  SAVED_TIMELINE_INVALID_MESSAGE,
} from "@/lib/timeline-schema"
import type { BrandKitConfig } from "@/lib/ai-video"
import { aiVideoMedia, aiVideoProjects } from "@/server/schema"
import { now } from "@/server/security"
import { extractVideoThumbnail } from "@/server/video-download"
import { getCurrentWorkspaceBrandKit } from "@/server/workspaces"
import type {
  AspectRatio,
  ClipWord,
  EditorClip,
  EditorTrack,
} from "@/pages/video-editor/editor-store"

// Exports run through the render_jobs queue (render-queue.ts): a bounded
// worker claims jobs and awaits renderProject. The project row's render_*
// columns mirror the latest render for the UI to poll.

// Output frame size per project aspect (the full-quality 1080-class size;
// lower qualities scale this down).
const RENDER_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
}

// Export quality: scales the 1080-class frame down and trades file size for
// fidelity via the x264 CRF (higher CRF = smaller file, lower quality).
export type RenderQuality = "high" | "medium" | "low"

const QUALITY_PRESETS: Record<RenderQuality, { scale: number; crf: number }> = {
  high: { scale: 1, crf: 18 }, // 1080p
  medium: { scale: 2 / 3, crf: 22 }, // ~720p
  low: { scale: 4 / 9, crf: 28 }, // ~480p
}

// h264 requires even dimensions.
function toEven(value: number) {
  return Math.max(2, Math.round(value / 2) * 2)
}

// Output frame size for an aspect at the chosen quality.
function renderSize(aspect: AspectRatio, quality: RenderQuality) {
  const base = RENDER_SIZES[aspect] ?? RENDER_SIZES["16:9"]
  const { scale } = QUALITY_PRESETS[quality]
  return {
    width: toEven(base.width * scale),
    height: toEven(base.height * scale),
  }
}

const OUTPUT_FPS = 30
// Text clips are authored against this height in the editor preview; export
// scales their font size by outputHeight / DESIGN_HEIGHT to match.
const DESIGN_HEIGHT = 1080
// Inactive karaoke words render at this opacity; the active word is full.
const KARAOKE_DIM = 0.5
// Hard caps so a runaway timeline can't pin the server.
export const MAX_TIMELINE_MS = 10 * 60_000
const RENDER_TIMEOUT_MS = 10 * 60_000

// render_error is shown in the UI, so only these known messages pass through
// verbatim — anything else (R2/SDK internals, ffmpeg stderr wrappers) is
// logged server-side and surfaced as the generic "Render failed".
const SAFE_RENDER_ERRORS = new Set([
  "Nothing to export",
  "Timeline too long to export",
  "A clip's media file no longer exists",
  "ffmpeg is not installed",
  SAVED_TIMELINE_INVALID_MESSAGE,
])

const PUBLIC_ASSET_DIR = fileURLToPath(new URL("../../public", import.meta.url))
const FONT_DIR = path.join(PUBLIC_ASSET_DIR, "fonts")

// Text overlays are rasterized from SVG with the same bundled fonts the browser
// preview loads. drawtext is not an option: current ffmpeg builds often ship
// without freetype.
function renderFontPath(fileName: string) {
  return path.join(FONT_DIR, fileName)
}

// @resvg/resvg-js is a native addon whose .node binary no bundler can inline —
// load it at runtime instead of importing it (prod servers must have it
// installed, like ffmpeg/yt-dlp).
const requireNative = createRequire(import.meta.url)
function loadResvg() {
  return requireNative("@resvg/resvg-js") as typeof import("@resvg/resvg-js")
}

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

// Latest clip end across all tracks — the export duration.
export function timelineEndMs(tracks: EditorTrack[]) {
  let max = 0
  for (const track of tracks) {
    for (const clip of track.clips ?? []) {
      max = Math.max(max, (clip.startMs ?? 0) + (clip.durationMs ?? 0))
    }
  }
  return max
}

// A clip flattened with its track's mute state; visual order is bottom-first
// (the preview stacks track 0 on top, so later overlays must win).
type RenderClip = { clip: EditorClip; muted: boolean }
type RenderWatermark = {
  file: string
  position: BrandKitConfig["watermark"]["position"]
  widthPercent: number
  opacity: number
}
type RenderEndCard = {
  logoFile: string | null
  durationSeconds: number
  backgroundColor: string
  ctaText: string
  fontId: BrandKitConfig["fonts"]["heading"]
  textColor: string
}

function flattenForRender(tracks: EditorTrack[]) {
  const visuals: RenderClip[] = []
  const audio: RenderClip[] = []
  // Reverse track order: bottom track first so the overlay chain ends with
  // the top track, matching the preview's z-index stacking.
  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = tracks[i]
    for (const clip of track.clips ?? []) {
      if (!clip.durationMs || clip.durationMs <= 0) continue
      if (clip.kind === "audio") {
        audio.push({ clip, muted: track.muted || !!clip.muted })
      } else if (clip.kind === "text") {
        if (clip.text?.trim()) visuals.push({ clip, muted: true })
      } else if (clip.mediaId) {
        visuals.push({ clip, muted: track.muted || !!clip.muted })
      }
    }
  }
  return { visuals, audio }
}

// The full render pipeline, awaited by the render-queue worker. Any throw is
// mirrored to render_error and rethrown so the job can be marked failed; the
// tmp dir is always cleaned up.
export async function renderProject(
  projectId: string,
  userId: string,
  quality: RenderQuality,
  includeEndCard: boolean
) {
  const dir = await mkdtemp(path.join(tmpdir(), "render-"))
  try {
    const row = await getOwnedProject(userId, projectId)
    const timeline = requireCanonicalTimeline(row.timeline)
    const size = renderSize(timeline.aspect, quality)
    const durationMs = timelineEndMs(timeline.tracks)
    // Revalidate at run time: the timeline may have changed since enqueue.
    if (durationMs <= 0) {
      throw new Error("Nothing to export")
    }
    if (durationMs > MAX_TIMELINE_MS) {
      throw new Error("Timeline too long to export")
    }
    const { visuals, audio } = flattenForRender(timeline.tracks)

    // Resolve every referenced media row, scoped to the owner — a timeline
    // must not be able to pull another user's files into an export.
    const mediaIds = Array.from(
      new Set(
        [...visuals, ...audio]
          .map(({ clip }) => clip.mediaId)
          .filter((id): id is string => !!id)
      )
    )
    const mediaRows = mediaIds.length
      ? await db
          .select()
          .from(aiVideoMedia)
          .where(
            and(
              eq(aiVideoMedia.userId, userId),
              inArray(aiVideoMedia.id, mediaIds)
            )
          )
      : []
    if (mediaRows.length !== mediaIds.length) {
      throw new Error("A clip's media file no longer exists")
    }

    // Download each source from R2 once, keyed by media id.
    const sourceFiles = new Map<string, string>()
    for (const media of mediaRows) {
      const object = await getFromR2(media.storagePath)
      const bytes = await bodyToBytes(object.Body)
      const ext = path.extname(media.storagePath) || ".bin"
      const file = path.join(dir, `src-${sourceFiles.size}${ext}`)
      await writeFile(file, bytes)
      sourceFiles.set(media.id, file)
    }

    // Only video sources with an actual audio stream may join the mix —
    // referencing a missing [n:a] stream would fail the whole command.
    const audioPresence = new Map<string, boolean>()
    for (const media of mediaRows) {
      if (media.fileType === "video") {
        const file = sourceFiles.get(media.id)!
        audioPresence.set(media.id, await hasAudioStream(file))
      }
    }
    const brandKit = await getCurrentWorkspaceBrandKit(userId)
    const logoFile =
      brandKit.watermark.enabled || includeEndCard
        ? await resolveBrandLogo({ userId, dir, brandKit })
        : null
    const watermark =
      brandKit.watermark.enabled && logoFile
        ? {
            file: logoFile,
            position: brandKit.watermark.position,
            widthPercent: brandKit.watermark.widthPercent,
            opacity: brandKit.watermark.opacity,
          }
        : null
    const endCard: RenderEndCard | null = includeEndCard
      ? {
          logoFile,
          durationSeconds: brandKit.endCard.durationSeconds,
          backgroundColor: brandKit.endCard.backgroundColor,
          ctaText: brandKit.endCard.ctaText,
          fontId: brandKit.fonts.heading,
          textColor: brandKit.captionStyle.color,
        }
      : null

    const command = await buildFfmpegCommand({
      dir,
      size,
      durationMs,
      visuals,
      audio,
      sourceFiles,
      audioPresence,
      watermark,
      endCard,
      crf: QUALITY_PRESETS[quality].crf,
    })

    const outFile = path.join(dir, "out.mp4")
    await runFfmpeg([...command, outFile])

    const bytes = await readFile(outFile)
    const storagePath = `renders/${userId}/${projectId}.mp4`
    await uploadToR2(storagePath, bytes, "video/mp4")
    const renderedAt = now()
    const thumbnailStoragePath = await storeRenderThumbnail({
      userId,
      projectId,
      renderedAt,
      bytes,
      previousPath: row.renderThumbnailStoragePath,
    })

    await db
      .update(aiVideoProjects)
      .set({
        renderStatus: "ready",
        renderError: null,
        renderStoragePath: storagePath,
        renderFileSize: bytes.byteLength,
        renderThumbnailStoragePath: thumbnailStoragePath,
        renderTitle: row.renderTitle?.trim() || row.name,
        renderedAt,
      })
      .where(eq(aiVideoProjects.id, projectId))
  } catch (error) {
    console.error("Project render failed", projectId, error)
    await db
      .update(aiVideoProjects)
      .set({
        renderStatus: "error",
        renderError:
          error instanceof Error && SAFE_RENDER_ERRORS.has(error.message)
            ? error.message
            : "Render failed",
      })
      .where(eq(aiVideoProjects.id, projectId))
    throw error
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function storeRenderThumbnail({
  userId,
  projectId,
  renderedAt,
  bytes,
  previousPath,
}: {
  userId: string
  projectId: string
  renderedAt: Date
  bytes: Uint8Array
  previousPath: string | null
}) {
  let thumbnailStoragePath: string | null = null
  const thumbBytes = await extractVideoThumbnail(bytes, "video/mp4")

  if (thumbBytes) {
    const thumbPath = `render-thumbnails/${userId}/${projectId}-${renderedAt.getTime()}.jpg`
    try {
      await uploadToR2(thumbPath, thumbBytes, "image/jpeg")
      thumbnailStoragePath = thumbPath
    } catch {
      thumbnailStoragePath = null
    }
  }

  if (previousPath && previousPath !== thumbnailStoragePath) {
    await deleteFromR2(previousPath).catch(() => undefined)
  }

  return thumbnailStoragePath
}

// Assembles the ffmpeg input list + filter graph. Every clip is its own
// input, trimmed at the input level (-ss/-t), PTS-shifted to its timeline
// position, then overlaid in stacking order over a black base — mirroring the
// preview, where each layer is an object-contain element over transparency.
async function buildFfmpegCommand(options: {
  dir: string
  size: { width: number; height: number }
  durationMs: number
  visuals: RenderClip[]
  audio: RenderClip[]
  sourceFiles: Map<string, string>
  audioPresence: Map<string, boolean>
  watermark: RenderWatermark | null
  endCard: RenderEndCard | null
  crf: number
}) {
  const {
    dir,
    size,
    durationMs,
    visuals,
    audio,
    sourceFiles,
    audioPresence,
    watermark,
    endCard,
    crf,
  } = options
  const durationS = durationMs / 1000
  const outputDurationS = durationS + (endCard?.durationSeconds ?? 0)
  const inputs: string[] = []
  const filters: string[] = [
    `color=c=black:s=${size.width}x${size.height}:r=${OUTPUT_FPS}:d=${outputDurationS}[v0]`,
  ]
  const audioLabels: string[] = []
  let inputIndex = 0
  let visualStep = 0

  for (const { clip, muted } of visuals) {
    const startS = clip.startMs / 1000
    const endS = (clip.startMs + clip.durationMs) / 1000
    const durS = clip.durationMs / 1000

    if (clip.kind === "text") {
      const words = clip.words
      if (words?.length) {
        // Karaoke: the highlight moves word-by-word, so render one frame per
        // active word and overlay each for that word's sub-window.
        for (let i = 0; i < words.length; i++) {
          const fromMs = i === 0 ? 0 : words[i].startMs
          const toMs =
            i === words.length - 1 ? clip.durationMs : words[i + 1].startMs
          const segStartS = (clip.startMs + fromMs) / 1000
          const segEndS = (clip.startMs + toMs) / 1000
          if (segEndS <= segStartS) continue
          const png = await renderTextPng(clip, size, i)
          const file = path.join(dir, `text-${visualStep}.png`)
          await writeFile(file, png)
          inputs.push(
            "-loop",
            "1",
            "-t",
            String(segEndS - segStartS),
            "-i",
            file
          )
          filters.push(
            `[${inputIndex}:v]format=rgba,setpts=PTS-STARTPTS+${segStartS}/TB[l${visualStep}]`,
            `[v${visualStep}][l${visualStep}]overlay=x=0:y=0:enable='between(t,${segStartS.toFixed(3)},${segEndS.toFixed(3)})'[v${visualStep + 1}]`
          )
          inputIndex += 1
          visualStep += 1
        }
        // Frames + increments handled above; skip the single-overlay path.
        continue
      }
      // Pre-rendered full-frame transparent PNG; loops for the clip window.
      const png = await renderTextPng(clip, size)
      const file = path.join(dir, `text-${visualStep}.png`)
      await writeFile(file, png)
      inputs.push("-loop", "1", "-t", String(durS), "-i", file)
      filters.push(
        `[${inputIndex}:v]format=rgba,setpts=PTS-STARTPTS+${startS}/TB[l${visualStep}]`,
        `[v${visualStep}][l${visualStep}]overlay=x=0:y=0:enable='between(t,${startS},${endS})'[v${visualStep + 1}]`
      )
    } else {
      const file = sourceFiles.get(clip.mediaId!)!
      if (clip.kind === "image") {
        inputs.push("-loop", "1", "-t", String(durS), "-i", file)
      } else {
        inputs.push(
          "-ss",
          String(clip.trimStartMs / 1000),
          "-t",
          String(durS),
          "-i",
          file
        )
      }
      // object-contain: scale to fit, overlay centered — no pad, so lower
      // layers stay visible in the letterbox area exactly like the preview.
      filters.push(
        `[${inputIndex}:v]scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,setpts=PTS-STARTPTS+${startS}/TB[l${visualStep}]`,
        `[v${visualStep}][l${visualStep}]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${startS},${endS})'[v${visualStep + 1}]`
      )
      if (clip.kind === "video" && !muted && audioPresence.get(clip.mediaId!)) {
        filters.push(
          `[${inputIndex}:a]adelay=${Math.round(clip.startMs)}:all=1[a${audioLabels.length}]`
        )
        audioLabels.push(`[a${audioLabels.length}]`)
      }
    }
    inputIndex += 1
    visualStep += 1
  }

  for (const { clip, muted } of audio) {
    if (muted) continue
    let file: string | undefined
    if (clip.soundEffectId) {
      const effect = getSoundEffect(clip.soundEffectId)
      if (!effect) throw new Error("A sound effect no longer exists")
      file = path.join(PUBLIC_ASSET_DIR, "sound-effects", effect.fileName)
      if (!existsSync(file)) throw new Error("A sound effect file is missing")
    } else if (clip.mediaId) {
      file = sourceFiles.get(clip.mediaId)
    }
    if (!file) continue
    inputs.push(
      "-ss",
      String(clip.trimStartMs / 1000),
      "-t",
      String(clip.durationMs / 1000),
      "-i",
      file
    )
    filters.push(
      `[${inputIndex}:a]adelay=${Math.round(clip.startMs)}:all=1[a${audioLabels.length}]`
    )
    audioLabels.push(`[a${audioLabels.length}]`)
    inputIndex += 1
  }

  if (watermark) {
    const width = Math.max(
      1,
      Math.round(size.width * (watermark.widthPercent / 100))
    )
    const opacity = Math.min(Math.max(watermark.opacity / 100, 0), 1)
    const margin = Math.round(Math.min(size.width, size.height) * 0.04)
    const x = watermark.position.endsWith("right")
      ? `W-w-${margin}`
      : String(margin)
    const y = watermark.position.startsWith("bottom")
      ? `H-h-${margin}`
      : String(margin)

    inputs.push("-loop", "1", "-t", String(durationS), "-i", watermark.file)
    filters.push(
      `[${inputIndex}:v]format=rgba,scale=${width}:-1,colorchannelmixer=aa=${opacity.toFixed(3)}[wm]`,
      `[v${visualStep}][wm]overlay=x=${x}:y=${y}[v${visualStep + 1}]`
    )
    inputIndex += 1
    visualStep += 1
  }

  if (endCard) {
    const cardDuration = endCard.durationSeconds
    const cardEnd = durationS + cardDuration
    const backgroundColor = endCard.backgroundColor.replace("#", "0x")
    let cardStep = 0
    filters.push(
      `color=c=${backgroundColor}:s=${size.width}x${size.height}:r=${OUTPUT_FPS}:d=${cardDuration}[ec0]`
    )

    if (endCard.logoFile) {
      const logoWidth = Math.round(size.width * 0.32)
      const logoHeight = Math.round(size.height * 0.24)
      const logoY = endCard.ctaText.trim() ? "H*0.38-h/2" : "(H-h)/2"
      inputs.push(
        "-loop",
        "1",
        "-t",
        String(cardDuration),
        "-i",
        endCard.logoFile
      )
      filters.push(
        `[${inputIndex}:v]format=rgba,scale=${logoWidth}:${logoHeight}:force_original_aspect_ratio=decrease[ec-logo]`,
        `[ec${cardStep}][ec-logo]overlay=x=(W-w)/2:y=${logoY}[ec${cardStep + 1}]`
      )
      inputIndex += 1
      cardStep += 1
    }

    if (endCard.ctaText.trim()) {
      const textFile = path.join(dir, "end-card-text.png")
      await writeFile(textFile, await renderEndCardTextPng(endCard, size))
      inputs.push(
        "-loop",
        "1",
        "-t",
        String(cardDuration),
        "-i",
        textFile
      )
      filters.push(
        `[${inputIndex}:v]format=rgba[ec-text]`,
        `[ec${cardStep}][ec-text]overlay=x=0:y=0[ec${cardStep + 1}]`
      )
      inputIndex += 1
      cardStep += 1
    }

    filters.push(
      `[ec${cardStep}]fade=t=in:st=0:d=0.25,setpts=PTS-STARTPTS+${durationS}/TB[ec]`,
      `[v${visualStep}][ec]overlay=x=0:y=0:enable='between(t,${durationS},${cardEnd})'[v${visualStep + 1}]`
    )
    visualStep += 1
  }

  const finalVideo = `v${visualStep}`
  const hasAudio = audioLabels.length > 0
  if (hasAudio) {
    filters.push(
      `${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`
    )
  }

  // Filter graphs grow with clip count — pass via script file to dodge
  // argv length limits.
  const scriptFile = path.join(dir, "filters.txt")
  await writeFile(scriptFile, filters.join(";\n"))

  return [
    ...inputs,
    "-filter_complex_script",
    scriptFile,
    "-map",
    `[${finalVideo}]`,
    ...(hasAudio ? ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"] : []),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(OUTPUT_FPS),
    "-t",
    String(outputDurationS),
    "-movflags",
    "+faststart",
  ]
}

async function resolveBrandLogo({
  userId,
  dir,
  brandKit,
}: {
  userId: string
  dir: string
  brandKit: BrandKitConfig
}): Promise<string | null> {
  const logoId = brandKit.logo.mediaId
  if (!logoId) return null

  const [logo] = await db
    .select()
    .from(aiVideoMedia)
    .where(and(eq(aiVideoMedia.id, logoId), eq(aiVideoMedia.userId, userId)))
    .limit(1)
  if (!logo || logo.fileType !== "image") return null

  try {
    const object = await getFromR2(logo.storagePath)
    if (!object.Body) return null
    const bytes = await bodyToBytes(object.Body)
    let logoBytes = bytes
    if (logo.mimeType === "image/svg+xml") {
      const { Resvg } = loadResvg()
      logoBytes = new Resvg(new TextDecoder().decode(bytes)).render().asPng()
    }
    const ext =
      logo.mimeType === "image/svg+xml"
        ? ".png"
        : path.extname(logo.storagePath) || ".img"
    const file = path.join(dir, `brand-logo${ext}`)
    await writeFile(file, logoBytes)
    return file
  } catch {
    return null
  }
}

// --- Text rasterization -----------------------------------------------------

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Approximate the preview's CSS wrapping (whitespace-pre-wrap inside 5%
// padding): explicit newlines always break; long lines word-wrap at an
// estimated average glyph width since SVG <text> cannot wrap on its own.
function wrapTextLines(text: string, charWidth: number, maxWidth: number) {
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth))
  const lines: string[] = []
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= maxChars) {
      lines.push(rawLine)
      continue
    }
    let current = ""
    for (const word of rawLine.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > maxChars && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    lines.push(current)
  }
  return lines
}

// A laid-out word: text, global index (so the renderer can light the active
// one), and estimated width.
type WordSeg = { text: string; index: number; width: number }

// Wraps karaoke words into lines, each word keeping its global index so the
// renderer can light the active one. Widths use the same glyph-advance
// estimate as wrapTextLines.
function layoutWords(
  words: ClipWord[],
  charWidth: number,
  maxWidth: number
): WordSeg[][] {
  const lines: WordSeg[][] = []
  let line: WordSeg[] = []
  let lineWidth = 0
  words.forEach((word, index) => {
    const wordWidth = word.text.length * charWidth
    const addWidth = line.length ? charWidth + wordWidth : wordWidth // + space
    if (line.length && lineWidth + addWidth > maxWidth) {
      lines.push(line)
      line = [{ text: word.text, index, width: wordWidth }]
      lineWidth = wordWidth
    } else {
      line.push({ text: word.text, index, width: wordWidth })
      lineWidth += addWidth
    }
  })
  if (line.length) lines.push(line)
  return lines.length ? lines : [[]]
}

// Rasterizes one text clip as a full-frame transparent PNG matching the
// preview: centered both axes, 1.15 line height, soft drop shadow, font size
// scaled from the 1080p design space.
async function renderTextPng(
  clip: EditorClip,
  size: { width: number; height: number },
  activeWordIndex?: number
) {
  const font = requireTextFont(clip.fontId)
  const fontFile = renderFontPath(font.fileName)
  if (!existsSync(fontFile)) {
    throw new Error("Render font is missing on the server")
  }

  const scale = size.height / DESIGN_HEIGHT
  const fontSize = (clip.fontSize ?? 80) * scale
  const color = HEX_COLOR.test(clip.color ?? "") ? clip.color! : "#ffffff"
  const lineHeight = fontSize * 1.15
  const maxWidth = size.width * 0.9
  const charWidth = fontSize * font.widthRatio // estimated glyph advance

  // Block center from the clip's normalized position (default 0.5/0.5 =
  // centered) — matches the draggable position set in the editor preview.
  const centerX = (clip.x ?? 0.5) * size.width
  const centerY = (clip.y ?? 0.5) * size.height

  // Karaoke clips keep per-word segments (so each word can carry its own
  // opacity); plain text wraps into whole-line segments.
  const karaoke = clip.words?.length ? clip.words : null
  const lineSegments: WordSeg[][] = karaoke
    ? layoutWords(karaoke, charWidth, maxWidth)
    : wrapTextLines(clip.text ?? "", charWidth, maxWidth).map((line) => [
        { text: line, index: -1, width: line.length * charWidth },
      ])

  // Center the block on centerY; +0.36em nudges each baseline so glyphs (not
  // the em box) sit centered, like CSS centering does.
  const blockHeight = lineSegments.length * lineHeight
  const firstBaseline =
    centerY - blockHeight / 2 + lineHeight / 2 + fontSize * 0.36

  let maxLineWidth = 0
  const spans: string[] = []
  lineSegments.forEach((segs, li) => {
    const baseline = firstBaseline + li * lineHeight
    const lineWidth =
      segs.reduce((sum, seg) => sum + seg.width, 0) +
      (karaoke ? Math.max(0, segs.length - 1) * charWidth : 0)
    maxLineWidth = Math.max(maxLineWidth, lineWidth)
    if (karaoke) {
      // Each word positioned individually so the active one can be full-opacity
      // and the rest dimmed.
      let x = centerX - lineWidth / 2
      for (const seg of segs) {
        const opacity = seg.index === activeWordIndex ? 1 : KARAOKE_DIM
        spans.push(
          `<tspan x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" fill-opacity="${opacity}">${escapeXml(seg.text) || " "}</tspan>`
        )
        x += seg.width + charWidth
      }
    } else {
      spans.push(
        `<tspan x="${centerX.toFixed(1)}" y="${baseline.toFixed(1)}">${escapeXml(segs[0]?.text ?? "") || " "}</tspan>`
      )
    }
  })

  // Highlight box behind the text (when set & valid), matching the preview's
  // padded, rounded background. Width uses the estimated glyph widths.
  const highlight =
    clip.highlightColor && HEX_COLOR.test(clip.highlightColor)
      ? clip.highlightColor
      : null
  let highlightRect = ""
  if (highlight) {
    const boxWidth = maxLineWidth + fontSize * 0.9 // 0.45em padding each side
    const boxHeight = blockHeight + fontSize * 0.4 // 0.2em padding top/bottom
    highlightRect = `<rect x="${(centerX - boxWidth / 2).toFixed(1)}" y="${(centerY - boxHeight / 2).toFixed(1)}" width="${boxWidth.toFixed(1)}" height="${boxHeight.toFixed(1)}" rx="${(fontSize * 0.14).toFixed(1)}" fill="${highlight}"/>`
  }

  // CSS shadow is 0 2px 12px rgba(0,0,0,0.45); feDropShadow's stdDeviation is
  // roughly half a CSS blur radius. Boxed text drops the shadow (like the
  // preview) so it reads cleanly on the highlight.
  const textFilter = highlight ? "" : ` filter="url(#shadow)"`
  const textAnchor = karaoke ? "start" : "middle"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">
  <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
    <feDropShadow dx="0" dy="${2 * scale}" stdDeviation="${6 * scale}" flood-color="#000000" flood-opacity="0.45"/>
  </filter>
  ${highlightRect}
  <text${textFilter} text-anchor="${textAnchor}" font-family="${escapeXml(font.family)}" font-weight="${font.weight}" font-size="${fontSize}" fill="${color}">${spans.join("")}</text>
</svg>`

  const { Resvg } = loadResvg()
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: [fontFile],
      loadSystemFonts: false,
      defaultFontFamily: font.family,
    },
  })
  return resvg.render().asPng()
}

async function renderEndCardTextPng(
  endCard: RenderEndCard,
  size: { width: number; height: number }
) {
  const font = requireTextFont(endCard.fontId)
  const fontFile = renderFontPath(font.fileName)
  if (!existsSync(fontFile)) {
    throw new Error("Render font is missing on the server")
  }

  let fontSize = size.height * 0.06
  let lines = wrapTextLines(
    endCard.ctaText.trim(),
    fontSize * font.widthRatio,
    size.width * 0.8
  )
  while (
    fontSize > size.height * 0.035 &&
    lines.length * fontSize * 1.2 > size.height * 0.35
  ) {
    fontSize -= 2
    lines = wrapTextLines(
      endCard.ctaText.trim(),
      fontSize * font.widthRatio,
      size.width * 0.8
    )
  }

  const lineHeight = fontSize * 1.2
  const centerY = endCard.logoFile ? size.height * 0.68 : size.height * 0.5
  const firstBaseline =
    centerY - (lines.length * lineHeight) / 2 + lineHeight / 2 + fontSize * 0.36
  const spans = lines.map(
    (line, index) =>
      `<tspan x="${size.width / 2}" y="${(firstBaseline + index * lineHeight).toFixed(1)}">${escapeXml(line) || " "}</tspan>`
  )
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">
  <text text-anchor="middle" font-family="${escapeXml(font.family)}" font-weight="${font.weight}" font-size="${fontSize}" fill="${endCard.textColor}">${spans.join("")}</text>
</svg>`

  const { Resvg } = loadResvg()
  return new Resvg(svg, {
    font: {
      fontFiles: [fontFile],
      loadSystemFonts: false,
      defaultFontFamily: font.family,
    },
  })
    .render()
    .asPng()
}

// --- Process helpers ---------------------------------------------------------

// True when ffprobe reports at least one audio stream in the file.
function hasAudioStream(file: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        file,
      ],
      { timeout: 30_000 }
    )
    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0 && stdout.trim().length > 0))
  })
}

// Long-form ffmpeg runner (renders take minutes, unlike the 30s thumbnail
// helper in video-download); keeps the stderr tail for the server log.
function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], {
      timeout: RENDER_TIMEOUT_MS,
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000)
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          error.code === "ENOENT" ? "ffmpeg is not installed" : "Render failed"
        )
      )
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        console.error("ffmpeg render stderr tail:", stderr)
        reject(new Error("Render failed"))
      }
    })
  })
}
