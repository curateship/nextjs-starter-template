import { spawn } from "node:child_process"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import type { CreatorPlatform } from "@/lib/video/creators"

/**
 * Fetching a video file with yt-dlp.
 *
 * The host check at the top is the security boundary, not a convenience: the
 * address is handed to a program that will fetch whatever it is given, so
 * anything that is not YouTube, TikTok or Instagram is refused before yt-dlp
 * is started at all. That is what stops this being a door to every address on
 * the inside of the server.
 *
 * Nothing here touches the database. The worker in `saved-videos.ts` decides
 * when a download happens and what becomes of the bytes.
 */

export const YT_DLP_MISSING_MESSAGE = "yt-dlp is not installed on this server"

/** How long one download may take before it is given up on. */
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000

/**
 * The biggest file worth fetching. The shell's library refuses a video over
 * 100MB anyway, so a bigger one would be downloaded and then thrown away.
 */
export function maxDownloadBytes(): number {
  const configured = Number.parseInt(
    process.env.VIDEO_MAX_DOWNLOAD_BYTES || "",
    10
  )
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 100 * 1024 * 1024
}

/** What yt-dlp may write, mapped to the types the library accepts. */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
}

export type DownloadedVideo = {
  bytes: Uint8Array
  mimeType: string
  title: string | null
  channelName: string | null
  durationSeconds: number | null
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: Date | null
}

export type VideoLink = {
  platform: CreatorPlatform
  /** The platform's own id for the video, which keys the saved row. */
  platformVideoId: string
}

export const VIDEO_LINK_ERROR =
  "Only YouTube, TikTok and Instagram video links can be saved."

/**
 * Which platform an address belongs to and which video it points at.
 *
 * Refuses everything else, which is the SSRF guard — `downloadViralVideo` calls
 * this first and will not run without it.
 */
export function parseVideoLink(url: string): VideoLink {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    throw new Error(VIDEO_LINK_ERROR)
  }
  if (parsed.protocol !== "https:") throw new Error(VIDEO_LINK_ERROR)

  const host = parsed.hostname.toLowerCase()
  const segments = parsed.pathname.split("/").filter(Boolean)

  if (host === "youtu.be") {
    return youtubeLink(segments[0])
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    // Both shapes a Short can arrive as: /shorts/<id> and /watch?v=<id>.
    if (segments[0]?.toLowerCase() === "shorts") return youtubeLink(segments[1])
    if (segments[0]?.toLowerCase() === "watch") {
      return youtubeLink(parsed.searchParams.get("v") ?? undefined)
    }
    throw new Error(VIDEO_LINK_ERROR)
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    // tiktok.com/@creator/video/<id>, and the shortened vm.tiktok.com/<id>.
    const videoAt = segments.indexOf("video")
    const id = videoAt >= 0 ? segments[videoAt + 1] : segments[0]
    return { platform: "tiktok", platformVideoId: readId(id, /^[A-Za-z0-9]+$/) }
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    // instagram.com/reel/<id>, /p/<id>, /tv/<id>.
    const kind = segments[0]?.toLowerCase()
    if (kind !== "reel" && kind !== "reels" && kind !== "p" && kind !== "tv") {
      throw new Error(VIDEO_LINK_ERROR)
    }
    return {
      platform: "instagram",
      platformVideoId: readId(segments[1], /^[A-Za-z0-9_-]+$/),
    }
  }
  throw new Error(VIDEO_LINK_ERROR)
}

function youtubeLink(id: string | undefined): VideoLink {
  return { platform: "youtube", platformVideoId: readId(id, /^[A-Za-z0-9_-]+$/) }
}

/** An id longer than the column, or with anything odd in it, is not an id. */
function readId(value: string | undefined, allowed: RegExp): string {
  const id = (value ?? "").trim()
  if (!id || id.length > 100 || !allowed.test(id)) {
    throw new Error(VIDEO_LINK_ERROR)
  }
  return id
}

/**
 * Downloads one video and hands back its bytes and whatever the platform said
 * about it. The address is checked first, so a link to anywhere else never
 * reaches yt-dlp.
 */
export async function downloadViralVideo(
  url: string
): Promise<DownloadedVideo> {
  parseVideoLink(url)

  const maxBytes = maxDownloadBytes()
  const dir = await mkdtemp(path.join(tmpdir(), "viral-"))
  try {
    // -j --no-simulate prints what the platform knows about the video AND
    // downloads the file, so one run does both.
    const stdout = await runYtDlp([
      "--impersonate",
      "chrome",
      "-j",
      "--no-simulate",
      "--no-playlist",
      "--no-progress",
      "--max-filesize",
      String(maxBytes),
      "-f",
      "mp4/best",
      "-o",
      path.join(dir, "video.%(ext)s"),
      url,
    ])

    let info: Record<string, unknown>
    try {
      info = JSON.parse(stdout) as Record<string, unknown>
    } catch {
      throw new Error("The video could not be downloaded.")
    }

    const files = await readdir(dir)
    const filename = files.find((name) => name.startsWith("video."))
    if (!filename) {
      // yt-dlp writes nothing when the file is over the cap, so this is what
      // "too big" looks like from here.
      throw new Error(
        `The video could not be downloaded. It may be larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`
      )
    }

    const extension = filename.split(".").pop()?.toLowerCase() ?? ""
    const mimeType = EXTENSION_MIME_TYPES[extension]
    if (!mimeType) {
      throw new Error("The video came back in a format the library cannot hold.")
    }

    const bytes = new Uint8Array(await readFile(path.join(dir, filename)))
    if (!bytes.byteLength) throw new Error("The video came back empty.")
    if (bytes.byteLength > maxBytes) {
      throw new Error(
        `The video is larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`
      )
    }

    return {
      bytes,
      mimeType,
      title: readString(info.title, 500),
      // The two platforms disagree about which field is the handle, so both
      // are tried: Instagram puts the handle in `channel`, TikTok in `uploader`.
      channelName:
        readString(info.uploader, 255) ?? readString(info.channel, 255),
      durationSeconds: readSeconds(info.duration),
      views: readCount(info.view_count),
      likes: readCount(info.like_count),
      comments: readCount(info.comment_count),
      postedAt: readTimestamp(info.timestamp),
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function readString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null
}

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
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
 * Runs yt-dlp and hands back what it printed. A missing program is named
 * plainly, the way `FFMPEG_MISSING_MESSAGE` does for ffmpeg, and yt-dlp's own
 * last ERROR line is kept when there is one — "this post is private" is worth
 * far more on the failed row than "download failed".
 */
export function runYtDlp(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("yt-dlp", args, { timeout: DOWNLOAD_TIMEOUT_MS })
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      // Only the tail is kept: a stalled download can print megabytes.
      stderr = (stderr + chunk.toString()).slice(-4000)
    })

    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
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
      const said = stderr
        .split("\n")
        .reverse()
        .find((line) => line.includes("ERROR"))
      reject(
        new Error(
          said
            ? `The video could not be downloaded: ${said.trim().slice(0, 300)}`
            : "The video could not be downloaded."
        )
      )
    })
  })
}
