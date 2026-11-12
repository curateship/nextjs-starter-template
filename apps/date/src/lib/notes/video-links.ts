/**
 * The video links a note's Video block takes (Travel features 3, part 3;
 * Tyler, 5 Nov 2026: "YouTube, TikTok, Instagram"). A link is read into the
 * one video it names, and the player's address is built from that, never
 * from the pasted text, so a note can only ever embed those three players.
 */

export type VideoSite = "youtube" | "tiktok" | "instagram"

export type VideoLink = {
  site: VideoSite
  /** The video's id on its site. */
  id: string
  /** The link as saved: the plain address of the video. */
  url: string
  /** The player, loaded only once the still is clicked. */
  playerUrl: string
  /** A still to show before playing, when the site gives one without a key. */
  stillUrl: string | null
}

export const VIDEO_SITE_LABEL: Record<VideoSite, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
}

export const VIDEO_LINK_REFUSED = "Paste a YouTube, TikTok or Instagram link."
export const SHORT_TIKTOK_REFUSED =
  "That's a short TikTok link. Open it, then paste the full link from the address bar."

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const TIKTOK_ID = /^\d{8,25}$/
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,40}$/

function youtube(id: string): VideoLink | null {
  if (!YOUTUBE_ID.test(id)) return null
  return {
    site: "youtube",
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    playerUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
    stillUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  }
}

function tiktok(user: string, id: string): VideoLink | null {
  if (!TIKTOK_ID.test(id)) return null
  return {
    site: "tiktok",
    id,
    url: `https://www.tiktok.com/${user}/video/${id}`,
    playerUrl: `https://www.tiktok.com/embed/v2/${id}`,
    stillUrl: null,
  }
}

function instagram(kind: "p" | "reel", code: string): VideoLink | null {
  if (!INSTAGRAM_CODE.test(code)) return null
  return {
    site: "instagram",
    id: code,
    url: `https://www.instagram.com/${kind}/${code}/`,
    playerUrl: `https://www.instagram.com/${kind}/${code}/embed`,
    stillUrl: null,
  }
}

/** The video a pasted link names, or null when it isn't one of the three sites' videos. */
export function readVideoLink(text: string): VideoLink | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "")
  const parts = url.pathname.split("/").filter(Boolean)

  if (host === "youtu.be") return parts[0] ? youtube(parts[0]) : null
  if (host === "youtube.com" || host === "music.youtube.com") {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v") ?? "")
    if ((parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") && parts[1]) return youtube(parts[1])
    return null
  }
  if (host === "tiktok.com") {
    // https://www.tiktok.com/@name/video/7301234567890123456
    if (parts.length >= 3 && parts[0].startsWith("@") && parts[1] === "video") return tiktok(parts[0], parts[2])
    return null
  }
  if (host === "instagram.com") {
    const at = parts[0] === "p" || parts[0] === "reel" || parts[0] === "reels" ? 0 : parts[1] === "p" || parts[1] === "reel" ? 1 : -1
    if (at < 0 || !parts[at + 1]) return null
    return instagram(parts[at] === "p" ? "p" : "reel", parts[at + 1])
  }
  return null
}

/** Why a pasted link was refused, said so the person knows what to paste instead. */
export function videoLinkProblem(text: string): string {
  try {
    const host = new URL(text.trim()).hostname.toLowerCase()
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return SHORT_TIKTOK_REFUSED
  } catch {
    // Not an address at all: the plain answer covers it.
  }
  return VIDEO_LINK_REFUSED
}
