/**
 * LinkedIn's own choices, limits and words, which both halves of the app need
 * at runtime (`workspace/tasks/LinkedIn/01-linkedin-features.md`). Here and
 * not beside the server code for the reason `src/lib/social/options.ts`
 * gives: a runtime value imported out of `@/server/*` drags the database into
 * the browser's bundle.
 *
 * Everything LinkedIn shares with the other networks (the job queue's kinds,
 * a found post's statuses) stays in `src/lib/social/options.ts`. What only
 * LinkedIn has is here.
 */

/**
 * What a LinkedIn keyword is: search words, a hashtag, or a person or company
 * page watched for its new posts (part 12). All four are read by a search
 * account (part 3), because LinkedIn shows almost nothing to a visitor who is
 * not signed in.
 */
export const LINKEDIN_KEYWORD_KINDS = ["search", "hashtag", "person", "company"] as const
export type LinkedinKeywordKind = (typeof LINKEDIN_KEYWORD_KINDS)[number]

export const LINKEDIN_KEYWORD_KIND_WORDS: Record<LinkedinKeywordKind, string> = {
  search: "Search words",
  hashtag: "Hashtag",
  person: "Watched person",
  company: "Watched company page",
}

/** The two kinds that watch somebody's page rather than search. */
export function isWatchKind(kind: LinkedinKeywordKind): boolean {
  return kind === "person" || kind === "company"
}

/** Search words that are the product's own name, or a rival's (part 15). */
export const LINKEDIN_KEYWORD_MARKS = ["", "you", "rival"] as const
export type LinkedinKeywordMark = (typeof LINKEDIN_KEYWORD_MARKS)[number]

export const LINKEDIN_MARK_WORDS: Record<Exclude<LinkedinKeywordMark, "">, string> = {
  you: "Names you",
  rival: "Names a rival",
}

/** The longest keyword, the same as the other networks'. */
export const MAX_LINKEDIN_KEYWORD_CHARS = 200

/** The longest comment LinkedIn takes. */
export const LINKEDIN_COMMENT_CHARS = 1_250

/** The longest post of your own LinkedIn takes. */
export const LINKEDIN_POST_CHARS = 3_000

/** A newsletter issue's title, and the longest body sent from here, typed at a person's pace. */
export const NEWSLETTER_TITLE_CHARS = 150
export const NEWSLETTER_BODY_CHARS = 20_000

/** A short note on a connection request. LinkedIn caps it at 300 characters (200 on a free account most months). */
export const CONNECT_NOTE_CHARS = 200

/** LinkedIn's poll: a question of 140 characters, two to four answers of 30, open one day to two weeks (part 31). */
export const LINKEDIN_POLL_QUESTION_CHARS = 140
export const LINKEDIN_POLL_CHOICES = { min: 2, max: 4 } as const
export const LINKEDIN_POLL_CHOICE_CHARS = 30
export const LINKEDIN_POLL_DAYS = [1, 3, 7, 14] as const
export type LinkedinPollDays = (typeof LINKEDIN_POLL_DAYS)[number]

/** How many comment drafts one press asks for. */
export const LINKEDIN_DRAFTS_PER_PRESS = 2

/** The three ways a comment's words can be rewritten, in the order their buttons sit. */
export const LINKEDIN_REWRITES = ["shorter", "warmer", "less_salesy"] as const
export type LinkedinRewrite = (typeof LINKEDIN_REWRITES)[number]

export const LINKEDIN_REWRITE_WORDS: Record<LinkedinRewrite, string> = {
  shorter: "Shorter",
  warmer: "Warmer",
  less_salesy: "Less salesy",
}

/**
 * Days a new LinkedIn account only reads and reacts before it comments or
 * posts. Tyler, 22 Oct 2026: "7 days". LinkedIn shows nobody when an account
 * joined, so it counts from when Promo first saw it signed in.
 */
export const LINKEDIN_WARM_UP_DAYS = 7

/**
 * Hours a LinkedIn post stays in To look at. Tyler, 22 Oct 2026: "2 days".
 * Comments under an older post are rarely read. Posts already commented on
 * stay (part 19).
 */
export const LINKEDIN_TIDY_AFTER_HOURS = 48

/** Minutes between two reads of a watched person or page. Tyler, 22 Oct 2026: "Every 30 minutes" (part 12). */
export const LINKEDIN_WATCH_EVERY_MINUTES = 30

/** Hours between two searches of the same words or hashtag, by itself (part 11). The build's choice, "every few hours". */
export const LINKEDIN_SEARCH_EVERY_HOURS = 3

/** How many top comments under a post are kept for the AI to read first (part 22). */
export const LINKEDIN_TOP_COMMENTS = 5

