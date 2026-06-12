import { spawn } from "node:child_process"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

export type ViralPlatform = "tiktok" | "instagram"

export type DownloadedViralVideo = {
  bytes: Uint8Array
  mimeType: string
  metadata: {
    title: string | null
    author: string | null
    durationMs: number | null
    viewCount: number | null
    likeCount: number | null
    commentCount: number | null
    postedAt: string | null
  }
}

// Kill stuck downloads; platforms sometimes stall mid-transfer.
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000
// Matches the media pipeline's video limit — bigger files fail ingest anyway.
const MAX_FILESIZE = "100M"

// Container extensions yt-dlp may produce, mapped to the media pipeline's
// allowed video MIME types (see VIDEO_TYPES in media.ts).
const EXTENSION_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
}

// Shape of the bits we read from yt-dlp's info JSON.
type YtDlpInfo = {
  title?: unknown
  uploader?: unknown
  channel?: unknown
  duration?: unknown
  view_count?: unknown
  like_count?: unknown
  comment_count?: unknown
  timestamp?: unknown
}

// Restricts source URLs to the two supported platforms — also acts as an
// SSRF guard since the URL is handed to a subprocess that fetches it.
export function detectViralPlatform(url: string): ViralPlatform {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Only TikTok and Instagram URLs are supported")
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only TikTok and Instagram URLs are supported")
  }

  const host = parsed.hostname.toLowerCase()
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok"
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return "instagram"
  }
  throw new Error("Only TikTok and Instagram URLs are supported")
}

// Downloads the reel via yt-dlp into a temp dir and returns the file bytes
// plus the platform metadata (engagement stats come along for free).
// Single integration point: swap this implementation if yt-dlp breaks.
export async function downloadViralVideo(
  url: string
): Promise<DownloadedViralVideo> {
  detectViralPlatform(url)

  const dir = await mkdtemp(path.join(tmpdir(), "viral-"))
  try {
    // -j --no-simulate prints the info JSON to stdout AND downloads the file.
    const baseArgs = [
      "-j",
      "--no-simulate",
      "--no-playlist",
      "--no-progress",
      "--max-filesize",
      MAX_FILESIZE,
      "-f",
      "mp4/best",
      "-o",
      path.join(dir, "video.%(ext)s"),
      url,
    ]

    // TikTok wants a browser TLS fingerprint (needs yt-dlp's curl_cffi extra);
    // fall back to a plain attempt for environments without it — it works too,
    // just less reliably.
    let stdout: string
    try {
      stdout = await runYtDlp(["--impersonate", "chrome", ...baseArgs])
    } catch {
      stdout = await runYtDlp(baseArgs)
    }

    let info: YtDlpInfo
    try {
      info = JSON.parse(stdout) as YtDlpInfo
    } catch {
      throw new Error("Video download failed")
    }

    // Locate whatever container yt-dlp actually wrote.
    const files = await readdir(dir)
    const filename = files.find((name) => name.startsWith("video."))
    if (!filename) {
      throw new Error("Video download failed (no file — it may exceed 100MB)")
    }

    const extension = filename.split(".").pop()?.toLowerCase() ?? ""
    const mimeType = EXTENSION_MIME_TYPES[extension]
    if (!mimeType) {
      throw new Error("Video download produced an unsupported format")
    }

    const bytes = new Uint8Array(await readFile(path.join(dir, filename)))
    if (!bytes.byteLength) {
      throw new Error("Video download failed")
    }

    return {
      bytes,
      mimeType,
      metadata: {
        title: readString(info.title, 500),
        author: readString(info.uploader, 255) ?? readString(info.channel, 255),
        durationMs:
          typeof info.duration === "number" && Number.isFinite(info.duration)
            ? Math.round(info.duration * 1000)
            : null,
        viewCount: readCount(info.view_count),
        likeCount: readCount(info.like_count),
        commentCount: readCount(info.comment_count),
        postedAt:
          typeof info.timestamp === "number" && Number.isFinite(info.timestamp)
            ? new Date(info.timestamp * 1000).toISOString()
            : null,
      },
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null
}

function readCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null
}

// Uses ffmpeg to grab the frame at 1 second as a JPEG.  Returns null on any
// failure — thumbnails are cosmetic and must not block ingestion.
export async function extractVideoThumbnail(
  bytes: Uint8Array,
  mimeType: string
): Promise<Uint8Array | null> {
  const ext = mimeType === "video/webm" ? "webm" : "mp4"
  const dir = await mkdtemp(path.join(tmpdir(), "thumb-"))
  const inputPath = path.join(dir, `input.${ext}`)
  const outputPath = path.join(dir, "thumb.jpg")
  try {
    await writeFile(inputPath, bytes)
    await runFfmpeg([
      "-ss", "00:00:01",
      "-i", inputPath,
      "-vframes", "1",
      "-q:v", "4",
      "-f", "image2",
      outputPath,
    ])
    const data = await readFile(outputPath)
    return new Uint8Array(data)
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], { timeout: 30_000 })
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(new Error(error.code === "ENOENT" ? "ffmpeg not installed" : "ffmpeg failed"))
    })
    child.on("close", (code) => {
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
    })
  })
}

// Spawn yt-dlp and resolve with its stdout; rejects with yt-dlp's own error
// line when available so platform failures (login walls, removed posts)
// surface in the archive row instead of a generic message.
function runYtDlp(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("yt-dlp", args, { timeout: DOWNLOAD_TIMEOUT_MS })
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? "yt-dlp is not installed on the server"
            : "Video download failed"
        )
      )
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      // Surface yt-dlp's last ERROR line (e.g. private post, login required).
      const errorLine = stderr
        .split("\n")
        .reverse()
        .find((line) => line.includes("ERROR"))
      reject(
        new Error(
          errorLine
            ? `Video download failed: ${errorLine.trim().slice(0, 300)}`
            : "Video download failed"
        )
      )
    })
  })
}
