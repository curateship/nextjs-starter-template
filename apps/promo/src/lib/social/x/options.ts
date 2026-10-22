/**
 * X's own choices, limits and words, which both halves of the app need at
 * runtime (`workspace/tasks/X/01-x-features.md`). Here and not beside the
 * server code for the reason `src/lib/social/options.ts` gives: a runtime
 * value imported out of `@/server/*` drags the database into the browser's
 * bundle.
 *
 * Everything X shares with Reddit and Medium (the job queue's kinds, a found
 * post's statuses) stays in `src/lib/social/options.ts`. What only X has is
 * here.
 */

/**
 * What an X keyword is: search words, a hashtag, or an account watched for
 * its new posts (part 11). All three are read by a search account (part 3),
 * because X shows nothing to a visitor who is not signed in.
 */
export const X_KEYWORD_KINDS = ["search", "hashtag", "account"] as const
export type XKeywordKind = (typeof X_KEYWORD_KINDS)[number]

export const X_KEYWORD_KIND_WORDS: Record<XKeywordKind, string> = {
  search: "Search words",
  hashtag: "Hashtag",
  account: "Watched account",
}

/** Search words that are the product's own name, or a rival's (part 13). */
export const X_KEYWORD_MARKS = ["", "you", "rival"] as const
export type XKeywordMark = (typeof X_KEYWORD_MARKS)[number]

export const X_MARK_WORDS: Record<Exclude<XKeywordMark, "">, string> = {
  you: "Names you",
  rival: "Names a rival",
}

/** The longest keyword, the same as Reddit's and Medium's. */
export const MAX_X_KEYWORD_CHARS = 200

/** The longest post a free X account may send. X counts characters, and a paid account may send more (part 27). */
export const X_POST_CHARS = 280

/**
 * The longest post the app sends from an account marked paid. X allows
 * 25,000; the app stops at 1,000, which the browser can type at a person's
 * pace inside an edit's four minutes.
 */
export const X_PAID_POST_CHARS = 1_000

/** The most posts in one thread of your own (part 29). */
export const MAX_THREAD_PIECES = 10

/** X's poll: two to four choices of up to 25 characters, open from 5 minutes to 7 days (part 33). */
export const POLL_CHOICES = { min: 2, max: 4 } as const
export const POLL_CHOICE_CHARS = 25
export const POLL_MINUTES = { min: 5, max: 7 * 24 * 60 } as const

/** How many reply drafts one press asks for. */
export const X_DRAFTS_PER_PRESS = 2

/** The three ways a reply's words can be rewritten, in the order their buttons sit. */
export const X_REWRITES = ["shorter", "warmer", "less_salesy"] as const
export type XRewrite = (typeof X_REWRITES)[number]

export const X_REWRITE_WORDS: Record<XRewrite, string> = {
  shorter: "Shorter",
  warmer: "Warmer",
  less_salesy: "Less salesy",
}

/**
 * Days a new X account waits before it replies or posts. Tyler, 21 Oct 2026:
 * "7 days". Counted from when X says the account joined, or from when Promo
 * first saw it signed in.
 */
export const X_WARM_UP_DAYS = 7

/**
 * Hours an X post stays in To look at. Tyler, 21 Oct 2026: "12 hours". A
 * reply under an older post is seen by almost nobody. Posts already answered
 * stay (part 18).
 */
export const X_TIDY_AFTER_HOURS = 12

/** Minutes between two reads of a watched account. Tyler, 21 Oct 2026: "Every 15 minutes" (part 11). */
export const X_WATCH_EVERY_MINUTES = 15

/** Hours between two searches of the same search words or hashtag, by itself (part 10). */
export const X_SEARCH_EVERY_HOURS = 2

/** How many top replies under a post are kept for the AI to read first (part 22). */
export const X_TOP_REPLIES = 5

/**
 * The numbers in Settings → Behaviour under X, with their bounds and where
 * they begin. Tyler, 21 Oct 2026: replies "100 a day (but I can set it to
 * what I like)", the search account's views "You set it, start at 500" and
 * follows "You set it, start at 5". The 10 an hour beside the 100 is the
 * build's own choice, so the 100 spreads across waking hours, and is his to
 * change.
 */
