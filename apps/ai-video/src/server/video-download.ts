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
    // Raw yt-dlp fields — handle vs display name is platform-swapped:
    // Instagram: uploader = full name, channel = handle.
    // TikTok: uploader = handle, channel = nickname.
    uploaderName: string | null
    channelName: string | null
    durationMs: number | null
    viewCount: number | null
    likeCount: number | null
    commentCount: number | null
    postedAt: string | null
  }
}

export type DirectVideoDownload = {
  videoUrl: string
  metadata: DownloadedViralVideo["metadata"]
}

export type RecentUpload = {
  sourceUrl: string
  download?: DirectVideoDownload
}

export type RecentUploads = {
  uploads: RecentUpload[]
  profileMetrics: CreatorProfileMetrics | null
}

export type CreatorProfileMetrics = {
  displayName: string | null
  followerCount: number | null
}

// Kill stuck downloads; platforms sometimes stall mid-transfer.
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000
// Matches the media pipeline's video limit — bigger files fail ingest anyway.
const MAX_FILESIZE = "100M"
const PROFILE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
const INSTAGRAM_APP_ID = "936619743392459"

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
  follower_count?: unknown
  channel_follower_count?: unknown
  timestamp?: unknown
}

type InstagramProfileMedia = {
  __typename?: unknown
  shortcode?: unknown
  is_video?: unknown
  product_type?: unknown
  video_url?: unknown
  video_view_count?: unknown
  taken_at_timestamp?: unknown
  edge_liked_by?: { count?: unknown }
  edge_media_preview_like?: { count?: unknown }
  edge_media_to_comment?: { count?: unknown }
  edge_media_to_caption?: {
    edges?: Array<{ node?: { text?: unknown } }>
  }
}

type InstagramProfileResponse = {
  data?: {
    user?: {
      username?: unknown
      full_name?: unknown
      edge_followed_by?: { count?: unknown }
      edge_owner_to_timeline_media?: {
        edges?: Array<{ node?: InstagramProfileMedia }>
      }
    }
  }
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

// Downloads a reel and returns the file bytes plus platform metadata.
export async function downloadViralVideo(
  url: string,
  directDownload?: DirectVideoDownload
): Promise<DownloadedViralVideo> {
  detectViralPlatform(url)
  if (directDownload) {
    return downloadDirectViralVideo(directDownload)
  }

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

    const stdout = await runYtDlp(["--impersonate", "chrome", ...baseArgs])

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
        uploaderName: readString(info.uploader, 255),
        channelName: readString(info.channel, 255),
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

// Lists a creator's most recent uploads using the canonical source for each
// platform: TikTok through yt-dlp, Instagram through public profile media JSON.
export async function listRecentUploads(
  platform: ViralPlatform,
  handle: string,
  limit: number
): Promise<RecentUploads> {
  if (platform === "instagram") {
    const profile = await fetchInstagramProfile(handle)
    return {
      uploads: instagramProfileToRecentUploads(profile, handle, limit),
      profileMetrics: instagramProfileToMetrics(profile),
    }
  }

  return {
    uploads: await listTikTokRecentUploads(handle, limit),
    profileMetrics: null,
  }
}

async function listTikTokRecentUploads(
  handle: string,
  limit: number
): Promise<RecentUpload[]> {
  const profileUrl = `https://www.tiktok.com/@${encodeURIComponent(handle)}`
  const args = [
    "--flat-playlist",
    "--playlist-end",
    String(limit),
    "-j",
    profileUrl,
  ]
  const stdout = await runYtDlp(["--impersonate", "chrome", ...args])

  // One JSON object per line; keep only entries that resolve to a supported
  // platform URL.
  const uploads: RecentUpload[] = []
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line) as { url?: unknown; webpage_url?: unknown }
      const url =
        readString(entry.webpage_url, 2048) ?? readString(entry.url, 2048)
      if (!url) continue
      detectViralPlatform(url)
      uploads.push({ sourceUrl: url })
    } catch {
      // Skip malformed lines / non-platform URLs.
    }
  }
  return uploads
}

export async function fetchCreatorProfileMetrics(
  platform: ViralPlatform,
  handle: string
): Promise<CreatorProfileMetrics> {
  if (platform === "instagram") {
    const profile = await fetchInstagramProfile(handle)
    return instagramProfileToMetrics(profile)
  }

  const username = handle.trim().replace(/^@/, "").toLowerCase()
  const stdout = await runYtDlp([
    "--impersonate",
    "chrome",
    "--dump-single-json",
    "--playlist-end",
    "1",
    `https://www.tiktok.com/@${encodeURIComponent(username)}`,
  ])
  const info = JSON.parse(stdout) as YtDlpInfo
  return {
    displayName: readString(info.channel, 255),
    followerCount:
      readCount(info.follower_count) ?? readCount(info.channel_follower_count),
  }
}

