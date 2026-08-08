import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { and, eq, inArray } from "drizzle-orm"

import {
  computeDuckEnvelope,
  dbToGain,
  DEFAULT_DUCK_DB,
  duckEnvelopeToVolumeExpr,
  type Interval,
} from "@/lib/video/audio-ducking"
import {
  loudnormApplyFilter,
  loudnormMeasureFilter,
  parseLoudnormMeasurement,
} from "@/lib/video/audio-loudness"
import type { VideoBrandKit } from "@/lib/video/brand-kit"
import {
  resolveIncomingTransition,
  type ClipTransition,
} from "@/lib/video/clip-transitions"
import {
  MAX_TIMELINE_MS,
  NOTHING_TO_EXPORT_MESSAGE,
  TIMELINE_TOO_LONG_MESSAGE,
  type RenderQuality,
} from "@/lib/video/render"
import { requireTextFont } from "@/lib/video/text-fonts"
import {
  requireCanonicalTimeline,
  SAVED_TIMELINE_INVALID_MESSAGE,
  type AspectRatio,
} from "@/lib/video/timeline-schema"
import type {
  EditorClip,
  EditorTrack,
} from "@/components/video-editor/editor-store"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { downloadToFile } from "@/server/video/storage-files"

/**
 * Turning a timeline into a finished MP4.
 *
 * Every clip becomes one ffmpeg input, trimmed as it goes in, shifted to its
 * place on the timeline, and laid over a black frame in the same order the
 * preview stacks them. That is the whole trick: what you watched in the editor
 * and what comes out here are built from the same description, so they match.
 *
 * Words are drawn as pictures rather than by ffmpeg, because the builds people
 * actually have installed usually ship without the text support it would need.
 */

/** The full-size frame for each shape; lower qualities scale this down. */
const RENDER_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
}

// How much to shrink the frame, and how hard to squeeze it. A bigger squeeze
// is a smaller file and a softer picture.
const QUALITY_PRESETS: Record<RenderQuality, { scale: number; crf: number }> = {
  high: { scale: 1, crf: 18 },
  medium: { scale: 2 / 3, crf: 22 },
  low: { scale: 4 / 9, crf: 28 },
}

const OUTPUT_FPS = 30
const AUDIO_BITRATE = "192k"
// Text sizes are authored against a 1080-tall frame in the editor.
const DESIGN_HEIGHT = 1080
const RENDER_TIMEOUT_MS = 10 * 60_000

export const MEDIA_MISSING_MESSAGE = "A clip's file is no longer in the library"
export const FFMPEG_MISSING_MESSAGE = "ffmpeg is not installed on this server"
export const RENDER_FAILED_MESSAGE = "The export could not be made"
const FONT_MISSING_MESSAGE = "The font this server renders words with is missing"

/**
 * Only these reach the screen as they are. Anything else — storage internals,
 * ffmpeg's own noise — is written to the server log and shown as the plain
 * failure message, because the rest is no use to whoever clicked Export.
 */
export const SAFE_RENDER_ERRORS = new Set([
  NOTHING_TO_EXPORT_MESSAGE,
  TIMELINE_TOO_LONG_MESSAGE,
  MEDIA_MISSING_MESSAGE,
  FFMPEG_MISSING_MESSAGE,
  FONT_MISSING_MESSAGE,
  SAVED_TIMELINE_INVALID_MESSAGE,
])

// The face words are drawn in: the app's own Inter, as a file the rasterizer
// can read. The browser loads the same family as a web font.
const ASSET_DIR = fileURLToPath(new URL("../assets", import.meta.url))
const RENDER_FONT_FILE = path.join(ASSET_DIR, "Inter-SemiBold.ttf")

// The rasterizer is a native add-on: no bundler can inline its binary, so it is
// loaded when it is needed rather than imported. A server running this must
// have it installed, the same as ffmpeg.
const requireNative = createRequire(import.meta.url)
function loadResvg() {
  return requireNative("@resvg/resvg-js") as typeof import("@resvg/resvg-js")
}

function toEven(value: number) {
  return Math.max(2, Math.round(value / 2) * 2)
}

