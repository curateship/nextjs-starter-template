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

/**
 * A sound's end crossfaded over its own start, so it loops with no click or
 * jump: an AI soundscape (task 06, part 2) and a member's sound upload (task
 * 08, part 3). `minSeconds` repeats the loop until the file runs at least that
 * long, which is how a 30-second soundscape comes back two minutes long.
 */
export type SeamlessLoop = { minSeconds?: number }

/** The crossfade a sound's end makes over its start, in seconds. */
export const LOOP_FADE_SECONDS = 2

export async function transcodeUpload(
  input: Uint8Array,
  kind: Exclude<PomodoroUploadKind, "image">,
  trim: TranscodeTrim | null = null,
  { loop = null }: { loop?: SeamlessLoop | null } = {}
): Promise<TranscodeResult> {
  const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-media-"))
  const inputPath = path.join(folder, kind === "video" ? "in.mp4" : "in.audio")
  const outputPath = path.join(folder, kind === "video" ? "out.mp4" : "out.mp3")
  const looped = kind === "audio" && loop !== null

  try {
    await writeFile(inputPath, input)
    if (looped) {
      // Two runs: the cut and the loudness first, into plain PCM so nothing is
      // lost between the two, then the loop, which needs the cut's length.
      const levelledPath = path.join(folder, "levelled.wav")
      await run("ffmpeg", levelledAudioArgs(inputPath, levelledPath, trim), {
        timeout: FFMPEG_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      })
      const seconds = await probeFileSeconds(levelledPath)
      await run(
        "ffmpeg",
        seamlessLoopArgs(levelledPath, outputPath, seconds, loop.minSeconds ?? 0),
        { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
      )
    } else {
      await run("ffmpeg", ffmpegArgs(kind, inputPath, outputPath, trim), {
        timeout: FFMPEG_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      })
    }
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
    return await probeFileSeconds(inputPath)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

async function probeFileSeconds(inputPath: string) {
  try {
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

/**
 * How a sound of `seconds` loops: how long the crossfade is and how many
 * times the loop repeats. One copy with a 2-second crossfade unless the sound
 * must run longer; then enough copies to pass `minSeconds`, with the
 * crossfade stretched so the copies add up to exactly that long. A 30-second
 * soundscape asked for 120 is five 24-second copies, each joined over 6
 * seconds. A sound under 2 seconds is too short to loop over itself.
 */
export function seamlessLoopPlan(seconds: number, minSeconds = 0) {
  if (seconds < 2) return null
  const fade = Math.min(LOOP_FADE_SECONDS, seconds / 4)
  if (minSeconds <= seconds - fade) return { fade, copies: 1 }
  const copies = Math.ceil(minSeconds / (seconds - fade))
  const exact = seconds - minSeconds / copies
  // Stretching the fade past half the sound would make its start and end
  // overlap, so then the copies keep the short fade and run a little long.
  return { fade: exact <= seconds / 2 ? exact : fade, copies }
}

/** The cut and the loudness, into 44.1 kHz PCM for the loop to read. */
function levelledAudioArgs(
  inputPath: string,
  outputPath: string,
  trim: TranscodeTrim | null
) {
  return [
    "-y",
    ...inputArgs(inputPath, trim),
    "-af",
    "loudnorm",
    "-ar",
    "44100",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]
}

/**
 * The loop: the sound's last `fade` seconds crossfaded over its first, then
 * the middle. What comes out ends exactly where its own start picks up, so
 * repeating it, or a player looping it, has no join to hear. Equal-power
 * curves, because the two ends of an ambient sound are not the same sound
 * and a straight fade would dip in the middle.
 */
function seamlessLoopArgs(
  inputPath: string,
  outputPath: string,
  seconds: number,
  minSeconds: number
) {
  const plan = seamlessLoopPlan(seconds, minSeconds)
  const encode = ["-codec:a", "libmp3lame", "-b:a", "192k", outputPath]
  if (!plan) return ["-y", "-i", inputPath, ...encode]
  const fade = plan.fade.toFixed(3)
  const middleEnd = (seconds - plan.fade).toFixed(3)
  const repeat =
    plan.copies > 1
      ? `;[once]asplit=${plan.copies}${copyLabels(plan.copies)};${copyLabels(plan.copies)}concat=n=${plan.copies}:v=0:a=1[out]`
      : ""
  const graph =
    `[0:a]asplit=3[a][b][c];` +
    `[a]atrim=0:${fade},asetpts=PTS-STARTPTS[head];` +
    `[b]atrim=${fade}:${middleEnd},asetpts=PTS-STARTPTS[middle];` +
    `[c]atrim=start=${middleEnd},asetpts=PTS-STARTPTS[tail];` +
    `[tail][head]acrossfade=d=${fade}:c1=qsin:c2=qsin[join];` +
    `[join][middle]concat=n=2:v=0:a=1[${plan.copies > 1 ? "once" : "out"}]` +
    repeat
  return ["-y", "-i", inputPath, "-filter_complex", graph, "-map", "[out]", ...encode]
}

function copyLabels(copies: number) {
  return Array.from({ length: copies }, (_, index) => `[copy${index}]`).join("")
}

/**
 * Before the input, so FFmpeg jumps to the start instead of decoding up to
 * it. Re-encoding makes the cut land on the exact frame, not a keyframe.
 */
function inputArgs(inputPath: string, trim: TranscodeTrim | null) {
  return trim
    ? [
        "-ss",
        (trim.startMs / 1000).toFixed(3),
        "-t",
        ((trim.endMs - trim.startMs) / 1000).toFixed(3),
        "-i",
        inputPath,
      ]
    : ["-i", inputPath]
}

function ffmpegArgs(
  kind: "audio" | "video",
  inputPath: string,
  outputPath: string,
  trim: TranscodeTrim | null
) {
  const input = inputArgs(inputPath, trim)
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
