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
  atempoFilters,
  clipSpeed,
  clipVolume,
  DEFAULT_CLIP_VOLUME,
  sourceSpanMs,
} from "@/lib/video/clip-playback"
import { clipFit, frameFitFilter } from "@/lib/video/clip-frame-fit"
import {
  pictureOverlayPosition,
  pictureScaleFilter,
} from "@/lib/video/clip-size"
import { clipMotion, motionFilter } from "@/lib/video/clip-motion"
import { clipColour, colourEqFilter } from "@/lib/video/clip-colour"
import {
  captionExportWindows,
  captionWordAnimation,
  isAnimatedCaption,
  resolveCaptionAnimation,
  type CaptionWordAnimation,
} from "@/lib/video/caption-animations"
import {
  captionWordHighlight,
  litWordRuns,
  splitWindowsByLitWord,
} from "@/lib/video/caption-words"
import { captionLayerSegments } from "@/server/video/caption-layer"
import {
  resolveIncomingTransition,
  type ClipTransition,
} from "@/lib/video/clip-transitions"
import {
  MAX_TIMELINE_MS,
  NOTHING_TO_EXPORT_MESSAGE,
  TIMELINE_TOO_LONG_MESSAGE,
  type RenderFrameRate,
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
import {
  FFMPEG_MISSING_MESSAGE,
  FFMPEG_TIMEOUT_MS,
  runFfmpeg as runFfmpegCommand,
} from "@/server/video/ffmpeg"
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

const AUDIO_BITRATE = "192k"
// Text sizes are authored against a 1080-tall frame in the editor.
const DESIGN_HEIGHT = 1080

export const MEDIA_MISSING_MESSAGE = "A clip's file is no longer in the library"
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

/**
 * How long each ffmpeg run of one export may take: as long as the finished
 * file plays, and never less than ten minutes. That is the allowance a
 * ten-minute export always had. The heaviest export timed on a Mac used about
 * a third of it (see `workspace/docs/long-exports.md`). The Hetzner server
 * that renders has not been timed yet. A stuck run is still stopped.
 */
export function exportTimeoutMs(exportMs: number) {
  return Math.max(FFMPEG_TIMEOUT_MS, exportMs)
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
  aspect,
  quality,
  frameRate,
  brandKit,
  normalizeLoudness,
  signal,
}: {
  userId: string
  timeline: unknown
  /** The export's own shape, which need not be the project's. */
  aspect: AspectRatio
  quality: RenderQuality
  /** Frames a second in the file, and the clock everything timed in frames counts on. */
  frameRate: RenderFrameRate
  brandKit: VideoBrandKit
  normalizeLoudness: boolean
  /** Stops the render partway; the scratch folder still goes. */
  signal?: AbortSignal
}): Promise<RenderResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-render-"))
  try {
    const timeline = requireCanonicalTimeline(rawTimeline)
    const size = renderSize(aspect, quality)
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
      await downloadToFile(media.storagePath, file, signal)
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
      fps: frameRate,
      duckingGain: dbToGain(DEFAULT_DUCK_DB),
    })

    const endCardMs = brandKit.endCard.enabled
      ? brandKit.endCard.durationSeconds * 1000
      : 0
    const exportMs = exportDurationMs(durationMs, endCardMs)
    const timeoutMs = exportTimeoutMs(exportMs)

    const outFile = path.join(dir, "out.mp4")
    await runFfmpeg([...command, outFile], signal, timeoutMs)
    const finalFile = normalizeLoudness
      ? await normalizeExportLoudness(dir, outFile, signal, timeoutMs)
      : outFile

    return {
      bytes: await readFile(finalFile),
      thumbnail: await extractCoverFrame(dir, finalFile, 0, signal),
      durationMs: exportMs,
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
async function normalizeExportLoudness(
  dir: string,
  file: string,
  signal: AbortSignal | undefined,
  timeoutMs: number
) {
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
  ], signal, timeoutMs)
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
  ], signal, timeoutMs)
  return normalized
}

/**
 * One frame out of a finished export, as a JPEG. Used for the cover picture in
 * the gallery, and again when somebody picks a different moment for it.
 */