export function renderSize(aspect: AspectRatio, quality: RenderQuality) {
  const base = RENDER_SIZES[aspect] ?? RENDER_SIZES["16:9"]
  const { scale } = QUALITY_PRESETS[quality]
  return {
    width: toEven(base.width * scale),
    height: toEven(base.height * scale),
  }
}

/**
 * How long the finished file runs, in whole milliseconds.
 *
 * Clip lengths come from frame maths, so a timeline routinely ends on
 * something like 10418.75ms. That is fine for ffmpeg and wrong for everywhere
 * the length is written down or read back: the column it is stored in counts
 * whole milliseconds, and refuses anything else.
 */
export function exportDurationMs(timelineMs: number, endCardMs: number) {
  return Math.round(timelineMs + endCardMs)
}

/** Where the last clip ends — how long the export runs for. */
export function timelineEndMs(tracks: EditorTrack[]) {
  let max = 0
  for (const track of tracks) {
    for (const clip of track.clips ?? []) {
      max = Math.max(max, (clip.startMs ?? 0) + (clip.durationMs ?? 0))
    }
  }
  return max
}

/**
 * Why a project cannot be exported, in words, or null when it can. Checked when
 * somebody asks so the answer is immediate, and again when the render starts,
 * because the timeline may have changed in between.
 */
export function renderRefusalReason(timeline: unknown): string | null {
  let durationMs: number
  try {
    durationMs = timelineEndMs(requireCanonicalTimeline(timeline).tracks)
  } catch {
    return SAVED_TIMELINE_INVALID_MESSAGE
  }
  if (durationMs <= 0) return NOTHING_TO_EXPORT_MESSAGE
  if (durationMs > MAX_TIMELINE_MS) return TIMELINE_TOO_LONG_MESSAGE
  return null
}

/**
 * One clip with its lane's mute and duck settings folded in. Visual order is
 * bottom lane first, so the last thing laid down is the top lane — the way the
 * preview stacks them.
 */
type RenderClip = {
  clip: EditorClip
  muted: boolean
  duck: boolean
  transition?: ClipTransition | null
}

function flattenForRender(tracks: EditorTrack[]) {
  const visuals: RenderClip[] = []
  const audio: RenderClip[] = []
  for (let index = tracks.length - 1; index >= 0; index--) {
    const track = tracks[index]
    const duck = !!track.duck
    const clips = track.clips ?? []
    clips.forEach((clip, clipIndex) => {
      if (!clip.durationMs || clip.durationMs <= 0) return
      if (clip.kind === "audio") {
        audio.push({ clip, muted: track.muted || !!clip.muted, duck })
      } else if (clip.kind === "text") {
        if (clip.text?.trim()) visuals.push({ clip, muted: true, duck: false })
      } else if (clip.mediaId) {
        // The clip before this one on the same lane decides whether the seam
        // blends. They are stored in order.
        const transition = resolveIncomingTransition(
          clip,
          clipIndex > 0 ? clips[clipIndex - 1] : null
        )
        visuals.push({
          clip,
          muted: track.muted || !!clip.muted,
          duck,
          transition,
        })
      }
    })
  }
  return { visuals, audio }
}

export type RenderResult = {
  bytes: Uint8Array
  thumbnail: Uint8Array | null
  durationMs: number
  width: number
  height: number
}

/**
 * Render one timeline and hand back the file. Everything happens in a scratch
 * directory that is always cleaned up, and nothing here writes to the database
 * — the queue owns what happens to the result.
 */