/**
 * The numbers in Settings → Behaviour under LinkedIn, with their bounds and
 * where they begin. Tyler, 22 Oct 2026: comments a day "You set it, start at
 * 20", connection requests a week "You set it, start at 20", and the search
 * account's views a day "You set it, start at 300".
 */
export const LINKEDIN_BEHAVIOUR_RANGES = {
  commentsPerDay: { min: 1, max: 200, start: 20 },
  viewsPerDay: { min: 50, max: 3_000, start: 300 },
  connectsPerWeek: { min: 0, max: 100, start: 20 },
} as const

export type LinkedinBehaviourNumber = keyof typeof LINKEDIN_BEHAVIOUR_RANGES

/** Where a found LinkedIn post has got to. The same four as a Reddit post. */
export type LinkedinFindStatus = "new" | "shortlisted" | "skipped" | "commented"

/**
 * What went out under somebody's post: a comment on the post, a reply under
 * one of its top comments (part 25), or an answer to somebody who replied to
 * one of ours (part 44).
 */
export const LINKEDIN_COMMENT_KINDS = ["comment", "reply", "answer"] as const
export type LinkedinCommentKind = (typeof LINKEDIN_COMMENT_KINDS)[number]

/** A comment that went out, or tried to. */
export const LINKEDIN_COMMENT_STATUSES = ["waiting", "posted", "failed"] as const
export type LinkedinCommentStatus = (typeof LINKEDIN_COMMENT_STATUSES)[number]

/** A post of the account's own, from a draft in Promo to live on LinkedIn. */
export const LINKEDIN_POST_STATUSES = ["draft", "waiting", "posted", "failed"] as const
export type LinkedinPostStatus = (typeof LINKEDIN_POST_STATUSES)[number]

export const LINKEDIN_POST_STATUS_WORDS: Record<LinkedinPostStatus, string> = {
  draft: "Draft",
  waiting: "Waiting to post",
  posted: "Posted",
  failed: "Did not post",
}

/**
 * What one of your own posts is: a post (words, a picture or a video, a
 * poll), a repost with your thoughts on top (part 33), or an issue of the
 * account's newsletter (part 36).
 */
export const LINKEDIN_POST_KINDS = ["post", "repost", "newsletter"] as const
export type LinkedinPostKind = (typeof LINKEDIN_POST_KINDS)[number]

export const LINKEDIN_POST_KIND_WORDS: Record<LinkedinPostKind, string> = {
  post: "Post",
  repost: "Repost with thoughts",
  newsletter: "Newsletter issue",
}

/** A connection request sent, or tried (part 39). */
export type LinkedinConnectStatus = "waiting" | "sent" | "failed"

/** A request somebody sent one of the accounts, as the last read of its invitations found it (part 40). */
export type LinkedinInviteStatus = "waiting" | "accepting" | "accepted" | "failed"

/**
 * What the weekly look found about the account's comments (part 46): they
 * show to someone else, or none of the latest did. Promo's best guess,
 * because LinkedIn never says.
 */
export const LINKEDIN_SEEN = ["seen", "hidden"] as const
export type LinkedinSeen = (typeof LINKEDIN_SEEN)[number]

export const LINKEDIN_SEEN_WORDS: Record<LinkedinSeen, string> = {
  seen: "Comments seen",
  hidden: "Comments hidden?",
}

/**
 * The tabs across the LinkedIn module's middle column, in the address as
 * `?tab=`. None is To look at. Comments holds its Failed list as
 * `?list=failed`.
 */
export const LINKEDIN_VIEWS = ["new", "commented", "skipped", "today", "comments", "posts", "people"] as const
export type LinkedinView = (typeof LINKEDIN_VIEWS)[number]

export const LINKEDIN_VIEW_WORDS: Record<LinkedinView, string> = {
  new: "To look at",
  commented: "Commented",
  skipped: "Skipped",
  today: "Today",
  comments: "Comments",
  posts: "Posts",
  people: "People",
}

/** One comment under a post, as the search account last read it. */
export type LinkedinTopComment = {
  /** LinkedIn's id for the comment. */
  id: string
  name: string
  /** The writer's job title, the line under their name. */
  headline: string
  /** Their page's slug, "" for a company or when LinkedIn did not show it. */
  slug: string
  text: string
  reactions: number
}

/**
 * Somebody's comment under one of ours, as the last check read it.
 * `postedAt` is an ISO date, since this is stored as JSON.
 */
export type LinkedinIncoming = {
  id: string
  name: string
  headline: string
  slug: string
  text: string
  reactions: number
  postedAt: string | null
}

/** A poll on a post of your own (part 31). Votes are read back afterwards. */
export type LinkedinPoll = {
  question: string
  choices: string[]
  days: LinkedinPollDays
  votes?: number[] | null
}

