import {
  isCreatorPlatform,
  type CreatorPlatform,
} from "@/lib/video/creators"

/**
 * Reading a pasted profile link.
 *
 * This is also the gate: the handle it returns is handed to yt-dlp and to
 * YouTube's API, so a link to anywhere else must be refused here, before
 * anything runs. Ported from the old app and widened to YouTube, which the old
 * app's creators never covered.
 */

export type CreatorProfileLink = {
  platform: CreatorPlatform
  /** Always lowercased — the column is matched that way. */
  handle: string
  /** YouTube's own channel id when the link carried one, else null. */
  channelId: string | null
  /** The tidied link, which is what gets stored. */
  profileUrl: string
}

export const PROFILE_LINK_ERRORS = {
  invalid: "Enter a valid YouTube, TikTok or Instagram profile link.",
  unsupported:
    "Only YouTube, TikTok and Instagram profile links work here.",
  videoNotProfile:
    "Paste the creator's profile link, not a link to one of their videos.",
} as const

/** Instagram paths that mean a post rather than somebody's profile. */
const INSTAGRAM_POST_SEGMENTS = new Set(["p", "reel", "reels", "stories", "tv"])
/** YouTube paths that are a video, a list or a search rather than a channel. */
const YOUTUBE_VIDEO_SEGMENTS = new Set([
  "watch",
  "shorts",
  "playlist",
  "results",
  "feed",
  "embed",
  "live",
])

const TIKTOK_HANDLE_RE = /^[a-z0-9._]{1,100}$/
const INSTAGRAM_HANDLE_RE = /^[a-z0-9._]{1,100}$/
/** YouTube allows hyphens in a handle, which the other two do not. */
const YOUTUBE_HANDLE_RE = /^[a-z0-9._-]{1,100}$/
/** A channel id is "UC" and 22 more characters of base64url. */
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/

/** Which platform a host belongs to, or null when it is none of them. */
function platformForHost(host: string): CreatorPlatform | null {
  if (host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube"
  if (host === "youtu.be") return "youtube"
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok"
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return "instagram"
  }
  return null
}

export function parseCreatorProfileLink(link: string): CreatorProfileLink {
  const trimmed = link.trim()
  if (!trimmed) throw new Error(PROFILE_LINK_ERRORS.invalid)

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(PROFILE_LINK_ERRORS.invalid)
  }

  // http is refused along with everything else that is not the web: the host
  // check below is only a guard if the scheme cannot be file: or data:.
  if (parsed.protocol !== "https:") throw new Error(PROFILE_LINK_ERRORS.invalid)

  const platform = platformForHost(parsed.hostname.toLowerCase())
  if (!platform) throw new Error(PROFILE_LINK_ERRORS.unsupported)

  const segments = parsed.pathname.split("/").filter(Boolean)
  if (platform === "youtube") return readYoutube(segments)
  if (platform === "tiktok") return readTiktok(segments)
  return readInstagram(segments)
}

function readYoutube(segments: string[]): CreatorProfileLink {
  const [first, second] = segments
  if (first && YOUTUBE_VIDEO_SEGMENTS.has(first.toLowerCase())) {
    throw new Error(PROFILE_LINK_ERRORS.videoNotProfile)
  }

  // youtube.com/channel/UC… — the one shape that already carries the id the
  // Data API wants, so listing this creator's uploads costs nothing to set up.
  if (first?.toLowerCase() === "channel") {
    if (!second || !YOUTUBE_CHANNEL_ID_RE.test(second)) {
      throw new Error(PROFILE_LINK_ERRORS.invalid)
    }
    return {
      platform: "youtube",
      handle: second.toLowerCase(),
      channelId: second,
      profileUrl: `https://www.youtube.com/channel/${second}`,
    }
  }

  // youtube.com/@handle, and the two older shapes that still point at a
  // channel. All three are resolved to a channel id when the creator is added.
  const raw =
    first?.startsWith("@") === true
      ? first.slice(1)
      : first?.toLowerCase() === "c" || first?.toLowerCase() === "user"
        ? second
        : null
  if (!raw) throw new Error(PROFILE_LINK_ERRORS.invalid)

  const handle = tidyHandle(raw, YOUTUBE_HANDLE_RE)
  return {
    platform: "youtube",
    handle,
    channelId: null,
    profileUrl: `https://www.youtube.com/@${handle}`,
  }
}

function readTiktok(segments: string[]): CreatorProfileLink {
  const [first] = segments
  // tiktok.com/@creator/video/123 is a video, and saying so is more use than
  // "that is not a profile".
  if (first?.startsWith("@") && segments.length > 1) {
    throw new Error(PROFILE_LINK_ERRORS.videoNotProfile)
  }
  if (!first?.startsWith("@") || segments.length !== 1) {
    throw new Error(PROFILE_LINK_ERRORS.invalid)
  }

  const handle = tidyHandle(first.slice(1), TIKTOK_HANDLE_RE)
  return {
    platform: "tiktok",
    handle,
    channelId: null,
    profileUrl: `https://www.tiktok.com/@${handle}`,
  }
}

function readInstagram(segments: string[]): CreatorProfileLink {
  const [first] = segments
  if (first && INSTAGRAM_POST_SEGMENTS.has(first.toLowerCase())) {
    throw new Error(PROFILE_LINK_ERRORS.videoNotProfile)
  }
  if (!first || segments.length !== 1) {
    throw new Error(PROFILE_LINK_ERRORS.invalid)
  }

  const handle = tidyHandle(first, INSTAGRAM_HANDLE_RE)
  return {
    platform: "instagram",
    handle,
    channelId: null,
    profileUrl: `https://www.instagram.com/${handle}`,
  }
}

/**
 * Lowercased and checked against the platform's own alphabet. A handle of
 * nothing but dots and underscores is refused too — it is not a real account,
 * and it is the shape a path traversal would take.
 */
function tidyHandle(raw: string, allowed: RegExp): string {
  const handle = raw.trim().toLowerCase()
  if (!allowed.test(handle) || !/[a-z0-9]/.test(handle)) {
    throw new Error(PROFILE_LINK_ERRORS.invalid)
  }
  return handle
}

/** The link shown beside a creator, rebuilt from what was stored. */
export function creatorProfileUrl(creator: {
  platform: string
  handle: string
  platformChannelId: string | null
}): string {
  if (!isCreatorPlatform(creator.platform)) return ""
  if (creator.platform === "youtube") {
    return creator.platformChannelId
      ? `https://www.youtube.com/channel/${creator.platformChannelId}`
      : `https://www.youtube.com/@${creator.handle}`
  }
  if (creator.platform === "tiktok") {
    return `https://www.tiktok.com/@${creator.handle}`
  }
  return `https://www.instagram.com/${creator.handle}`
}
