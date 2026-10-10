import { formatClock } from "@/lib/pomodoro/admin-catalog"

/**
 * Reading a pasted YouTube link and the start time typed beside it, in the
 * browser as the admin types and again on the server. See "Make a theme from
 * a YouTube clip" in `workspace/docs/catalog-admin.md`.
 *
 * Every refusal is a whole sentence, shown under its own field.
 */

/** How long every clip runs. Tyler, 10 Oct 2026: "capture 5 seconds". */
export const YOUTUBE_CLIP_SECONDS = 5

/** A theme's name until the worker reads the video's title. */
export const YOUTUBE_CLIP_PLACEHOLDER = "YouTube clip"

/**
 * The start of every address a clip is made from. The worker that fetches
 * clips claims only rows whose `import_url` starts with it.
 */
export const YOUTUBE_CLIP_PREFIX = "https://www.youtube.com/watch?v="

/** Nobody's video runs a day, so a bigger start is a typing slip. */
const MAX_START_SECONDS = 24 * 60 * 60

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com"])
const ONE_VIDEO = "Paste one video's link."

export type YoutubeLinkResult =
  | { ok: true; id: string; startFromLink: number | null }
  | { ok: false; reason: string }

export function readYoutubeLink(raw: string): YoutubeLinkResult {
  const text = raw.trim()
  if (!text) return { ok: false, reason: "Paste a YouTube link." }
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return { ok: false, reason: "Not a YouTube link." }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, reason: "Not a YouTube link." }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const parts = url.pathname.split("/").filter(Boolean)

  let id: string | undefined
  if (host === "youtu.be") id = parts[0]
  else if (HOSTS.has(host)) {
    const [first = "", second] = parts
    if (first === "watch") id = url.searchParams.get("v") ?? undefined
    else if (first === "shorts" || first === "embed" || first === "live") id = second
    else if (first === "playlist")
      return { ok: false, reason: `That is a playlist. ${ONE_VIDEO}` }
    else if (first === "results")
      return { ok: false, reason: `That is a search. ${ONE_VIDEO}` }
    else if (
      first.startsWith("@") ||
      first === "channel" ||
      first === "c" ||
      first === "user"
    )
      return { ok: false, reason: `That is a channel. ${ONE_VIDEO}` }
  } else return { ok: false, reason: "Not a YouTube link." }

  if (!id || !VIDEO_ID.test(id))
    return { ok: false, reason: `That link has no video in it. ${ONE_VIDEO}` }
  const start = linkStart(url.searchParams.get("t") ?? url.searchParams.get("start"))
  return { ok: true, id, startFromLink: start }
}

/** YouTube writes a start as `95`, `95s` or `1h2m5s`. Anything else is ignored. */
function linkStart(value: string | null) {
  const match = value?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  if (!value || !match) return null
  const seconds =
    Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  return seconds <= MAX_START_SECONDS ? seconds : null
}

export type YoutubeStartResult =
  | { ok: true; seconds: number | null }
  | { ok: false; reason: string }

/** The "Start at" field: empty, `95`, `1:35` or `1:02:05`. */
export function readStartTime(raw: string): YoutubeStartResult {
  const text = raw.trim()
  if (!text) return { ok: true, seconds: null }
  const refused = {
    ok: false as const,
    reason: "Write the start as seconds, such as 95, or minutes and seconds, such as 1:35.",
  }
  if (!/^\d{1,5}(?::\d{1,2}){0,2}$/.test(text)) return refused
  const parts = text.split(":").map(Number)
  // Past the first, each part is under 60: "1:75" is a slip, not 2:15.
  if (parts.slice(1).some((part) => part >= 60)) return refused
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  if (seconds > MAX_START_SECONDS)
    return { ok: false, reason: "That start is longer than a day. Check the time." }
  return { ok: true, seconds }
}

export type YoutubeClipRequest =
  | { ok: true; id: string; start: number; address: string }
  | { ok: false; field: "link" | "start"; reason: string }

/**
 * The link and the start read together. A typed start wins; with none, the
 * link's own `t=` is used, and with neither the clip starts at 0:00.
 */
export function readYoutubeClipRequest(link: string, start: string): YoutubeClipRequest {
  const video = readYoutubeLink(link)
  if (!video.ok) return { ok: false, field: "link", reason: video.reason }
  const typed = readStartTime(start)
  if (!typed.ok) return { ok: false, field: "start", reason: typed.reason }
  const seconds = typed.seconds ?? video.startFromLink ?? 0
  return { ok: true, id: video.id, start: seconds, address: youtubeClipAddress(video.id, seconds) }
}

/** The one address a clip is stored and fetched by: the video, at its start. */
export function youtubeClipAddress(id: string, start: number) {
  return `${YOUTUBE_CLIP_PREFIX}${id}&t=${start}`
}

/** "The video is only 3:20 long, so the clip must start by 3:15." */
export function clipStartProblem(start: number, videoSeconds: number) {
  if (videoSeconds < YOUTUBE_CLIP_SECONDS)
    return `The video is shorter than ${YOUTUBE_CLIP_SECONDS} seconds.`
  if (start + YOUTUBE_CLIP_SECONDS <= videoSeconds) return null
  return `The video is only ${formatClock(videoSeconds)} long, so the clip must start by ${formatClock(Math.floor(videoSeconds) - YOUTUBE_CLIP_SECONDS)}.`
}

export function isYoutubeClipImport(importUrl: string | null) {
  return Boolean(importUrl?.startsWith(YOUTUBE_CLIP_PREFIX))
}