export const X_BEHAVIOUR_RANGES = {
  repliesPerDay: { min: 1, max: 1_000, start: 100 },
  repliesPerHour: { min: 1, max: 200, start: 10 },
  viewsPerDay: { min: 50, max: 5_000, start: 500 },
  followsPerDay: { min: 0, max: 100, start: 5 },
} as const

export type XBehaviourNumber = keyof typeof X_BEHAVIOUR_RANGES

/** Where a found X post has got to. The same four as a Reddit post. */
export type XFindStatus = "new" | "shortlisted" | "skipped" | "commented"

/** What went out: a reply under a post, a quote post, or an answer to somebody who replied to us or named us. */
export const X_REPLY_KINDS = ["reply", "quote", "answer"] as const
export type XReplyKind = (typeof X_REPLY_KINDS)[number]

/** A reply, quote or answer that went out, or tried to. */
export const X_REPLY_STATUSES = ["waiting", "posted", "failed"] as const
export type XReplyStatus = (typeof X_REPLY_STATUSES)[number]

/** A post or thread of the account's own, from a draft in Promo to live on X. */
export const X_POST_STATUSES = ["draft", "waiting", "posted", "failed"] as const
export type XPostStatus = (typeof X_POST_STATUSES)[number]

export const X_POST_STATUS_WORDS: Record<XPostStatus, string> = {
  draft: "Draft",
  waiting: "Waiting to post",
  posted: "Posted",
  failed: "Did not post",
}

/** An account on a public X list (part 36). */
export type XListItemStatus = "waiting" | "added" | "failed"

/**
 * What the daily look found about an account's reach (part 42): seen in
 * search and under its posts, hidden from search, or its replies folded
 * under "Show more". Promo's best guess, because X never says.
 */
export const X_REACH = ["seen", "hidden", "folded"] as const
export type XReach = (typeof X_REACH)[number]

export const X_REACH_WORDS: Record<XReach, string> = {
  seen: "Seen in search",
  hidden: "Hidden from search",
  folded: "Replies folded",
}

/**
 * The tabs across the X module's middle column, in the address as
 * `?view=`. None is To look at. Replies holds its Failed list as
 * `?list=failed`.
 */
export const X_VIEWS = ["new", "replied", "skipped", "today", "replies", "posts", "communities"] as const
export type XView = (typeof X_VIEWS)[number]

export const X_VIEW_WORDS: Record<XView, string> = {
  new: "To look at",
  replied: "Replied",
  skipped: "Skipped",
  today: "Today",
  replies: "Replies",
  posts: "Posts",
  communities: "Communities",
}

/** One reply under a post, as the search account last read it. */
export type XTopReply = {
  /** X's id for the reply, which is a post of its own. */
  id: string
  handle: string
  name: string
  text: string
  likes: number
}

/**
 * Somebody's post that answers or names one of ours, as the last check read
 * it. `postedAt` is an ISO date, since this is stored as JSON.
 */
export type XIncoming = {
  id: string
  handle: string
  name: string
  text: string
  likes: number
  postedAt: string | null
  /** A post that names the account without replying under one of ours (part 39). */
  mention?: boolean
}

/** One post of a thread of your own (part 29), with a picture (part 30) and where it landed once sent. */
export type XPostPiece = {
  text: string
  /** A media library picture's address, or "" for none. */
  pictureUrl: string
  /** X's id once this piece is up, or "" before. */
  postId: string
}

/** A poll on the first post of your own (part 33). Votes are read back afterwards. */
export type XPoll = {
  choices: string[]
  minutes: number
  votes?: number[] | null
}

/** Which lines on the AI usage screen are X's, and how the module's spend line names them (part 45). */
export const X_AI_FEATURES = {
  "x-reply": "replies",
  "x-answer": "replies",
  "x-rewrite": "replies",
  "x-rules-check": "replies",
  "x-post": "posts",
  "x-keyword-ideas": "ideas",
  "x-trends": "ideas",
} as const
export type XAiFeature = keyof typeof X_AI_FEATURES
export type XSpendPart = (typeof X_AI_FEATURES)[XAiFeature]

/** A post's own address. X sends any handle in the address on to the right one, so the id is enough. */
export function xPostUrl(postId: string, handle = "i"): string {
  return `https://x.com/${handle || "i"}/status/${postId}`
}

