import { z } from "zod"

import { call, type CommandTarget } from "@/server/browser/command"

/**
 * The typed calls to YouTube's routines, each answer checked against its
 * shape before anything reads it. In a browser they reach
 * `docker/browser/routines/youtube.py`; on a phone the same names reach the
 * YouTube app's steps in `rack/promo_rack.py`. The comments under a channel's
 * videos use the shared `youtube/inbox` and `youtube/reply` through
 * `../phone-apps/calls.ts`, as Instagram's do.
 */

/** A look at who is signed in: one page, read. The launcher allows 90 seconds. */
const STATE_TIMEOUT_MS = 120_000

/**
 * The daily reading opens the channel's own page and up to 20 videos'
 * numbers. The launcher allows it 600 seconds; a phone may wait behind its
 * other actions first. The `youtube_health` claim lasts 25 minutes
 * (`jobs.ts`), so a reading still running is never handed out twice.
 */
const HEALTH_TIMEOUT_MS = 630_000

/**
 * An upload is the file fetched, YouTube's upload screen, the words typed at
 * a person's pace, the upload itself and YouTube's check, then the
 * thumbnail. A long video on a slow line takes a while, so the launcher
 * allows 40 minutes (`youtube.upload` in `docker/browser/launch.py`) and this
 * waits a little longer to hear its answer. The `youtube_upload` claim lasts
 * 60 minutes (`jobs.ts`), so an upload still going is never called abandoned
 * and handed out a second time.
 */
export const UPLOAD_TIMEOUT_MS = 42 * 60_000

const stateShape = z.object({
  /** False when the page was not on YouTube, so nothing can be said either way. */
  checked: z.boolean(),
  /** The channel's @handle without the @, or null when signed out or the account has no channel yet. */
  handle: z.string().nullable(),
  /** A "verify it's you" or sign-in check is in the way. */
  blocked: z.boolean(),
  reason: z.string(),
  /**
   * YouTube's own words on a strike, a terminated channel or a
   * "verify it's you" page, which stop the channel at once (part 2). Null
   * when there is none.
   */
  banScreen: z.string().nullable().default(null),
})

export type YoutubeState = z.infer<typeof stateShape>

const count = z.number().int().min(0).nullable().default(null)

const healthShape = z.object({
  handle: z.string().nullable(),
  subscribers: count,
  videos: count,
  /** True when YouTube lets this channel set its own thumbnails (phone-verified). Null when unread. */
  verified: z.boolean().nullable().default(null),
  /** The numbers of each video asked about, by its link. */
  numbers: z.array(z.object({ url: z.string(), views: count, likes: count, comments: count })).default([]),
  /**
   * The newest comments under the videos named, read in the same visit
   * (part 9), `thread` the video's title. A phone's notifications bring the
   * rest; a browser has none, so this is how a browser channel hears of them.
   */
  comments: z.array(z.object({ thread: z.string(), author: z.string(), text: z.string() })).default([]),
  banScreen: z.string().nullable().default(null),
})

export type YoutubeHealth = z.infer<typeof healthShape>

const uploadShape = z.object({
  /** The video's link, read off YouTube after uploading, or "" when YouTube would not give it. */
  postUrl: z.string(),
  /** Whether the thumbnail took. Null when none was asked for. */
  thumbnailSet: z.boolean().nullable().default(null),
  /** YouTube's words when the thumbnail did not take. */
  thumbnailNote: z.string().default(""),
})

export type YoutubeUploadAnswer = z.infer<typeof uploadShape>

/** The full look: YouTube's front page, then the channel's own, to be sure who is signed in. */
export function youtubeState(target: CommandTarget) {
  return call(target, "youtube/state", {}, stateShape, STATE_TIMEOUT_MS)
}

/** The quick look after every job, which never moves the page. */
export function youtubeQuickState(target: CommandTarget) {
  return call(target, "youtube/quick_state", {}, stateShape, STATE_TIMEOUT_MS)
}

/** The daily reading: subscribers, videos, and the numbers of the videos named, opened by their links. */
export function youtubeHealth(target: CommandTarget, args: { videoUrls: string[] }) {
  return call(target, "youtube/health", { ...args }, healthShape, HEALTH_TIMEOUT_MS)
}

/**
 * Uploads one video with its words. Only ever after a person pressed Post.
 * `short` sends a phone through the Shorts screen; a browser's upload page
 * takes both, and YouTube makes a tall video of three minutes or less a Short
 * by itself.
 */
export function youtubeUpload(
  target: CommandTarget,
  args: {
    mediaUrl: string
    mediaFromSafari?: true
    short: boolean
    title: string
    description: string
    tags: string[]
    thumbnailUrl: string
    aiMade: boolean
  }
) {
  return call(target, "youtube/upload", { ...args }, uploadShape, UPLOAD_TIMEOUT_MS)
}
