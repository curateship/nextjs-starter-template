import { handleWords } from "@/lib/social/networks"

/**
 * YouTube's limits, kinds and words, read by the server and the screen alike
 * (`workspace/tasks/YouTube/01-youtube-features.md`).
 *
 * The limits are YouTube's own as its help pages gave them on 26 Nov 2026:
 * a title of 100 characters, a description of 5,000, and tags of 500 in
 * all. Check them there when one looks wrong, and change them here only.
 */

/** The longest title YouTube takes. */
export const TITLE_MAX = 100

/** The longest description YouTube takes. */
export const DESCRIPTION_MAX = 5_000

/** YouTube's limit on every tag together, counted with a comma between each. */
export const TAGS_MAX = 500

/** One tag's longest, so a pasted paragraph is not one tag. */
export const TAG_MAX = 100

/**
 * A Short: a tall or square video of three minutes or less. YouTube decides
 * this from the file itself; Promo only reads the same two things off the
 * Archive item to say so in New post and to send the phone through the
 * Shorts screen.
 */
export const SHORT_MAX_SECONDS = 3 * 60

/**
 * A channel YouTube has not verified with a phone number takes videos up to
 * 15 minutes. A longer one is warned about in New post and never blocked:
 * YouTube has the last word.
 */
export const UNVERIFIED_MAX_SECONDS = 15 * 60

/** What one channel may upload in a day, in Settings → Behaviour. Tyler, 26 Nov 2026: "Start at 3 a day". */
export const UPLOADS_PER_DAY = { start: 3, min: 1, max: 50 } as const

/** Three titles to pick from, one press (Tyler, 26 Nov 2026: "Three to pick from"). */
export const TITLES_PER_PRESS = 3

/** How many of a channel's newest videos the daily reading reads the numbers of. Older ones keep their last numbers. */
export const VIDEO_NUMBERS_PER_READ = 20

/** What the video is about, as a person tells the AI before Write. Never posted. */
export const ABOUT_MAX = 1_000

/** The longest answer to a comment under a video. YouTube allows far more; an answer is a few lines. */
export const COMMENT_ANSWER_MAX = 1_000

/** Where an upload has got to. */
export const YOUTUBE_POST_STATUSES = ["waiting", "posted", "failed"] as const
export type YoutubePostStatus = (typeof YOUTUBE_POST_STATUSES)[number]

export const YOUTUBE_POST_STATUS_WORDS: Record<YoutubePostStatus, string> = {
  waiting: "On its way",
  posted: "Posted",
  failed: "Failed",
}

/** A template's section: words kept as typed, or a part the AI writes. */
export const TEMPLATE_SECTION_KINDS = ["fixed", "ai"] as const
export type TemplateSectionKind = (typeof TEMPLATE_SECTION_KINDS)[number]

export const TEMPLATE_SECTION_KIND_WORDS: Record<TemplateSectionKind, string> = {
  fixed: "Fixed words",
  ai: "AI writes it",
}

/**
 * One section of a description template, in order. A fixed section's `text`
 * is copied word for word; an AI section's `text` is a short note saying
 * what belongs there, which is never posted.
 */
export type TemplateSection = { name: string; kind: TemplateSectionKind; text: string }

export const TEMPLATE_NAME_MAX = 60
export const TEMPLATE_SECTION_NAME_MAX = 60
export const TEMPLATE_SECTIONS_MAX = 12
/** A fixed section's words, or an AI section's note. */
export const TEMPLATE_SECTION_TEXT_MAX = 2_000

/** The tags typed in the box, split on commas, trimmed, and without repeats. */
export function splitTags(text: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of text.split(",")) {
    const tag = raw.replace(/\s+/g, " ").trim().replace(/^#/, "")
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}

/** How long YouTube counts the tags: each one, with a comma between them. */
export function tagsLength(tags: string[]): number {
  return tags.join(",").length
}

/**
 * Why the title, description and tags cannot go, in words, or null when they
 * can. Said when Post is pressed and again on the server.
 */
export function uploadWordsProblem(input: { title: string; description: string; tags: string[] }): string | null {
  const title = input.title.trim()
  if (!title) return "Give the video a title first."
  if (title.length > TITLE_MAX) return `The title is ${title.length} characters, and YouTube allows ${TITLE_MAX}. Shorten it first.`
  if (/[<>]/.test(title) || /[<>]/.test(input.description)) return "YouTube refuses < and > in a title or description. Take them out first."
  if (input.description.length > DESCRIPTION_MAX) {
    return `The description is ${input.description.length.toLocaleString("en-US")} characters, and YouTube allows ${DESCRIPTION_MAX.toLocaleString("en-US")}. Shorten it first.`
  }
  const long = input.tags.find((tag) => tag.length > TAG_MAX)
  if (long) return `The tag "${long.slice(0, 30)}…" is too long. Keep each tag under ${TAG_MAX} characters.`
  const length = tagsLength(input.tags)
  if (length > TAGS_MAX) return `The tags come to ${length} characters, and YouTube allows ${TAGS_MAX}. Take some out first.`
  return null
}

/** True for a tall or square video of three minutes or less, which YouTube makes a Short. */
export function isShort(video: { width: number | null; height: number | null; durationMs: number | null }): boolean {
  if (!video.width || !video.height || !video.durationMs) return false
  return video.height >= video.width && video.durationMs <= SHORT_MAX_SECONDS * 1000
}

/**
 * True when the words carry a link. An answer to a comment under a video
 * never does (Tyler, 26 Nov 2026: "Never a link"): YouTube holds a young
 * channel's link replies back as spam.
 */
export function hasLink(text: string): boolean {
  return /(https?:\/\/|www\.)\S+/i.test(text) || /\b[a-z0-9-]+\.(com|net|org|io|co|app|dev|ly|gg|me|tv)\b(\/\S*)?/i.test(text)
}

/**
 * A video's link as YouTube gives it, kept only when it is YouTube's own
 * https address, since the Posts tab opens it. Anything else is "".
 */
export function youtubeVideoLink(url: string): string {
  const link = url.trim()
  const shapes = [
    /^https:\/\/(www\.|m\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,20}([&#][^\s"<>]*)?$/,
    /^https:\/\/(www\.|m\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]{6,20}\/?(\?[^\s"<>]*)?$/,
    /^https:\/\/youtu\.be\/[A-Za-z0-9_-]{6,20}\/?(\?[^\s"<>]*)?$/,
  ]
  return link.length <= 600 && shapes.some((shape) => shape.test(link)) ? link : ""
}

/** A channel's name as the module shows it, @name, or that it has none yet. */
export function channelName(handle: string): string {
  return handle ? handleWords("youtube", handle) : "A channel not signed in"
}