/** An account's page on X. */
export function xAccountUrl(handle: string): string {
  return `https://x.com/${handle}`
}

/** A community's page on X. */
export function xCommunityUrl(communityId: string): string {
  return `https://x.com/i/communities/${communityId}`
}

/**
 * An account's handle as X writes it: letters, digits and underscores, at
 * most 15, taken out of a pasted address or an @name. "@sam_k",
 * "x.com/sam_k" and "https://twitter.com/sam_k/status/1" are all `sam_k`.
 */
export function xHandle(value: string): string {
  let text = value.trim()
  const address = text.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/(.+)$/i)
  if (address) text = address[1] ?? ""
  text = (text.split(/[/?#]/)[0] ?? "").replace(/^@/, "")
  return /^[A-Za-z0-9_]{1,15}$/.test(text) ? text : ""
}

/** A hashtag as it is stored: the words after the #, letters, digits and underscores only. */
export function xHashtag(value: string): string {
  return value.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 100)
}

/** A keyword's value as it is stored, or "" when nothing usable is left. */
export function xKeywordValue(kind: XKeywordKind, value: string): string {
  if (kind === "hashtag") return xHashtag(value)
  if (kind === "account") return xHandle(value)
  return value.trim().replace(/\s+/g, " ")
}

/** A keyword in a few words, for a chip: "project tools", #buildinpublic, @levelsio. */
export function xKeywordLabel(keyword: { kind: XKeywordKind; value: string }): string {
  if (keyword.kind === "hashtag") return `#${keyword.value}`
  if (keyword.kind === "account") return `@${keyword.value}`
  return `"${keyword.value}"`
}

/**
 * The post id in an X address, or null. A post's address is
 * `x.com/<handle>/status/<id>`, on x.com or twitter.com; the id is X's
 * number, kept as text because it is longer than JavaScript counts exactly.
 */
export function xPostId(url: string): string | null {
  const match = url.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status(?:es)?\/(\d{5,25})/i)
  return match ? (match[1] ?? null) : null
}

/** A community id in a pasted address or on its own, or "" when there is none. */
export function xCommunityId(value: string): string {
  const text = value.trim()
  const address = text.match(/communities\/(\d{5,25})/)
  if (address) return address[1] ?? ""
  return /^\d{5,25}$/.test(text) ? text : ""
}

/**
 * How many characters X counts in a post. X counts every link as 23,
 * whatever its length, and an emoji or a CJK character as two. The app's
 * replies carry no links (Tyler's answer), but a post of your own may.
 */
export function xLength(text: string): number {
  let length = 0
  const withoutLinks = text.replace(/https?:\/\/\S+/g, () => {
    length += 23
    return ""
  })
  for (const char of withoutLinks) {
    const code = char.codePointAt(0) ?? 0
    // X counts Latin, punctuation and the common symbol ranges as one, and
    // everything past them (CJK, emoji) as two.
    const light =
      code <= 0x10ff ||
      (code >= 0x2000 && code <= 0x200d) ||
      (code >= 0x2010 && code <= 0x201f) ||
      (code >= 0x2032 && code <= 0x2037)
    length += light ? 1 : 2
  }
  return length
}

/** The longest post this account may send. */
export function xPostLimit(paid: boolean): number {
  return paid ? X_PAID_POST_CHARS : X_POST_CHARS
}

/** Words with a dot that X does not turn into a link, and that read as plain words in a reply. */
const NOT_LINKS = /^(?:e\.g|i\.e|etc|vs|node\.js|next\.js|vue\.js|react\.js|three\.js|d3\.js|asp\.net)$/i

/**
 * True when the words hold a link of any kind, which a reply never may
 * (Tyler's answer): an address, or anything shaped like `name.tld` or
 * `name.tld/path`, as X turns those into links (bit.ly/x, tool.gg, site.shop).
 */
export function holdsLink(text: string): boolean {
  if (/https?:\/\/|\bwww\./i.test(text)) return true
  for (const match of text.matchAll(/\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,24})(?=$|[\s/?#)\],!;:'"]|\.(?:\s|$))/gi)) {
    if (!NOT_LINKS.test(match[1] ?? "")) return true
  }
  return false
}
