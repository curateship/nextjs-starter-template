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

export type TranscodeResult = {
  bytes: Uint8Array
  mimeType: string
  extension: string
}

export async function transcodeUpload(
  input: Uint8Array,
  kind: Exclude<PomodoroUploadKind, "image">
): Promise<TranscodeResult> {
  const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-media-"))
  const inputPath = path.join(folder, kind === "video" ? "in.mp4" : "in.audio")
  const outputPath = path.join(folder, kind === "video" ? "out.mp4" : "out.mp3")

  try {
    await writeFile(inputPath, input)
    await run("ffmpeg", ffmpegArgs(kind, inputPath, outputPath), {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    })
    const bytes = new Uint8Array(await readFile(outputPath))
    if (!bytes.byteLength) throw new Error("FFmpeg produced an empty file.")

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

/** A film's first frame as a JPEG, for a theme that was given no still. */
export async function extractFirstFrame(input: Uint8Array) {
  const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-frame-"))
  const inputPath = path.join(folder, "in.mp4")
  const outputPath = path.join(folder, "frame.jpg")
  try {
    await writeFile(inputPath, input)
    await run(
      "ffmpeg",
      ["-y", "-i", inputPath, "-frames:v", "1", "-q:v", "3", outputPath],
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
  outputPath: string
) {
  if (kind === "video") {
    return [
      "-y",
      "-i",
      inputPath,
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
    "-i",
    inputPath,
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
