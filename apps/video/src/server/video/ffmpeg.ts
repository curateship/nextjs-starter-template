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
 * How long one run may take before it is given up on, unless the caller says
 * otherwise. A clip being listened to is capped at ten minutes of sound and
 * takes seconds. Only an export can run longer, and it passes its own limit.
 */
export const FFMPEG_TIMEOUT_MS = 10 * 60_000

/**
 * `signal` stops the run partway. ffmpeg is killed outright, since whatever it
 * was writing is about to be thrown away, and the promise only settles once
 * the process has really gone. That order matters: the caller deletes the
 * scratch folder next, and a process still writing into it would put files
 * back.
 */
export async function runFfmpeg(
  args: string[],
  failureMessage: string,
  signal?: AbortSignal,
  timeoutMs: number = FFMPEG_TIMEOUT_MS
): Promise<string> {
  signal?.throwIfAborted()
  return new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], {
      timeout: timeoutMs,
      signal,
      killSignal: "SIGKILL",
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000)
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      // Being stopped is reported from "close", once the process has exited.
      if (signal?.aborted) return
      reject(
        new Error(
          error.code === "ENOENT" ? FFMPEG_MISSING_MESSAGE : failureMessage
        )
      )
    })
    child.on("close", (code) => {
      if (signal?.aborted) {
        reject(signal.reason)
      } else if (code === 0) {
        resolve(stderr)
      } else {
        console.error("ffmpeg said:", stderr)
        reject(new Error(failureMessage))
      }
    })
  })
}
