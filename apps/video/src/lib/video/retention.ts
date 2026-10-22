import type { ExportScene } from "@/lib/video/export-scenes"

/**
 * The retention curve of a posted export (`workspace/docs/retention-curve.md`):
 * the shapes kept in the database, what the browser is sent, and every
 * sentence a refusal shows. Nothing here talks to YouTube.
 */

/**
 * One point of YouTube's curve, as its Analytics API answers it:
 * `elapsedVideoTimeRatio`, `audienceWatchRatio` and
 * `relativeRetentionPerformance`.
 */
export type RetentionPoint = {
  /** How far into the video, 0 to 1. */
  ratio: number
  /** Viewers still watching per viewer who started. Rewatching can lift it past 1. */
  watch: number
  /** Against YouTube videos of the same length, 0 to 1. 0.5 is typical. */
  relative: number
}

/** video_settings.youtube_oauth_client. The secret is scrambled. */
export type StoredYoutubeOauthClient = { clientId: string; clientSecret: string }

/** video_settings.youtube_oauth. The refresh token is scrambled. */
export type StoredYoutubeConnection = {
  refreshToken: string
  channelId: string
  channelTitle: string
  connectedAt: string
}

/** What Settings → YouTube may know about the sign-in. Never a secret. */
export type YoutubeConnectionStatus = {
  /** The address to register in Google Cloud as the client's redirect URI. */
  redirectUri: string
  clientId: string | null
  /** The secret's last four characters, or null when none is saved. */
  maskedSecret: string | null
  /** True when a client is saved but the server can no longer unscramble it. */
  clientUnreadable: boolean
  channel: { id: string; title: string; connectedAt: string } | null
}

/** An export's YouTube card, read from the database alone. */
export type ExportRetention = {
  /** Null while no channel is connected. */
  channel_title: string | null
  posted: {
    youtube_video_id: string
    url: string
    video_title: string
    published_at: string
    length_seconds: number
    /** True when the video is on a channel other than the connected one. */
    other_channel: boolean
    points: RetentionPoint[] | null
    views: number | null
    average_view_seconds: number | null
    read_at: string | null
  } | null
  /** The export's own length, which the scene lines are measured against. */
  export_length_ms: number
  scenes: ExportScene[]
  /** True when the export kept no scenes and these are the project as it is now. */
  scenes_from_project_now: boolean
}

/** YouTube's figures arrive a day or two late. Younger than this, the page says so. */
export const FIGURES_LAG_HOURS = 48

/** Longer than this, a pasted value is not a link anybody copied. */
export const YOUTUBE_LINK_MAX = 300

export const YOUTUBE_LINK_INVALID_MESSAGE =
  "That is not a YouTube video link. Paste the video's address, or its 11-letter id."
export const YOUTUBE_CLIENT_MISSING_MESSAGE =
  "Paste the Google client ID and secret in Settings → YouTube first."
export const YOUTUBE_CLIENT_UNREADABLE_MESSAGE =
  "The saved Google client secret can no longer be read. Paste it again in Settings → YouTube."
export const YOUTUBE_CLIENT_REFUSED_MESSAGE =
  "Google refused the client ID and secret saved in Settings → YouTube. Check both, then connect again."
export const YOUTUBE_NOT_CONNECTED_MESSAGE =
  "Connect your YouTube channel in Settings → YouTube first."
export const YOUTUBE_SIGNED_OUT_MESSAGE =
  "YouTube no longer lets this app read the channel. Connect it again in Settings → YouTube."
export const YOUTUBE_VIDEO_NOT_FOUND_MESSAGE =
  "YouTube has no video at that link that the connected channel can see. Check the link."
export const YOUTUBE_UNREACHABLE_MESSAGE =
  "YouTube could not be reached. Try again in a moment."
export const EXPORT_NOT_POSTABLE_MESSAGE =
  "Only a finished video export can be posted on YouTube."
export const EXPORT_NOT_POSTED_MESSAGE =
  "Paste the YouTube link of this export first."

/** A pasted video that lives on some other channel. */
export function notYourVideoMessage(channelTitle: string) {
  return `That video is on another channel, not on ${channelTitle}. Only the connected channel's own videos have figures this app can read.`
}

/** Refresh, after the connected channel changed since the link was pasted. */
export function channelChangedMessage(channelTitle: string) {
  return `This video is not on ${channelTitle}, the channel connected now. Connect the channel it is on, or remove the link and paste another.`
}

/** Every fixed message above, so the screen can show them as they are. */
export const RETENTION_MESSAGES: ReadonlySet<string> = new Set([
  YOUTUBE_LINK_INVALID_MESSAGE,
  YOUTUBE_CLIENT_MISSING_MESSAGE,
  YOUTUBE_CLIENT_UNREADABLE_MESSAGE,
  YOUTUBE_CLIENT_REFUSED_MESSAGE,
  YOUTUBE_NOT_CONNECTED_MESSAGE,
  YOUTUBE_SIGNED_OUT_MESSAGE,
  YOUTUBE_VIDEO_NOT_FOUND_MESSAGE,
  YOUTUBE_UNREACHABLE_MESSAGE,
  EXPORT_NOT_POSTABLE_MESSAGE,
  EXPORT_NOT_POSTED_MESSAGE,
])

/** Every message that names a channel, by its fixed opening words. */
export function isNamedChannelMessage(message: string) {
  return (
    message.startsWith("That video is on another channel, not on ") ||
    (message.startsWith("This video is not on ") &&
      message.includes(", the channel connected now."))
  )
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * The video id in a pasted YouTube link, or the id itself. Takes
 * youtube.com/watch?v=, /shorts/, /live/ and /embed/ addresses, youtu.be
 * links, and the address with no https:// in front. Throws
 * YOUTUBE_LINK_INVALID_MESSAGE for anything else.
 */
export function readYoutubeVideoId(pasted: string): string {
  const value = pasted.trim()
  if (VIDEO_ID.test(value)) return value
  if (!value || value.length > YOUTUBE_LINK_MAX) {
    throw new Error(YOUTUBE_LINK_INVALID_MESSAGE)
  }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    throw new Error(YOUTUBE_LINK_INVALID_MESSAGE)
  }
  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split("/").filter(Boolean)
  let id: string | null | undefined
  if (host === "youtu.be") {
    id = segments[0]
  } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const first = segments[0]?.toLowerCase()
    id =
      first === "watch"
        ? url.searchParams.get("v")
        : first === "shorts" || first === "live" || first === "embed"
          ? segments[1]
          : null
  }
  if (!id || !VIDEO_ID.test(id)) throw new Error(YOUTUBE_LINK_INVALID_MESSAGE)
  return id
}

export function youtubeVideoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/** "40" for a point where 40 out of 100 viewers are still watching. */
export function stillWatchingOutOf100(point: Pick<RetentionPoint, "watch">) {
  return Math.round(point.watch * 100)
}

/** "62" for a point that holds better than 62 out of 100 videos this long. */
export function betterThanOutOf100(point: Pick<RetentionPoint, "relative">) {
  return Math.round(point.relative * 100)
}

/** Whether YouTube's figures may still be arriving for a video this young. */
export function figuresMayLag(publishedAt: string, at: Date = new Date()) {
  return at.getTime() - Date.parse(publishedAt) < FIGURES_LAG_HOURS * 3_600_000
}
