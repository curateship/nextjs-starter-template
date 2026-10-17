import { handleWords, type PhoneAppNetwork } from "./networks"

/**
 * Instagram and TikTok, the two networks that run on phones only (phone farm
 * file 06), and the direct messages every phone account reads, Reddit's
 * included. The fixed lists and limits both halves of the app need: the
 * server checks against them, and the screens draw the same numbers.
 *
 * Nothing posts, replies or changes a profile by itself. Each is a job a
 * person pressed for, tried once and never again.
 */

/** A post's photo or video, read off the media library file's own type. */
export type PhoneAppMediaKind = "photo" | "video"

/** Where a post Promo sent has got to. */
export type PhoneAppPostStatus = "waiting" | "posted" | "failed"

/** Where a profile change has got to. */
export type ProfileEditStatus = "waiting" | "done" | "failed"

/**
 * Something somebody wrote to a phone account: a direct message, or a
 * comment under one of its own posts.
 */
export type InboxKind = "message" | "comment"

/**
 * Where a message or a comment stands. `open` waits for a person; `sending`
 * has a reply on its way; `answered` and `skipped` are done with. A failed
 * reply goes back to `open` with its reason, and is never sent again by
 * itself.
 */
export type InboxStatus = "open" | "sending" | "answered" | "skipped"

/** One line of a conversation as the phone read it, oldest first. */
export type InboxLine = {
  /** Who wrote it, as the app showed the name; empty for the account itself. */
  from: string
  text: string
  /** True when the account itself wrote it. */
  mine: boolean
}

/**
 * The longest a caption may be. Instagram cuts a caption at 2,200
 * characters; TikTok allows 4,000.
 */
export const CAPTION_MAX: Record<PhoneAppNetwork, number> = {
  instagram: 2_200,
  tiktok: 4_000,
}

/** Instagram refuses a caption with more than 30 hashtags. TikTok sets no number. */
export const HASHTAG_MAX: Record<PhoneAppNetwork, number | null> = {
  instagram: 30,
  tiktok: null,
}

/** The profile's bio: 150 characters on Instagram, 80 on TikTok. */
export const BIO_MAX: Record<PhoneAppNetwork, number> = {
  instagram: 150,
  tiktok: 80,
}

/** The name shown above the bio: 30 characters on both. */
export const DISPLAY_NAME_MAX = 30

/** A link on the profile. */
export const LINK_MAX = 300

/**
 * A reply under a comment. TikTok cuts a comment at 150 characters;
 * Instagram at 2,200.
 */
const COMMENT_REPLY_MAX: Record<PhoneAppNetwork, number> = {
  instagram: 2_200,
  tiktok: 150,
}

/** A reply to a direct message, on any of the three. */
const MESSAGE_REPLY_MAX = 1_000

/** The most an answer may be: a message's, or a comment's on its network. */
export function replyMax(kind: InboxKind, platform: string): number {
  if (kind === "message") return MESSAGE_REPLY_MAX
  return platform === "instagram" || platform === "tiktok" ? COMMENT_REPLY_MAX[platform] : MESSAGE_REPLY_MAX
}

/** What the post is about, as Tyler tells the AI before Draft. */
export const ABOUT_MAX = 1_000

/**
 * A profile is not changed in the account's first day after it signed in on
 * the phone: a new sign-in followed at once by a new name, bio and picture is
 * what a taken-over account looks like, and it can bring on a "confirm it's
 * you" check.
 */
export const PROFILE_EDIT_WAIT_HOURS = 24

/** How many lines of a conversation are kept and shown, newest last. */
export const INBOX_LINES_KEPT = 20

/**
 * How many of an account's newest posts the daily health visit reads the
 * numbers of. Older posts keep their last numbers.
 */
export const POST_NUMBERS_PER_VISIT = 12

/** Hashtags in a caption, as the app counts them: a # and the word after it. */
export function hashtagCount(caption: string): number {
  return caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0
}

/**
 * Why a caption cannot go, in words, or null when it can. Said when Post is
 * pressed and again on the server.
 */
export function captionProblem(network: PhoneAppNetwork, caption: string): string | null {
  if (caption.length > CAPTION_MAX[network]) {
    return `The caption is ${caption.length.toLocaleString("en-US")} characters, and ${network === "instagram" ? "Instagram" : "TikTok"} allows ${CAPTION_MAX[network].toLocaleString("en-US")}. Shorten it first.`
  }
  const most = HASHTAG_MAX[network]
  const tags = hashtagCount(caption)
  if (most !== null && tags > most) {
    return `The caption has ${tags} hashtags, and Instagram allows ${most}. Take some out first.`
  }
  return null
}

export const INBOX_STATUS_WORDS: Record<InboxStatus, string> = {
  open: "Waiting for you",
  sending: "Reply on its way",
  answered: "Answered",
  skipped: "Skipped",
}

export const POST_STATUS_WORDS: Record<PhoneAppPostStatus, string> = {
  waiting: "On its way",
  posted: "Posted",
  failed: "Failed",
}

/** A count as people write it: 1,234 or 12.3k. Null is "not read yet". */
export function countWords(value: number | null): string {
  if (value === null) return "-"
  if (value >= 10_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`
  return value.toLocaleString("en-US")
}

/** An Instagram or TikTok account's name as the module shows it, @name, or that it has none yet. */
export function appAccountName(network: PhoneAppNetwork, handle: string): string {
  return handle ? handleWords(network, handle) : "An account not signed in"
}
