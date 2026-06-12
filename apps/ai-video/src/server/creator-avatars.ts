import type { ViralPlatform } from "@/server/video-download"

// Avatars are nice-to-have: every failure path returns null so the viral
// pipeline never fails because a profile picture couldn't be fetched.

// Both endpoints are unofficial and can hang — cap each request.
const FETCH_TIMEOUT_MS = 15_000
// Profile pictures are small; anything bigger is suspicious.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

// Raster formats only — image/svg+xml can carry script and would be stored
// verbatim on the public R2 domain.
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
])

// Instagram's public web-app id — required header for the profile endpoint.
const INSTAGRAM_APP_ID = "936619743392459"
const INSTAGRAM_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"

export type CreatorAvatar = {
  bytes: Uint8Array
  contentType: string
}

// Fetches the creator's profile picture for the given platform handle.
// Hosts are fixed and the username is URL-encoded, so no SSRF surface.
export async function fetchCreatorAvatar(
  platform: ViralPlatform,
  username: string
): Promise<CreatorAvatar | null> {
  try {
    const imageUrl =
      platform === "instagram"
        ? await resolveInstagramAvatarUrl(username)
        : `https://unavatar.io/tiktok/${encodeURIComponent(username)}?fallback=false`
    if (!imageUrl) return null
    return await downloadAvatarImage(imageUrl)
  } catch {
    return null
  }
}

// Instagram's web profile API returns profile_pic_url_hd without login when
// called with the public web-app id header and a mobile user agent.
async function resolveInstagramAvatarUrl(username: string) {
  const response = await fetch(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      headers: {
        "user-agent": INSTAGRAM_USER_AGENT,
        "x-ig-app-id": INSTAGRAM_APP_ID,
        // Instagram rejects undici's defaults with "SecFetch Policy
        // violation" — present as a top-level navigation instead.
        "sec-fetch-site": "none",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  )
  if (!response.ok) return null

  const payload = (await response.json()) as {
    data?: { user?: { profile_pic_url_hd?: unknown; profile_pic_url?: unknown } }
  }
  const candidate =
    payload.data?.user?.profile_pic_url_hd ?? payload.data?.user?.profile_pic_url

  // Only follow https URLs handed back by Instagram (CDN links).
  if (typeof candidate !== "string") return null
  try {
    if (new URL(candidate).protocol !== "https:") return null
  } catch {
    return null
  }
  return candidate
}

// Downloads the image itself, requiring an image content type and a sane size.
async function downloadAvatarImage(url: string): Promise<CreatorAvatar | null> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) return null

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim()
  if (!contentType || !ALLOWED_AVATAR_TYPES.has(contentType)) return null

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > MAX_AVATAR_BYTES) return null

  return { bytes, contentType }
}