/** Somebody tagged in a post of your own (part 30): typed as @Name and picked from LinkedIn's own list. */
export type LinkedinTag = {
  name: string
  /** The person's or page's slug, which the picker's choice is checked against. */
  slug: string
  kind: "person" | "company"
}

/** Which lines on the AI usage screen are LinkedIn's, and how the module's spend line names them (part 48). */
export const LINKEDIN_AI_FEATURES = {
  "linkedin-comment": "comments",
  "linkedin-answer": "comments",
  "linkedin-rewrite": "comments",
  "linkedin-rules-check": "comments",
  "linkedin-post": "posts",
  "linkedin-newsletter": "posts",
  "linkedin-post-ideas": "ideas",
  "linkedin-keyword-ideas": "ideas",
  "linkedin-connect-note": "people",
} as const
export type LinkedinAiFeature = keyof typeof LINKEDIN_AI_FEATURES
export type LinkedinSpendPart = (typeof LINKEDIN_AI_FEATURES)[LinkedinAiFeature]

/** A post's own address. LinkedIn finds any post by its activity id. */
export function linkedinPostUrl(postId: string): string {
  return `https://www.linkedin.com/feed/update/urn:li:activity:${postId}/`
}

/** A person's page. */
export function linkedinPersonUrl(slug: string): string {
  return `https://www.linkedin.com/in/${slug}/`
}

/** A group's page. */
export function linkedinGroupUrl(groupId: string): string {
  return `https://www.linkedin.com/groups/${groupId}/`
}

/**
 * A person's or company's slug, the part of their address after /in/ or
 * /company/: letters, digits, dashes and underscores, 3 to 100 of them,
 * taken out of a pasted address or typed alone. "linkedin.com/in/jane-doe"
 * and "jane-doe" are both `jane-doe`.
 */
export function linkedinSlug(value: string, kind: "person" | "company" = "person"): string {
  let text = value.trim()
  const address = text.match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(in|company|school|showcase)\/([^/?#\s]+)/i)
  if (address) {
    const section = (address[1] ?? "").toLowerCase()
    if ((kind === "person") !== (section === "in")) return ""
    text = address[2] ?? ""
  }
  try {
    text = decodeURIComponent(text)
  } catch {
    return ""
  }
  text = text.replace(/^@/, "").replace(/\/$/, "")
  return /^[\p{L}\p{N}_-]{3,100}$/u.test(text) ? text : ""
}

/** A hashtag as it is stored: the words after the #, letters, digits and underscores only. */
export function linkedinHashtag(value: string): string {
  return value.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 100)
}

/** A keyword's value as it is stored, or "" when nothing usable is left. */
export function linkedinKeywordValue(kind: LinkedinKeywordKind, value: string): string {
  if (kind === "hashtag") return linkedinHashtag(value)
  if (kind === "person") return linkedinSlug(value, "person")
  if (kind === "company") return linkedinSlug(value, "company")
  return value.trim().replace(/\s+/g, " ")
}

/** A keyword in a few words, for a chip: "project tools", #saas, in/jane-doe, company/acme. */
export function linkedinKeywordLabel(keyword: { kind: LinkedinKeywordKind; value: string }): string {
  if (keyword.kind === "hashtag") return `#${keyword.value}`
  if (keyword.kind === "person") return `in/${keyword.value}`
  if (keyword.kind === "company") return `company/${keyword.value}`
  return `"${keyword.value}"`
}

/** A group id in a pasted address or on its own, or "" when there is none. */
export function linkedinGroupId(value: string): string {
  const text = value.trim()
  const address = text.match(/linkedin\.com\/groups\/(\d{3,20})/i)
  if (address) return address[1] ?? ""
  return /^\d{3,20}$/.test(text) ? text : ""
}

/** The links in a post's words, in the order they appear. */
export function linksIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"']+/gi)].map((match) => (match[0] ?? "").replace(/[.,;:!?)\]]+$/, ""))
}

/**
 * True when a writer's job title matches one of the titles a project sells
 * to (part 14): every word of the title, in any order, case aside. "Founder"
 * matches "Co-founder & CEO at Acme", "head of marketing" matches "Head of
 * Growth Marketing".
 */
export function titleMatches(headline: string, title: string): boolean {
  const words = (value: string) => value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const wanted = words(title)
  if (!wanted.length) return false
  const have = words(headline)
  return wanted.every((word) => have.some((part) => part === word || part.endsWith(word)))
}

/** The first title on the list that matches the headline, or "". */
export function matchedTitle(headline: string, titles: readonly string[]): string {
  return titles.find((title) => titleMatches(headline, title)) ?? ""
}

/** The longest job title on a project's "who we sell to" list, and how many it holds. */
export const BUYER_TITLE_CHARS = 60
export const MAX_BUYER_TITLES = 20
