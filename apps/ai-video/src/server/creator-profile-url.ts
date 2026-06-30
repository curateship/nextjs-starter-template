import type { ViralPlatform } from "@/server/video-download"

export type CreatorProfileUrl = {
  platform: ViralPlatform
  username: string
}

export const CREATOR_PROFILE_URL_ERRORS = {
  invalid: "Enter a valid TikTok or Instagram profile URL.",
  unsupported: "Only TikTok and Instagram profile URLs are supported.",
  reelOrPost: "Paste a TikTok or Instagram profile URL, not a reel or post URL.",
} as const

const INSTAGRAM_POST_SEGMENTS = new Set(["p", "reel", "reels", "stories", "tv"])
const USERNAME_RE = /^[a-z0-9._]{1,255}$/

export function parseCreatorProfileUrl(profileUrl: string): CreatorProfileUrl {
  const trimmed = profileUrl.trim()
  if (!trimmed) {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.invalid)
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.invalid)
  }

  if (parsed.protocol !== "https:") {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.invalid)
  }

  const host = parsed.hostname.toLowerCase()
  const segments = parsed.pathname.split("/").filter(Boolean)

  if (host === "www.tiktok.com") {
    return parseTikTokSegments(segments)
  }

  if (host === "www.instagram.com") {
    return parseInstagramSegments(segments)
  }

  throw new Error(CREATOR_PROFILE_URL_ERRORS.unsupported)
}

function parseTikTokSegments(segments: string[]): CreatorProfileUrl {
  const [profileSegment] = segments
  if (profileSegment?.startsWith("@") && segments.length > 1) {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.reelOrPost)
  }

  if (!profileSegment?.startsWith("@") || segments.length !== 1) {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.invalid)
  }

  return {
    platform: "tiktok",
    username: normalizeUsername(profileSegment.slice(1)),
  }
}

function parseInstagramSegments(segments: string[]): CreatorProfileUrl {
  const [profileSegment] = segments
  if (
    profileSegment &&
    INSTAGRAM_POST_SEGMENTS.has(profileSegment.toLowerCase())
  ) {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.reelOrPost)
  }

  if (!profileSegment || segments.length !== 1) {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.invalid)
  }

  return {
    platform: "instagram",
    username: normalizeUsername(profileSegment),
  }
}

function normalizeUsername(username: string) {
  const normalized = username.trim().toLowerCase()
  if (!USERNAME_RE.test(normalized) || !/[a-z0-9]/.test(normalized)) {
    throw new Error(CREATOR_PROFILE_URL_ERRORS.invalid)
  }
  return normalized
}
