import type { CreatorPlatform } from "@/lib/video/creators"
import { parseVideoLink, runYtDlp } from "@/server/video/viral/download"
import {
  listYoutubeChannelUploads,
  resolveYoutubeChannel,
  type YoutubeChannel,
} from "@/server/video/viral/youtube"

/**
 * Reading a creator's newest uploads, one way per platform.
 *
 * Metadata only. Nothing here downloads a video file, which is what keeps the
 * watch timer cheap enough to leave running: a check costs one YouTube unit or
 * one page fetch per creator, not a hundred megabytes.
 *
 * - **YouTube** through the Data API, because there is one and it is exact.
 * - **TikTok** through yt-dlp's flat playlist, the way the old app did.
 * - **Instagram** through the public profile data, which also carries the
 *   follower count.
 */

export type CreatorUpload = {
  platformVideoId: string
  url: string
  title: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: Date | null
}

export type CreatorUploads = {
  uploads: CreatorUpload[]
  /** What the fetch happened to learn about the creator, when it learns any. */
  profile: { displayName: string | null; followerCount: number | null } | null
}

const PROFILE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
/** Instagram's public web client id, which its profile endpoint asks for. */
const INSTAGRAM_APP_ID = "936619743392459"
const PROFILE_TIMEOUT_MS = 20_000

export async function listRecentUploads({
  platform,
  handle,
  channelId,
  howMany,
  youtubeApiKey,
}: {
  platform: CreatorPlatform
  handle: string
  channelId: string | null
  howMany: number
  /** Null means no key is saved; YouTube creators are then skipped. */
  youtubeApiKey: string | null
}): Promise<CreatorUploads> {
  if (platform === "youtube") {
    if (!youtubeApiKey || !channelId) return { uploads: [], profile: null }
    const uploads = await listYoutubeChannelUploads(
      channelId,
      howMany,
      youtubeApiKey
    )
    return { uploads, profile: null }
  }
  if (platform === "instagram") return instagramUploads(handle, howMany)
  return tiktokUploads(handle, howMany)
}

/** Who a YouTube channel is, for the add-a-creator step. One unit. */
export async function readYoutubeChannel(
  lookup: { handle: string } | { channelId: string },
  apiKey: string
): Promise<YoutubeChannel | null> {
  return resolveYoutubeChannel(lookup, apiKey)
}

/**
 * TikTok's newest posts. `--flat-playlist` lists the profile without visiting
 * each video, so one run covers the lot.
 */
async function tiktokUploads(
  handle: string,
  howMany: number
): Promise<CreatorUploads> {
  const stdout = await runYtDlp([
    "--impersonate",
    "chrome",
    "--flat-playlist",
    "--playlist-end",
    String(howMany),
    "-j",
    `https://www.tiktok.com/@${encodeURIComponent(handle)}`,
  ])

  const uploads: CreatorUpload[] = []
  let displayName: string | null = null
  let followerCount: number | null = null

  // One JSON object per line, one per video.
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    displayName ??= readString(entry.channel, 255)
    followerCount ??=
      readCount(entry.channel_follower_count) ?? readCount(entry.follower_count)

    const url = readString(entry.webpage_url, 2048) ?? readString(entry.url, 2048)
    if (!url) continue
    // The same guard the downloader uses: an entry pointing anywhere but the
    // three platforms is dropped rather than stored.
    let link
    try {
      link = parseVideoLink(url)
    } catch {
      continue
    }

    uploads.push({
      platformVideoId: link.platformVideoId,
      url,
      title: readString(entry.title, 500),
      thumbnailUrl: readThumbnail(entry.thumbnails) ?? httpsOnly(entry.thumbnail),
      durationSeconds: readSeconds(entry.duration),
      views: readCount(entry.view_count),
      likes: readCount(entry.like_count),
      comments: readCount(entry.comment_count),
      postedAt: readTimestamp(entry.timestamp),
    })
  }

  return {
    uploads,
    profile: displayName || followerCount ? { displayName, followerCount } : null,
  }
}

/** Instagram's public profile data: the newest posts plus the follower count. */
async function instagramUploads(
  handle: string,
  howMany: number
): Promise<CreatorUploads> {
  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
    {
      headers: {
        accept: "*/*",
        referer: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
        "user-agent": PROFILE_USER_AGENT,
        "x-ig-app-id": INSTAGRAM_APP_ID,
      },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    }
  )
  if (!response.ok) {
    throw new Error(
      `Instagram would not answer about @${handle} (HTTP ${response.status}).`
    )
  }

  const payload = (await response.json()) as Record<string, unknown>
  const user = valueAt(payload, ["data", "user"]) as
    | Record<string, unknown>
    | undefined
  if (!user) throw new Error(`Instagram knows no profile called @${handle}.`)

  const edges = (valueAt(user, ["edge_owner_to_timeline_media", "edges"]) ??
    []) as Record<string, unknown>[]

  const uploads = edges.slice(0, howMany).flatMap((edge) => {
    const node = edge.node as Record<string, unknown> | undefined
    if (!node || node.is_video !== true) return []
    const shortcode = readString(node.shortcode, 100)
    if (!shortcode) return []
    return [
      {
        platformVideoId: shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        title: readString(
          valueAt(node, ["edge_media_to_caption", "edges", "0", "node", "text"]),
          500
        ),
        thumbnailUrl: httpsOnly(node.display_url),
        durationSeconds: readSeconds(node.video_duration),
        views: readCount(node.video_view_count),
        likes:
          readCount(valueAt(node, ["edge_liked_by", "count"])) ??
          readCount(valueAt(node, ["edge_media_preview_like", "count"])),
        comments: readCount(valueAt(node, ["edge_media_to_comment", "count"])),
        postedAt: readTimestamp(node.taken_at_timestamp),
      },
    ]
  })

  return {
    uploads,
    profile: {
      displayName: readString(user.full_name, 255),
      followerCount: readCount(valueAt(user, ["edge_followed_by", "count"])),
    },
  }
}

/** Walks a path into outside JSON; anything missing on the way is undefined. */
function valueAt(value: unknown, path: string[]): unknown {
  let current = value
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined
    current = Array.isArray(current)
      ? current[Number(key)]
      : (current as Record<string, unknown>)[key]
  }
  return current
}

function readString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null
}

function readCount(value: unknown): number | null {
  const count =
    typeof value === "string"
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN
  return Number.isFinite(count) && count >= 0 ? Math.round(count) : null
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

/** yt-dlp hands back a list of sizes; the last is the biggest. */
function readThumbnail(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const last = value[value.length - 1] as Record<string, unknown> | undefined
  return httpsOnly(last?.url)
}

/**
 * An address the browser will be given as an `<img src>`. It comes from
 * outside, so anything that is not plainly https is dropped rather than drawn.
 */
function httpsOnly(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("https://")
    ? value
    : null
}
