import { spawn } from "node:child_process"

import { SayableError } from "@/server/note/sayable"

/**
 * Running ffmpeg, copied from the Video app's `src/server/video/ffmpeg.ts`.
 *
 * The worker needs it three ways: a cover picture from one frame, the sound of
 * a file as a small mp3 for Gemini, and the length of an uploaded file, which
 * ffmpeg prints on every run without being asked.
 */

export const FFMPEG_MISSING_MESSAGE = "ffmpeg is not installed on this server"

/** Thirty minutes of sound comes out in seconds; this is a stuck run. */
const FFMPEG_TIMEOUT_MS = 10 * 60_000

/** Runs ffmpeg and hands back the tail of what it said. */
export function runFfmpeg(args: string[], failureMessage: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-y", ...args], {
      timeout: FFMPEG_TIMEOUT_MS,
      killSignal: "SIGKILL",
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-8000)
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new SayableError(error.code === "ENOENT" ? FFMPEG_MISSING_MESSAGE : failureMessage)
      )
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr)
      } else {
        console.error("ffmpeg said:", stderr)
        reject(new SayableError(failureMessage))
      }
    })
  })
}

/**
 * The length ffmpeg read off the file, from the "Duration: 00:12:04.52" line
 * it prints for every input. Null when it could not tell, which happens for a
 * live recording that was never finished.
 */
export function readDurationSeconds(ffmpegSaid: string): number | null {
  const match = ffmpegSaid.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (!match) return null
  const seconds =
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null
}
