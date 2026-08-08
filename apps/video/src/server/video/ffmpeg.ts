import { spawn } from "node:child_process"

/**
 * Running ffmpeg, in one place.
 *
 * The exporter and the caption transcriber both need it, and both need the
 * same two things back: the tail of what ffmpeg said (the loudness pass reads
 * its measurement out of that, and the log keeps it when something goes
 * wrong), and one sentence a person can act on when the program simply is not
 * installed.
 */

export const FFMPEG_MISSING_MESSAGE = "ffmpeg is not installed on this server"

/**
 * How long any one run may take before it is given up on. Ten minutes is what
 * the exporter has always allowed itself, and it is the longest job here — a
 * clip being listened to is capped at ten minutes of sound and takes seconds.
 */
const FFMPEG_TIMEOUT_MS = 10 * 60_000

export async function runFfmpeg(
  args: string[],
  failureMessage: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], {
      timeout: FFMPEG_TIMEOUT_MS,
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000)
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          error.code === "ENOENT" ? FFMPEG_MISSING_MESSAGE : failureMessage
        )
      )
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr)
      } else {
        console.error("ffmpeg said:", stderr)
        reject(new Error(failureMessage))
      }
    })
  })
}