export async function extractCoverFrame(
  dir: string,
  file: string,
  atMs: number,
  signal?: AbortSignal
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
    ], signal)
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
  fps: RenderFrameRate
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
    fps,
    duckingGain,
  } = options
  const durationS = durationMs / 1000
  const outputDurationS = durationS + (endCard?.durationSeconds ?? 0)
  const inputs: string[] = []
  const filters: string[] = [
    `color=c=black:s=${size.width}x${size.height}:r=${fps}:d=${outputDurationS}[v0]`,
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
  // A clip turned all the way down is silence, so it neither ducks anything
  // nor counts as the thing to duck under.
  const carriesSound = ({ clip }: RenderClip) => {
    if (clipVolume(clip) === 0 || !clip.mediaId) return false
    if (clip.kind === "audio") return true
    return clip.kind === "video" && !!audioPresence.get(clip.mediaId)
  }

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
          computeDuckEnvelope({
            voiceIntervals,
            durationMs,
            duckGain: duckingGain,
          })
        )
      : null

  // Order matters: the speed change comes first so the sound is the right
  // length, then the clip's own level, then the delay that puts it in place,
  // and only then the ducking curve, which is written against timeline time.
  const pushAudio = (inputIdx: number, clip: EditorClip, duck: boolean) => {
    const label = `[a${audioLabels.length}]`
    const speed = clipSpeed(clip)
    const volume = clipVolume(clip)
    const stages = [...atempoFilters(speed)]
    if (volume !== DEFAULT_CLIP_VOLUME) {
      stages.push(`volume=${volume.toFixed(3)}`)
    }
    // Clip time, before the delay moves it into place. The input was cut to
    // the clip with -ss and -t, so it starts at zero and ends at durationMs.
    const fadeMs = Math.min(clip.fadeOutMs ?? 0, clip.durationMs)
    if (fadeMs > 0) {
      stages.push(
        `afade=t=out:st=${((clip.durationMs - fadeMs) / 1000).toFixed(3)}:d=${(fadeMs / 1000).toFixed(3)}`
      )
    }
    stages.push(`adelay=${Math.round(clip.startMs)}:all=1`)
    if (duck && duckExpr) stages.push(`volume=eval=frame:volume='${duckExpr}'`)
    filters.push(`[${inputIdx}:a]${stages.join(",")}${label}`)
    audioLabels.push(label)
  }

  // Dips to black go on last, over everything, so the frame really does pass
  // through black rather than showing whatever is on a lane underneath.
  const dipSeams: { seamS: number; halfS: number }[] = []

  // Captions with nothing else between them in the stack are drawn as one
  // layer, keyed by the first of them (see caption-layer.ts). A layer per
  // caption ran a long captioned export past its time limit.
  const captionRuns = new Map<RenderClip, RenderClip[]>()
  let run: RenderClip[] | null = null
  for (const entry of visuals) {
    if (entry.clip.kind !== "text") {
      run = null
      continue
    }
    if (!run) {
      run = []
      captionRuns.set(entry, run)
    }
    run.push(entry)
  }

  for (const entry of visuals) {
    const { clip, muted, duck, transition } = entry
    const startS = clip.startMs / 1000
    const endS = (clip.startMs + clip.durationMs) / 1000
    const durS = clip.durationMs / 1000

    if (clip.kind === "text") {
      // A run of captions is one layer, laid down where its first caption
      // sits in the stack; the rest of the run is already in it.
      const run = captionRuns.get(entry)
      if (!run) continue
      const parts = new Map<string, string>()
      const segments = captionLayerSegments(
        run.map(({ clip: caption }, captionIndex) => {
          const animation = resolveCaptionAnimation(caption.animation)
          // A still line is one picture for its whole turn. An animated one
          // is a few pictures across its entrance and then one still — the
          // same windows the preview moves through, drawn instead of tweened.
          const entrance = isAnimatedCaption(animation)
            ? captionExportWindows(0, caption.durationMs, 0)
            : [{ fromMs: 0, toMs: caption.durationMs, progress: 1 }]
          // A caption lit word by word is cut again wherever the lit word
          // changes: the preview's colour change, drawn.
          const highlight = captionWordHighlight(caption)
          const windows = highlight
            ? splitWindowsByLitWord(
                entrance,
                litWordRuns(caption, highlight.times)
              )
            : entrance.map((window) => ({ ...window, lit: -1 }))
          return {
            startMs: caption.startMs,
            durationMs: caption.durationMs,
            pieces: windows.map((window, windowIndex) => {
              const id = `${captionIndex}-${windowIndex}`
              parts.set(
                id,
                textSvgPart(
                  caption,
                  size,
                  captionWordAnimation(animation, window.progress),
                  window.lit
                )
              )
              return { fromMs: window.fromMs, toMs: window.toMs, picture: id }
            }),
          }
        }),
        fps
      )
      if (!segments.length) continue

      // One picture per stretch, drawn once however often it comes back, and
      // listed for ffmpeg's `concat` reader counting in the film's frames.
      const pictures = new Map<string, string>()
      const option = `option framerate ${fps}`
      const lines = ["ffconcat version 1.0"]
      for (const segment of segments) {
        const key = segment.pictures.join("+")
        let file = pictures.get(key)
        if (!file) {
          file = path.join(dir, `captions-${visualStep}-${pictures.size}.png`)
          await writeFile(
            file,
            renderTextLayerPng(
              segment.pictures.map((id) => parts.get(id)!),
              size
            )
          )
          pictures.set(key, file)
        }
        lines.push(
          `file '${path.basename(file)}'`,
          option,
          `duration ${((segment.toFrame - segment.fromFrame) / fps).toFixed(6)}`
        )
      }
      // The reader ignores the last picture's time unless it is named again.
      lines.push(lines.at(-3)!, option)
      const listFile = path.join(dir, `captions-${visualStep}.txt`)
      await writeFile(listFile, `${lines.join("\n")}\n`)
      // One decoding thread: by default an input takes one per core. The
      // reader's safe mode refuses the `option` lines, so it is off; the list
      // is written here and names only the pictures drawn beside it.
      inputs.push("-threads", "1", "-f", "concat", "-safe", "0", "-i", listFile)

      const firstFrame = segments[0].fromFrame
      const endFrame = segments.at(-1)!.toFrame
      // On from its first frame, off before the frame after its last: the
      // half frames keep either edge from landing on a rounding error.
      filters.push(
        `[${inputIndex}:v]format=rgba,setpts=PTS-STARTPTS+${firstFrame / fps}/TB[l${visualStep}]`,
        `[v${visualStep}][l${visualStep}]overlay=x=0:y=0:enable='between(t,${(firstFrame - 0.5) / fps},${(endFrame - 0.5) / fps})'[v${visualStep + 1}]`
      )
    } else {
      const file = sourceFiles.get(clip.mediaId!)!
      // A still has no speed: there is nothing moving to play faster. A video
      // reads however much recording its speed eats, and `setpts` below
      // squeezes or stretches that back into the room the clip has.
      const speed = clip.kind === "image" ? 1 : clipSpeed(clip)
      // Fit leaves black where the shapes disagree; fill grows the picture
      // past the frame and crops the overflow back off. Colour goes on after
      // the fit, so `eq` works on a frame-sized picture rather than on a 4K
      // original, and a clip left alone gets no colour stage at all.
      // A still that moves is drawn one frame per output frame, so the move
      // advances on every frame of the film rather than stepping at the
      // input's own 25 a second. A still that holds is left as it always was.
      // A picture smaller than the frame is shrunk last, after it has been
      // fitted, coloured and moved as a whole frame, so it is the same
      // picture at a smaller size (see clip-size.ts).
      const colourFilter = colourEqFilter(clipColour(clip))
      const motion = clipMotion(clip)
      const scaleFilter = pictureScaleFilter(clip)
      const pictureFilter = [
        frameFitFilter(clipFit(clip), size.width, size.height),
        ...(colourFilter ? [colourFilter] : []),
        ...(motion
          ? [motionFilter(motion, size.width, size.height, durS * fps)]
          : []),
        ...(scaleFilter ? [scaleFilter] : []),
      ].join(",")
      const place = pictureOverlayPosition(clip)
      if (clip.kind === "image") {
        inputs.push(
          ...(motion ? ["-framerate", String(fps)] : []),
          "-loop",
          "1",
          "-t",
          String(durS),
          "-i",
          file
        )
      } else {
        inputs.push(
          "-ss",
          String(clip.trimStartMs / 1000),
          "-t",
          String(sourceSpanMs(clip) / 1000),
          "-i",
          file
        )
      }
      const speedStage = speed === 1 ? null : `setpts=(PTS-STARTPTS)/${speed}`
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
          `[${inputIndex}:v]${pictureFilter}`,
          // Speed first, so the pad and the fade below are measured in the
          // seconds the finished film runs rather than the recording's own.
          ...(speedStage ? [speedStage] : []),
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
            ? `'if(gte(t,${startS.toFixed(3)}),${place.x},${place.x}+(W-(${place.x}))*((${startS.toFixed(3)}-t)/${blend.toFixed(3)}))'`
            : place.x
        filters.push(
          `${chain.join(",")}[l${visualStep}]`,
          `[v${visualStep}][l${visualStep}]overlay=x=${xExpr}:y=${place.y}:enable='between(t,${drawStartS.toFixed(3)},${endS.toFixed(3)})'[v${visualStep + 1}]`
        )
      } else {
        filters.push(
          `[${inputIndex}:v]${pictureFilter},setpts=(PTS-STARTPTS)/${speed}+${startS}/TB[l${visualStep}]`,
          `[v${visualStep}][l${visualStep}]overlay=x=${place.x}:y=${place.y}:enable='between(t,${startS},${endS})'[v${visualStep + 1}]`
        )
      }
      if (clip.kind === "video" && !muted && audioPresence.get(clip.mediaId!)) {
        pushAudio(inputIndex, clip, duck)
      }
    }
    inputIndex += 1
    visualStep += 1
  }

  for (const { seamS, halfS } of dipSeams) {
    const fromS = seamS - halfS
    const toS = seamS + halfS
    filters.push(
      `color=c=black:s=${size.width}x${size.height}:r=${fps}:d=${(2 * halfS).toFixed(3)}[dipsrc${visualStep}]`,
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
      String(sourceSpanMs(clip) / 1000),
      "-i",
      file
    )
    pushAudio(inputIndex, clip, duck)
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
      `color=c=${backgroundColor}:s=${size.width}x${size.height}:r=${fps}:d=${cardDuration}[ec0]`
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
    ...(hasAudio
      ? ["-map", "[aout]", "-c:a", "aac", "-b:a", AUDIO_BITRATE]
      : []),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
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
 * One text clip's part of a picture, matching the preview: centred on its own
 * position, 1.15 line height, a soft shadow unless it sits on a block of
 * colour, and the size scaled from the 1080-tall design space.
 */
function textSvgPart(
  clip: EditorClip,
  size: { width: number; height: number },
  /** Where the words are in their entrance; left out means fully arrived. */
  entrance: CaptionWordAnimation = { scale: 1, opacity: 1, dyEm: 0 },
  /** Which word of the text is being said, or -1 for none. */
  litWord = -1
) {
  const font = requireTextFont(clip.fontId)

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

  // The lit word gets a fill of its own inside its line. Words are counted
  // across the lines in the order they were wrapped, which is the order the
  // word times are matched to them.
  const litColor = captionWordHighlight(clip)?.color ?? ""
  const litFill = litWord >= 0 && HEX_COLOR.test(litColor) ? litColor : null
  let wordIndex = 0
  const drawLine = (line: string) => {
    if (!litFill) return escapeXml(line) || " "
    return (
      line
        .split(/(\s+)/)
        .map((part) => {
          if (!part || /^\s+$/.test(part)) return escapeXml(part)
          const lit = wordIndex === litWord
          wordIndex += 1
          return lit
            ? `<tspan fill="${litFill}">${escapeXml(part)}</tspan>`
            : escapeXml(part)
        })
        .join("") || " "
    )
  }

  let maxLineWidth = 0
  const spans = lines.map((line, index) => {
    maxLineWidth = Math.max(maxLineWidth, line.length * charWidth)
    return `<tspan x="${centerX.toFixed(1)}" y="${(firstBaseline + index * lineHeight).toFixed(1)}">${drawLine(line)}</tspan>`
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
  // The entrance is drawn as one move of the whole line: bigger or smaller
  // about its own middle, shifted up or down, and faded. The preview does
  // exactly this with a stylesheet, from the same numbers.
  const shiftY = entrance.dyEm * fontSize
  const entering =
    entrance.scale !== 1 || entrance.opacity !== 1 || entrance.dyEm !== 0
  const openGroup = entering
    ? `<g opacity="${entrance.opacity.toFixed(4)}" transform="translate(${centerX.toFixed(1)} ${(centerY + shiftY).toFixed(1)}) scale(${entrance.scale.toFixed(4)}) translate(${(-centerX).toFixed(1)} ${(-centerY).toFixed(1)})">`
    : ""
  const closeGroup = entering ? "</g>" : ""

  return `${openGroup}${highlightRect}
  <text${textFilter} text-anchor="middle" font-family="Inter" font-weight="${font.weight}" font-size="${fontSize}" fill="${color}">${spans.join("")}</text>${closeGroup}`
}

/**
 * Text clips' parts drawn together as one full-frame see-through picture, the
 * first one lowest. No parts at all is a clear picture.
 */
function renderTextLayerPng(
  parts: string[],
  size: { width: number; height: number }
) {
  const fontFile = requireRenderFont()
  const scale = size.height / DESIGN_HEIGHT
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">
  <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
    <feDropShadow dx="0" dy="${2 * scale}" stdDeviation="${6 * scale}" flood-color="#000000" flood-opacity="0.45"/>
  </filter>
  ${parts.join("\n  ")}
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
    wrapTextLines(
      endCard.ctaText.trim(),
      fontSize * font.widthRatio,
      size.width * 0.8
    )
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

/** Every ffmpeg run in the exporter says the same thing when it fails. */
function runFfmpeg(args: string[], signal?: AbortSignal, timeoutMs?: number) {
  return runFfmpegCommand(args, RENDER_FAILED_MESSAGE, signal, timeoutMs)
}