export async function renderTimeline({
  userId,
  timeline: rawTimeline,
  quality,
  brandKit,
  normalizeLoudness,
}: {
  userId: string
  timeline: unknown
  quality: RenderQuality
  brandKit: VideoBrandKit
  normalizeLoudness: boolean
}): Promise<RenderResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-render-"))
  try {
    const timeline = requireCanonicalTimeline(rawTimeline)
    const size = renderSize(timeline.aspect, quality)
    const durationMs = timelineEndMs(timeline.tracks)
    if (durationMs <= 0) throw new Error(NOTHING_TO_EXPORT_MESSAGE)
    if (durationMs > MAX_TIMELINE_MS) throw new Error(TIMELINE_TOO_LONG_MESSAGE)

    const { visuals, audio } = flattenForRender(timeline.tracks)

    // Every file the timeline names, looked up as the owner's own — a timeline
    // must never be able to pull somebody else's footage into an export.
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
          .from(customShellMedia)
          .where(
            and(
              eq(customShellMedia.userId, userId),
              inArray(customShellMedia.id, mediaIds)
            )
          )
      : []
    if (mediaRows.length !== mediaIds.length) {
      throw new Error(MEDIA_MISSING_MESSAGE)
    }

    // Each source is fetched once, however many clips use it.
    const sourceFiles = new Map<string, string>()
    for (const media of mediaRows) {
      const extension = path.extname(media.storagePath) || ".bin"
      const file = path.join(dir, `src-${sourceFiles.size}${extension}`)
      await downloadToFile(media.storagePath, file)
      sourceFiles.set(media.id, file)
    }

    // Only a video that really carries sound may join the mix; naming a stream
    // that is not there fails the whole command.
    const audioPresence = new Map<string, boolean>()
    for (const media of mediaRows) {
      if (media.fileType === "video") {
        audioPresence.set(media.id, await hasAudioStream(sourceFiles.get(media.id)!))
      }
    }

    const logoFile =
      brandKit.watermark.enabled || brandKit.endCard.enabled
        ? await downloadBrandLogo(dir, brandKit.logoUrl)
        : null

    const command = await buildFfmpegCommand({
      dir,
      size,
      durationMs,
      visuals,
      audio,
      sourceFiles,
      audioPresence,
      watermark:
        brandKit.watermark.enabled && logoFile
          ? { ...brandKit.watermark, file: logoFile }
          : null,
      endCard: brandKit.endCard.enabled
        ? { ...brandKit.endCard, logoFile }
        : null,
      crf: QUALITY_PRESETS[quality].crf,
      duckingGain: dbToGain(DEFAULT_DUCK_DB),
    })

    const outFile = path.join(dir, "out.mp4")
    await runFfmpeg([...command, outFile])
    const finalFile = normalizeLoudness
      ? await normalizeExportLoudness(dir, outFile)
      : outFile

    const endCardMs = brandKit.endCard.enabled
      ? brandKit.endCard.durationSeconds * 1000
      : 0
    return {
      bytes: await readFile(finalFile),
      thumbnail: await extractCoverFrame(dir, finalFile, 0),
      durationMs: exportDurationMs(durationMs, endCardMs),
      width: size.width,
      height: size.height,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Levels the finished mix and returns the file to keep. The first pass listens,
 * the second applies one fixed correction, so the ducking keeps its shape. The
 * picture is copied through untouched. A silent export is left alone.
 */
async function normalizeExportLoudness(dir: string, file: string) {
  if (!(await hasAudioStream(file))) return file

  const stderr = await runFfmpeg([
    "-i",
    file,
    "-vn",
    "-af",
    loudnormMeasureFilter(),
    "-f",
    "null",
    "-",
  ])
  const measurement = parseLoudnormMeasurement(stderr)
  if (!measurement) {
    console.warn("Loudness could not be measured; keeping the mix as it is")
    return file
  }

  const normalized = path.join(dir, "out-normalized.mp4")
  await runFfmpeg([
    "-i",
    file,
    "-c:v",
    "copy",
    "-af",
    loudnormApplyFilter(measurement),
    "-c:a",
    "aac",
    "-b:a",
    AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    normalized,
  ])
  return normalized
}

/**
 * One frame out of a finished export, as a JPEG. Used for the cover picture in
 * the gallery, and again when somebody picks a different moment for it.
 */
export async function extractCoverFrame(
  dir: string,
  file: string,
  atMs: number
): Promise<Uint8Array | null> {
  const out = path.join(dir, `cover-${Math.round(atMs)}.jpg`)
  try {
    await runFfmpeg([
      "-ss",
      String(Math.max(0, atMs) / 1000),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "4",
      out,
    ])
    return await readFile(out)
  } catch {
    // A cover is a nicety; an export with none is still an export.
    return null
  }
}

/**
 * The same, for an export already in storage. It is streamed to disk rather
 * than read into memory: a ten-minute export is a big file to hold just to
 * take one picture out of it.
 */
export async function extractCoverFrameFromStorage(
  storagePath: string,
  atMs: number
): Promise<Uint8Array | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-cover-"))
  try {
    const file = path.join(dir, "source.mp4")
    await downloadToFile(storagePath, file)
    return await extractCoverFrame(dir, file, atMs)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function downloadBrandLogo(dir: string, logoUrl: string) {
  if (!logoUrl) return null
  try {
    // Only the web. The logo address is typed in by an admin, and this runs on
    // the server, so anything else would be the server fetching whatever it was
    // pointed at.
    const address = new URL(logoUrl)
    if (address.protocol !== "https:" && address.protocol !== "http:") {
      return null
    }
    const response = await fetch(address)
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    const isSvg = (response.headers.get("Content-Type") ?? "").includes("svg")
    const file = path.join(dir, isSvg ? "brand-logo.png" : "brand-logo.img")
    if (isSvg) {
      const { Resvg } = loadResvg()
      await writeFile(
        file,
        new Resvg(new TextDecoder().decode(bytes)).render().asPng()
      )
    } else {
      await writeFile(file, bytes)
    }
    return file
  } catch {
    // A logo that cannot be fetched is not worth failing an export over.
    return null
  }
}

type RenderWatermark = VideoBrandKit["watermark"] & { file: string }
type RenderEndCard = VideoBrandKit["endCard"] & { logoFile: string | null }

/**
 * Builds the input list and the filter graph. Nothing is padded: a clip that
 * does not fill the frame lets whatever is under it show through, exactly as
 * the preview does with its stacked, contained layers.
 */
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
  duckingGain: number
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
    duckingGain,
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

  // Ducking: anything making a sound on a lane that is not ducked counts as
  // the thing to duck under. Ducked lanes get one volume curve across the
  // whole timeline, the same curve the preview plays.
  const sourceInterval = (clip: EditorClip): Interval => ({
    startMs: clip.startMs,
    endMs: clip.startMs + clip.durationMs,
  })
  const carriesSound = ({ clip }: RenderClip) =>
    clip.kind === "audio"
      ? !!clip.mediaId
      : clip.kind === "video" && !!clip.mediaId && !!audioPresence.get(clip.mediaId)

  const voiceIntervals: Interval[] = []
  for (const entry of [...audio, ...visuals]) {
    if (entry.muted || entry.duck || !carriesSound(entry)) continue
    voiceIntervals.push(sourceInterval(entry.clip))
  }
  const hasDuckSource = [...audio, ...visuals].some(
    (entry) => entry.duck && !entry.muted && carriesSound(entry)
  )
  const duckExpr =
    hasDuckSource && voiceIntervals.length && duckingGain < 1
      ? duckEnvelopeToVolumeExpr(
          computeDuckEnvelope({ voiceIntervals, durationMs, duckGain: duckingGain })
        )
      : null

  const pushAudio = (inputIdx: number, startMs: number, duck: boolean) => {
    const label = `[a${audioLabels.length}]`
    const stages = [`[${inputIdx}:a]adelay=${Math.round(startMs)}:all=1`]
    if (duck && duckExpr) stages.push(`volume=eval=frame:volume='${duckExpr}'`)
    filters.push(`${stages.join(",")}${label}`)
    audioLabels.push(label)
  }

  // Dips to black go on last, over everything, so the frame really does pass
  // through black rather than showing whatever is on a lane underneath.
  const dipSeams: { seamS: number; halfS: number }[] = []

  for (const { clip, muted, duck, transition } of visuals) {
    const startS = clip.startMs / 1000
    const endS = (clip.startMs + clip.durationMs) / 1000
    const durS = clip.durationMs / 1000

    if (clip.kind === "text") {
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
      const reach = transition && transition.kind !== "dip" ? transition : null
      if (transition?.kind === "dip") {
        dipSeams.push({ seamS: startS, halfS: transition.durationMs / 2000 })
      }
      if (reach) {
        // Drawn early over the outgoing clip's tail, holding its own first
        // frame so the picture is continuous at the seam: a crossfade brings
        // its opacity up, a slide brings it in from the right.
        const blend = reach.durationMs / 1000
        const drawStartS = startS - blend
        const chain = [
          `[${inputIndex}:v]scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease`,
          `tpad=start_duration=${blend.toFixed(3)}:start_mode=clone`,
        ]
        if (reach.kind === "crossfade") {
          chain.push(
            "format=rgba",
            `fade=t=in:st=0:d=${blend.toFixed(3)}:alpha=1`
          )
        }
        chain.push(`setpts=PTS-STARTPTS+${drawStartS.toFixed(3)}/TB`)
        const xExpr =
          reach.kind === "slide"
            ? `'if(gte(t,${startS.toFixed(3)}),(W-w)/2,(W-w)/2+(W-(W-w)/2)*((${startS.toFixed(3)}-t)/${blend.toFixed(3)}))'`
            : "(W-w)/2"
        filters.push(
          `${chain.join(",")}[l${visualStep}]`,
          `[v${visualStep}][l${visualStep}]overlay=x=${xExpr}:y=(H-h)/2:enable='between(t,${drawStartS.toFixed(3)},${endS.toFixed(3)})'[v${visualStep + 1}]`
        )
      } else {
        filters.push(
          `[${inputIndex}:v]scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,setpts=PTS-STARTPTS+${startS}/TB[l${visualStep}]`,
          `[v${visualStep}][l${visualStep}]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${startS},${endS})'[v${visualStep + 1}]`
        )
      }
      if (clip.kind === "video" && !muted && audioPresence.get(clip.mediaId!)) {
        pushAudio(inputIndex, clip.startMs, duck)
      }
    }
    inputIndex += 1
    visualStep += 1
  }

  for (const { seamS, halfS } of dipSeams) {
    const fromS = seamS - halfS
    const toS = seamS + halfS
    filters.push(
      `color=c=black:s=${size.width}x${size.height}:r=${OUTPUT_FPS}:d=${(2 * halfS).toFixed(3)}[dipsrc${visualStep}]`,
      `[dipsrc${visualStep}]format=yuva420p,fade=t=in:st=0:d=${halfS.toFixed(3)}:alpha=1,fade=t=out:st=${halfS.toFixed(3)}:d=${halfS.toFixed(3)}:alpha=1,setpts=PTS-STARTPTS+${fromS.toFixed(3)}/TB[dip${visualStep}]`,
      `[v${visualStep}][dip${visualStep}]overlay=x=0:y=0:enable='between(t,${fromS.toFixed(3)},${toS.toFixed(3)})'[v${visualStep + 1}]`
    )
    visualStep += 1
  }

  for (const { clip, muted, duck } of audio) {
    if (muted || !clip.mediaId) continue
    const file = sourceFiles.get(clip.mediaId)
    if (!file) continue
    inputs.push(
      "-ss",
      String(clip.trimStartMs / 1000),
      "-t",
      String(clip.durationMs / 1000),
      "-i",
      file
    )
    pushAudio(inputIndex, clip.startMs, duck)
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
      inputs.push("-loop", "1", "-t", String(cardDuration), "-i", textFile)
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

  // The graph grows with the clip count, so it goes in a file rather than on
  // the command line, which has a length limit.
  const scriptFile = path.join(dir, "filters.txt")
  await writeFile(scriptFile, filters.join(";\n"))

  return [
    ...inputs,
    "-filter_complex_script",
    scriptFile,
    "-map",
    `[${finalVideo}]`,
    ...(hasAudio ? ["-map", "[aout]", "-c:a", "aac", "-b:a", AUDIO_BITRATE] : []),
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

// --- Drawing words ----------------------------------------------------------

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Where the lines break. A drawing has no idea how to wrap text on its own, so
 * this guesses from an average letter width — the same guess the preview's
 * font description carries — and always breaks where a newline was typed.
 */
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

function requireRenderFont() {
  if (!existsSync(RENDER_FONT_FILE)) {
    throw new Error(FONT_MISSING_MESSAGE)
  }
  return RENDER_FONT_FILE
}

/**
 * One text clip as a full-frame see-through picture, matching the preview:
 * centred on its own position, 1.15 line height, a soft shadow unless it sits
 * on a block of colour, and the size scaled from the 1080-tall design space.
 */
async function renderTextPng(
  clip: EditorClip,
  size: { width: number; height: number }
) {
  const font = requireTextFont(clip.fontId)
  const fontFile = requireRenderFont()

  const scale = size.height / DESIGN_HEIGHT
  const fontSize = (clip.fontSize ?? 80) * scale
  const color = HEX_COLOR.test(clip.color ?? "") ? clip.color! : "#ffffff"
  const lineHeight = fontSize * 1.15
  const maxWidth = size.width * 0.9
  const charWidth = fontSize * font.widthRatio

  const centerX = (clip.x ?? 0.5) * size.width
  const centerY = (clip.y ?? 0.5) * size.height

  const lines = wrapTextLines(clip.text ?? "", charWidth, maxWidth)
  const blockHeight = lines.length * lineHeight
  // The nudge puts the letters, rather than their invisible box, on the middle
  // — which is what the browser's centring does.
  const firstBaseline =
    centerY - blockHeight / 2 + lineHeight / 2 + fontSize * 0.36

  let maxLineWidth = 0
  const spans = lines.map((line, index) => {
    maxLineWidth = Math.max(maxLineWidth, line.length * charWidth)
    return `<tspan x="${centerX.toFixed(1)}" y="${(firstBaseline + index * lineHeight).toFixed(1)}">${escapeXml(line) || " "}</tspan>`
  })

  const highlight =
    clip.highlightColor && HEX_COLOR.test(clip.highlightColor)
      ? clip.highlightColor
      : null
  const highlightRect = highlight
    ? (() => {
        const boxWidth = maxLineWidth + fontSize * 0.9
        const boxHeight = blockHeight + fontSize * 0.4
        return `<rect x="${(centerX - boxWidth / 2).toFixed(1)}" y="${(centerY - boxHeight / 2).toFixed(1)}" width="${boxWidth.toFixed(1)}" height="${boxHeight.toFixed(1)}" rx="${(fontSize * 0.14).toFixed(1)}" fill="${highlight}"/>`
      })()
    : ""

  // Boxed words drop the shadow, the way the preview does, so they read
  // cleanly against their block of colour.
  const textFilter = highlight ? "" : ` filter="url(#shadow)"`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">
  <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
    <feDropShadow dx="0" dy="${2 * scale}" stdDeviation="${6 * scale}" flood-color="#000000" flood-opacity="0.45"/>
  </filter>
  ${highlightRect}
  <text${textFilter} text-anchor="middle" font-family="Inter" font-weight="${font.weight}" font-size="${fontSize}" fill="${color}">${spans.join("")}</text>
</svg>`

  const { Resvg } = loadResvg()
  return new Resvg(svg, {
    font: {
      fontFiles: [fontFile],
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  })
    .render()
    .asPng()
}

async function renderEndCardTextPng(
  endCard: RenderEndCard,
  size: { width: number; height: number }
) {
  const font = requireTextFont("inter")
  const fontFile = requireRenderFont()

  let fontSize = size.height * 0.06
  const wrap = () =>
    wrapTextLines(endCard.ctaText.trim(), fontSize * font.widthRatio, size.width * 0.8)
  let lines = wrap()
  // Shrink until the line fits the third of the card it is allowed.
  while (
    fontSize > size.height * 0.035 &&
    lines.length * fontSize * 1.2 > size.height * 0.35
  ) {
    fontSize -= 2
    lines = wrap()
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
  <text text-anchor="middle" font-family="Inter" font-weight="${font.weight}" font-size="${fontSize}" fill="#ffffff">${spans.join("")}</text>
</svg>`

  const { Resvg } = loadResvg()
  return new Resvg(svg, {
    font: {
      fontFiles: [fontFile],
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  })
    .render()
    .asPng()
}

// --- Running the tools ------------------------------------------------------

/** True when the file really has a sound track in it. */
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

/**
 * Runs ffmpeg and hands back the tail of what it said, which the loudness pass
 * reads its measurement out of and the log keeps when something goes wrong.
 */
function runFfmpeg(args: string[]) {
  return new Promise<string>((resolve, reject) => {
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
          error.code === "ENOENT" ? FFMPEG_MISSING_MESSAGE : RENDER_FAILED_MESSAGE
        )
      )
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr)
      } else {
        console.error("ffmpeg said:", stderr)
        reject(new Error(RENDER_FAILED_MESSAGE))
      }
    })
  })
}
