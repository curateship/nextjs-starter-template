import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import type { PomodoroUploadKind } from "@/lib/pomodoro/media-limits"

const run = promisify(execFile)

/**
 * Re-encoding an upload with FFmpeg, ported from the old app's worker
 * (`apps/pomoder/src/worker.ts`).
 *
 * Two reasons this happens at all. A background video only has to sit behind
 * the timer, so 720p with the audio stripped turns a 100 MB phone clip into a
 * few megabytes and stops the tab stuttering. A sound loop comes from anywhere,
 * so loudness normalising means picking a new one does not blow the member's
 * ears off at the volume the last one was comfortable at.
 *
 * An image is never re-encoded; it is ready the moment it lands.
 */

/** Long enough for a 100 MB clip on a busy machine, short enough to give up. */
const FFMPEG_TIMEOUT_MS = 4 * 60 * 1000

export class FfmpegMissingError extends Error {}

/** A trim that starts after the file ends leaves nothing to keep. */
export class TrimOutsideFileError extends Error {}

export type TranscodeResult = {
  bytes: Uint8Array
  mimeType: string
  extension: string
}

/** Where a member asked a sound or clip to start and end, in milliseconds. */
export type TranscodeTrim = { startMs: number; endMs: number }

export async function transcodeUpload(
  input: Uint8Array,
  kind: Exclude<PomodoroUploadKind, "image">,
  trim: TranscodeTrim | null = null
): Promise<TranscodeResult> {
  const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-media-"))
  const inputPath = path.join(folder, kind === "video" ? "in.mp4" : "in.audio")
  const outputPath = path.join(folder, kind === "video" ? "out.mp4" : "out.mp3")

  try {
    await writeFile(inputPath, input)
    await run("ffmpeg", ffmpegArgs(kind, inputPath, outputPath, trim), {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    })
    const bytes = new Uint8Array(await readFile(outputPath))
    if (!bytes.byteLength) throw new Error("FFmpeg produced an empty file.")
    // FFmpeg seeking past the end still exits cleanly and writes a file with
    // no sound or picture in it, which would otherwise be called ready. The
    // window never asks for that; a hand-made request could.
    if (trim) {
      // A file too empty to have a length counts as nothing kept.
      const kept = await probeDurationSeconds(bytes).catch((error: unknown) => {
        if (error instanceof FfmpegMissingError) throw error
        return 0
      })
      if (kept < 0.5)
        throw new TrimOutsideFileError("The trim starts after the file ends.")
    }

    return kind === "video"
      ? { bytes, mimeType: "video/mp4", extension: "mp4" }
      : { bytes, mimeType: "audio/mpeg", extension: "mp3" }
  } catch (error) {
    // A machine with no FFmpeg is a setup problem, not a bad upload, and the
    // two need different answers: one is worth telling an operator about, the
    // other is worth telling the member about.
    if (isMissingBinary(error)) {
      throw new FfmpegMissingError(
        "FFmpeg is not installed on this machine, so uploads cannot be re-encoded."
      )
    }
    throw error
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

/**
 * How long a sound or film runs, in seconds, read by FFprobe, which ships in
 * the same package as FFmpeg. Used to hold catalogue sounds to 2 to 5 minutes.
 */
export async function probeDurationSeconds(input: Uint8Array) {
  const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-probe-"))
  const inputPath = path.join(folder, "in.media")
  try {
    await writeFile(inputPath, input)
    const { stdout } = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
    )
    const seconds = Number.parseFloat(String(stdout).trim())
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new Error("The file's length could not be read.")
    return seconds
  } catch (error) {
    if (isMissingBinary(error)) {
      throw new FfmpegMissingError(
        "FFprobe is not installed on this machine, so sounds cannot be measured."
      )
    }
    throw error
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

/**
 * The frame halfway through a film, as a JPEG: a theme's still. Tyler, 9 Oct
 * 2026: "remove the ability to add a still image and just let the app capture
 * an image in the middle of the clip". A film whose length cannot be read
 * gives its first frame instead.
 */
export async function extractMiddleFrame(input: Uint8Array) {
  const seconds = await probeDurationSeconds(input).catch((error: unknown) => {
    if (error instanceof FfmpegMissingError) throw error
    return 0
  })
  const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-frame-"))
  const inputPath = path.join(folder, "in.mp4")
  const outputPath = path.join(folder, "frame.jpg")
  try {
    await writeFile(inputPath, input)
    await run(
      "ffmpeg",
      [
        "-y",
        // Before the input, so FFmpeg jumps there instead of decoding the
        // first half of the film to reach it.
        "-ss",
        (seconds / 2).toFixed(3),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        outputPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
    )
    const bytes = new Uint8Array(await readFile(outputPath))
    if (!bytes.byteLength) throw new Error("FFmpeg produced an empty frame.")
    return bytes
  } catch (error) {
    if (isMissingBinary(error)) {
      throw new FfmpegMissingError(
        "FFmpeg is not installed on this machine, so uploads cannot be re-encoded."
      )
    }
    throw error
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

function ffmpegArgs(
  kind: "audio" | "video",
  inputPath: string,
  outputPath: string,
  trim: TranscodeTrim | null
) {
  // Before the input, so FFmpeg jumps to the start instead of decoding up to
  // it. Re-encoding makes the cut land on the exact frame, not a keyframe.
  const input = trim
    ? [
        "-ss",
        (trim.startMs / 1000).toFixed(3),
        "-t",
        ((trim.endMs - trim.startMs) / 1000).toFixed(3),
        "-i",
        inputPath,
      ]
    : ["-i", inputPath]
  if (kind === "video") {
    return [
      "-y",
      ...input,
      // No sound: the background is scenery, and the sound player owns audio.
      "-an",
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      // Puts the index at the front so the browser can start playing before
      // the whole file has arrived.
      "-movflags",
      "+faststart",
      outputPath,
    ]
  }

  return [
    "-y",
    ...input,
    "-af",
    "loudnorm",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    outputPath,
  ]
}

function isMissingBinary(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  )
}