function instagramProfileToMetrics(
  profile: InstagramProfileResponse
): CreatorProfileMetrics {
  const user = profile.data?.user
  return {
    displayName: readString(user?.full_name, 255),
    followerCount: readCount(user?.edge_followed_by?.count),
  }
}

function instagramProfileToRecentUploads(
  profile: InstagramProfileResponse,
  handle: string,
  limit: number
): RecentUpload[] {
  const user = profile.data?.user
  const username = handle.trim().replace(/^@/, "").toLowerCase()
  const ownerUsername = readString(user?.username, 255) ?? username
  const ownerName = readString(user?.full_name, 255)
  const edges = user?.edge_owner_to_timeline_media?.edges ?? []

  return edges
    .slice(0, limit)
    .map((edge) =>
      instagramMediaToRecentUpload(edge.node, ownerUsername, ownerName)
    )
    .filter((upload): upload is RecentUpload => upload !== null)
}

async function fetchInstagramProfile(
  handle: string
): Promise<InstagramProfileResponse> {
  const username = handle.trim().replace(/^@/, "").toLowerCase()
  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      headers: {
        accept: "*/*",
        referer: `https://www.instagram.com/${encodeURIComponent(username)}/`,
        "user-agent": PROFILE_USER_AGENT,
        "x-ig-app-id": INSTAGRAM_APP_ID,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Instagram profile lookup failed (${response.status})`)
  }

  return (await response.json()) as InstagramProfileResponse
}

function instagramMediaToRecentUpload(
  node: InstagramProfileMedia | undefined,
  username: string,
  displayName: string | null
): RecentUpload | null {
  if (!node?.is_video) return null

  const shortcode = readString(node.shortcode, 255)
  const videoUrl = readString(node.video_url, 4096)
  if (!shortcode || !videoUrl) return null

  const caption = readString(
    node.edge_media_to_caption?.edges?.[0]?.node?.text,
    500
  )
  const postedAt =
    typeof node.taken_at_timestamp === "number" &&
    Number.isFinite(node.taken_at_timestamp)
      ? new Date(node.taken_at_timestamp * 1000).toISOString()
      : null

  return {
    sourceUrl: `https://www.instagram.com/reel/${shortcode}/`,
    download: {
      videoUrl,
      metadata: {
        title: caption,
        author: displayName ?? username,
        uploaderName: displayName,
        channelName: username,
        durationMs: null,
        viewCount: readCount(node.video_view_count),
        likeCount:
          readCount(node.edge_liked_by?.count) ??
          readCount(node.edge_media_preview_like?.count),
        commentCount: readCount(node.edge_media_to_comment?.count),
        postedAt,
      },
    },
  }
}

async function downloadDirectViralVideo(
  directDownload: DirectVideoDownload
): Promise<DownloadedViralVideo> {
  const parsed = new URL(directDownload.videoUrl)
  if (
    parsed.protocol !== "https:" ||
    (!parsed.hostname.endsWith(".fbcdn.net") &&
      !parsed.hostname.endsWith(".cdninstagram.com"))
  ) {
    throw new Error("Instagram video URL was not trusted")
  }

  const response = await fetch(directDownload.videoUrl, {
    headers: { "user-agent": PROFILE_USER_AGENT },
  })
  if (!response.ok) {
    throw new Error(`Instagram video download failed (${response.status})`)
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() || "video/mp4"
  const mimeType = contentType.startsWith("video/") ? contentType : "video/mp4"

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType,
    metadata: directDownload.metadata,
  }
}

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null
}

function readCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value)
  }
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""))
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  }
  return null
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

// Extracts the audio track as 16 kHz mono WAV for transcription. Gemini times
// VIDEO inputs against ~1 fps frame sampling, which makes caption timestamps
// coarse and laggy; transcribing audio-only restores accurate timing. PCM WAV
// needs no external codec, so it works on any ffmpeg build. Returns null on
// failure so the caller can fall back to the original file.
export async function extractAudioWav(
  bytes: Uint8Array,
  mimeType: string
): Promise<Uint8Array | null> {
  const ext = mimeType === "video/webm" ? "webm" : "mp4"
  const dir = await mkdtemp(path.join(tmpdir(), "audio-"))
  const inputPath = path.join(dir, `input.${ext}`)
  const outputPath = path.join(dir, "audio.wav")
  try {
    await writeFile(inputPath, bytes)
    await runFfmpeg([
      "-i", inputPath,
      "-vn", // drop the video stream
      "-ac", "1", // mono
      "-ar", "16000", // 16 kHz is plenty for speech
      "-c:a", "pcm_s16le",
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
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`ffmpeg exited ${code}`))
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
