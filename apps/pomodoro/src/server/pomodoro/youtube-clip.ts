import { execFile, spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import {
  clipStartProblem,
  YOUTUBE_CLIP_SECONDS,
  youtubeClipAddress,
} from "@/lib/pomodoro/youtube-links"

/**
 * Cutting 5 seconds of a YouTube video, in 4K when the video has it. See
 * "Make a theme from a YouTube clip" in `workspace/docs/catalog-admin.md`.
 * Tyler, 10 Oct 2026: "it should be capturing the 4k version".
 *
 * Two programs, each doing one thing. yt-dlp, a free program that reads
 * YouTube, says what the video is and where its picture-only stream lives,
 * and downloads nothing. FFmpeg then reads just those 5 seconds from the
 * stream and writes them once, as H.264 in an MP4 with no sound, which every
 * browser plays. That one encode is the finished film: the catalogue worker
 * keeps it as it is.
 *
 * yt-dlp could cut the stretch itself, but it re-encodes into the stream's
 * own format, and YouTube's 4K is often VP9 in WebM. That took 166 seconds of
 * processor time for 5 seconds of Big Buck Bunny, against 34 this way.
 */

/** Long enough for a slow read of 5 seconds of 4K, short enough to give up. */
const STEP_TIMEOUT_MS = 3 * 60 * 1000

/** Nothing above 4K, and a plain https stream when there is one. */
const FORMAT = "bv*[height<=2160][protocol=https]/bv*[height<=2160]"

/**
 * yt-dlp's words for a video that will never be fetched, however often it is
 * tried. Anything else, such as a timeout or "Too Many Requests", is a blip
 * and the row is tried again.
 */
const FOR_GOOD =
  /private video|video (is )?unavailable|video is not available|been removed|terminated|confirm your age|age-restricted|members-only|copyright/i

export const YT_DLP_MISSING_MESSAGE = "yt-dlp is not installed on this server"
const FFMPEG_MISSING_MESSAGE = "FFmpeg is not installed on this server"

/** A refusal that trying again will not change: the row fails at once. */
export class YoutubeClipRefusedError extends Error {}

export type YoutubeClip = {
  bytes: Uint8Array
  title: string | null
  channel: string | null
}

const run = promisify(execFile)

export async function downloadYoutubeClip(id: string, start: number): Promise<YoutubeClip> {
  const answer = await runYtDlp([
    "--no-playlist",
    // yt-dlp needs a JavaScript program to answer YouTube's checks. The
    // worker is one, so no second program is installed for it.
    "--js-runtimes",
    `node:${process.execPath}`,
    "-j",
    "-f",
    FORMAT,
    youtubeClipAddress(id, start),
  ])

  const info = readInfo(answer.stdout)
  if (!info) {
    // YouTube said nothing about the video. The bot check and a video that
    // is private, removed or age-locked fail the row at once; a blip is
    // tried again.
    if (/confirm you.?re not a bot/i.test(answer.stderr))
      throw new YoutubeClipRefusedError(
        "YouTube refused the server. Tyler has to decide how to get round it."
      )
    const said = lastError(answer.stderr)
    if (said && FOR_GOOD.test(said)) throw new YoutubeClipRefusedError(said)
    throw new Error(said ?? "yt-dlp said nothing about the video")
  }
  const duration = typeof info.duration === "number" ? info.duration : null
  if (info.is_live === true || !duration)
    throw new YoutubeClipRefusedError("That video has no fixed length, such as a live stream.")
  const problem = clipStartProblem(start, duration)
  if (problem) throw new YoutubeClipRefusedError(problem)

  const stream = readStream(info)
  if (!stream) throw new Error("yt-dlp named no stream to read")

  return {
    bytes: await cutClip(stream, start),
    title: readText(info.title),
    channel: readText(info.channel ?? info.uploader),
  }
}

type Stream = { url: string; headers: string }

/**
 * The stream's address and the headers YouTube expects with it. Only an
 * https address is used, so FFmpeg is never pointed at a file or another
 * protocol, and a header holding a line break is dropped.
 */
function readStream(info: Record<string, unknown>): Stream | null {
  if (typeof info.url !== "string") return null
  let url: URL
  try {
    url = new URL(info.url)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  const given =
    info.http_headers && typeof info.http_headers === "object"
      ? Object.entries(info.http_headers as Record<string, unknown>)
      : []
  const headers = given
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && !/[\r\n]/.test(entry[0] + entry[1])
    )
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("")
  return { url: url.href, headers }
}

/** The 5 seconds from `start`, as H.264 with no sound, at the stream's own size. */
async function cutClip(stream: Stream, start: number) {
  const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-youtube-"))
  const output = path.join(folder, "clip.mp4")
  try {
    await run(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        // Secure web connections only: a playlist naming a file or another
        // protocol is refused rather than read.
        "-protocol_whitelist",
        "https,tls,tcp",
        ...(stream.headers ? ["-headers", stream.headers] : []),
        // Before the input, so FFmpeg jumps there instead of reading the video
        // from the start.
        "-ss",
        String(start),
        "-i",
        stream.url,
        "-t",
        String(YOUTUBE_CLIP_SECONDS),
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        // The index at the front, so the browser starts playing at once.
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: STEP_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
    ).catch((error: NodeJS.ErrnoException & { stderr?: string }) => {
      if (error.code === "ENOENT") throw new YoutubeClipRefusedError(FFMPEG_MISSING_MESSAGE)
      // Only FFmpeg's last words: the error's own message holds the signed
      // stream address, which has no business in a log.
      const last = String(error.stderr ?? "").trim().split("\n").at(-1)?.slice(0, 250)
      throw new Error(`FFmpeg could not cut the clip${last ? `: ${last}` : ""}`)
    })
    const bytes = new Uint8Array(await readFile(output))
    if (!bytes.byteLength) throw new Error("FFmpeg wrote an empty clip")
    return bytes
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() => undefined)
  }
}

function readInfo(stdout: string): Record<string, unknown> | null {
  const line = stdout.split("\n").find((entry) => entry.startsWith("{"))
  if (!line) return null
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** yt-dlp's last "ERROR: [youtube] abc: Video unavailable", as "Video unavailable". */
function lastError(stderr: string) {
  const line = stderr
    .split("\n")
    .reverse()
    .find((entry) => entry.startsWith("ERROR:"))
  if (!line) return null
  return line.replace(/^ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?/, "").trim().slice(0, 250) || null
}

type YtDlpRun = { stdout: string; stderr: string }

/** Runs yt-dlp and hands back what it printed, whether or not it succeeded. */
function runYtDlp(args: string[]): Promise<YtDlpRun> {
  return new Promise<YtDlpRun>((resolve, reject) => {
    const child = spawn("yt-dlp", args, { timeout: STEP_TIMEOUT_MS })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      // Only the tail is kept: a stalled run can print a great deal.
      stderr = (stderr + chunk.toString()).slice(-4000)
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new YoutubeClipRefusedError(YT_DLP_MISSING_MESSAGE)
          : error
      )
    })
    child.on("close", () => resolve({ stdout, stderr }))
  })
}
