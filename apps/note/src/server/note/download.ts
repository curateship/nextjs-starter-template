import { spawn } from "node:child_process"
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { checkLinkHost, type VideoLink } from "@/server/note/links"
import { SayableError } from "@/server/note/sayable"
import { LIBRARY_SAYS, MAX_DURATION_SECONDS, MAX_FILE_BYTES, type MediaKind } from "@/lib/note/library/notes"

/**
 * Fetching one video with yt-dlp, into a folder of its own on this machine.
 *
 * Copied from the Video app's `src/server/video/viral/download.ts` and widened
 * to any site yt-dlp can read. The file is never read into memory here: the
 * caller gets its path, stores it in pieces, and removes the folder.
 *
 * Nothing here touches the database. The worker in `jobs.ts` decides when a
 * download happens and what becomes of the file.
 */

export const YT_DLP_MISSING_MESSAGE = "yt-dlp is not installed on this server"

/** How long one download may take before it is given up on. */
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000

/** What yt-dlp may write, and what the library calls each one. */
const EXTENSIONS: Record<string, { mimeType: string; kind: MediaKind }> = {
  mp4: { mimeType: "video/mp4", kind: "video" },
  m4v: { mimeType: "video/mp4", kind: "video" },
  mov: { mimeType: "video/quicktime", kind: "video" },
  webm: { mimeType: "video/webm", kind: "video" },
  mkv: { mimeType: "video/x-matroska", kind: "video" },
  mp3: { mimeType: "audio/mpeg", kind: "audio" },
  m4a: { mimeType: "audio/mp4", kind: "audio" },
  aac: { mimeType: "audio/aac", kind: "audio" },
  wav: { mimeType: "audio/wav", kind: "audio" },
  ogg: { mimeType: "audio/ogg", kind: "audio" },
  opus: { mimeType: "audio/ogg", kind: "audio" },
}

export type DownloadedVideo = {
  /** The folder holding the file. The caller removes it once done. */
  dir: string
  filePath: string
  mimeType: string
  kind: MediaKind
  sizeBytes: number
  /** yt-dlp's name for the site, lowercased: "youtube", "tiktok", "vimeo". */
  source: string | null
  /** yt-dlp's own id for the video, which is what saving it twice is judged by. */
  platformVideoId: string | null
  title: string | null
  channelName: string | null
  durationSeconds: number | null
  postedAt: Date | null
}

/**
 * Downloads one video. A link from anywhere but the three known sites has its
 * host checked again first, because the name may point somewhere else now
 * than when it was pasted.
 *
 * A video over 30 minutes is refused by yt-dlp before any bytes move, and one
 * over 500MB as soon as its size is known. yt-dlp's own last ERROR line is
 * kept otherwise, so "This post is private" reaches the card.
 */
export async function downloadVideo(link: VideoLink): Promise<DownloadedVideo> {
  await checkLinkHost(link)

  const dir = await mkdtemp(path.join(tmpdir(), "note-video-"))
  try {
    const said = await runYtDlp([
      "--ignore-config",
      "--impersonate",
      "chrome",
      // The metadata goes to a file beside the video rather than to the
      // screen, because only without -j does yt-dlp say why it skipped one.
      "--write-info-json",
      "--no-playlist",
      "--playlist-items",
      "1",
      "--no-progress",
      "--max-filesize",
      "500M",
      // `<=?` lets through a site that does not say how long its video is.
      // The worker reads the length off the file and refuses it then.
      "--match-filter",
      `duration <=? ${MAX_DURATION_SECONDS}`,
      "-f",
      "bv*[height<=720]+ba/b[height<=720]/best",
      // Among the files that fit, H.264 and AAC first: the one pairing every
      // phone's player plays.
      "-S",
      "vcodec:h264,acodec:aac",
      "--merge-output-format",
      "mp4",
      "-o",
      path.join(dir, "video.%(ext)s"),
      "--",
      link.url,
    ])

    if (said.includes("does not pass filter")) throw new SayableError(LIBRARY_SAYS.tooLong)
    if (said.includes("larger than max-filesize")) throw new SayableError(LIBRARY_SAYS.tooBig)

    const files = await readdir(dir)
    const filename = files.find(
      (name) =>
        name.startsWith("video.") &&
        !name.endsWith(".info.json") &&
        EXTENSIONS[name.split(".").pop()?.toLowerCase() ?? ""] !== undefined
    )
    if (!filename) throw new SayableError("The video could not be downloaded.")

    const extension = filename.split(".").pop()?.toLowerCase() ?? ""
    const { mimeType, kind } = EXTENSIONS[extension]
    const filePath = path.join(dir, filename)
    const { size } = await stat(filePath)
    if (!size) throw new SayableError("The video came back empty.")
    // Two pieces under the cap each can still join into one over it.
    if (size > MAX_FILE_BYTES) throw new SayableError(LIBRARY_SAYS.tooBig)

    const info = await readInfo(path.join(dir, "video.info.json"))
    const durationSeconds = readSeconds(info.duration)
    if (durationSeconds !== null && durationSeconds > MAX_DURATION_SECONDS) {
      throw new SayableError(LIBRARY_SAYS.tooLong)
    }

    return {
      dir,
      filePath,
      mimeType,
      kind,
      sizeBytes: size,
      source: readString(info.extractor_key, 60)?.toLowerCase() ?? null,
      platformVideoId: readString(info.id, 200),
      title: readString(info.title, 500),
      // The sites disagree about which field is the person: Instagram puts
      // the handle in `channel`, TikTok in `uploader`.
      channelName: readString(info.uploader, 255) ?? readString(info.channel, 255),
      durationSeconds,
      postedAt: readTimestamp(info.timestamp),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function readInfo(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"))
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    // The file is there; what the site said about it is a nice-to-have.
    return {}
  }
}

function readString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

function readSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null
}

function readTimestamp(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const at = new Date(value * 1000)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * The part of yt-dlp's ERROR line a person can act on. It starts
 * "ERROR: [Instagram] DQx1: ", which says nothing to anybody reading a card.
 */
export function readYtDlpError(stderr: string): string | null {
  const line = stderr
    .split("\n")
    .reverse()
    .find((entry) => entry.includes("ERROR"))
  if (!line) return null
  const words = line
    .trim()
    .replace(/^ERROR:\s*/, "")
    .replace(/^\[[^\]]*\]\s*(?:[\w-]+:\s+)?/, "")
    .trim()
  return words ? words.slice(0, 300) : null
}

/**
 * Runs yt-dlp and hands back the tail of what it printed. A missing program
 * is named plainly, the way ffmpeg's is.
 */
export function runYtDlp(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("yt-dlp", args, {
      timeout: DOWNLOAD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    })
    let stdout = ""
    let stderr = ""

    // Only the tails are kept: a stalled download can print megabytes.
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-8000)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000)
    })

    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new SayableError(
          error.code === "ENOENT"
            ? YT_DLP_MISSING_MESSAGE
            : "The video could not be downloaded."
        )
      )
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(new SayableError(readYtDlpError(stderr) ?? "The video could not be downloaded."))
    })
  })
}
