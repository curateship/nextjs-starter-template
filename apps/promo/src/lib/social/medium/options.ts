/**
 * Medium's own choices, limits and words, which both halves of the app need
 * at runtime (`workspace/tasks/Medium/01-medium-features.md`). Here and not
 * beside the server code for the reason `src/lib/social/options.ts` gives: a
 * runtime value imported out of `@/server/*` drags the database into the
 * browser's bundle.
 *
 * Everything Medium shares with Reddit (a found post's statuses, the job
 * queue's kinds) stays in `src/lib/social/options.ts`. What only Medium has
 * is here.
 */

/**
 * What a Medium keyword is. Tyler, 21 Oct 2026: "Tags and search words". A
 * tag and a watch on a publication or a writer are read off Medium's public
 * feeds; search words go through Medium's search page in the reader browser.
 */
export const MEDIUM_KEYWORD_KINDS = ["tag", "search", "publication", "writer"] as const
export type MediumKeywordKind = (typeof MEDIUM_KEYWORD_KINDS)[number]

export const MEDIUM_KEYWORD_KIND_WORDS: Record<MediumKeywordKind, string> = {
  tag: "Tag",
  search: "Search words",
  publication: "Publication",
  writer: "Writer",
}

/**
 * A search keyword that is the product's own name, or a rival's, so the
 * stories it finds carry a chip and rank above the rest (part 13).
 */
export const MEDIUM_KEYWORD_MARKS = ["", "you", "rival"] as const
export type MediumKeywordMark = (typeof MEDIUM_KEYWORD_MARKS)[number]

export const MEDIUM_MARK_WORDS: Record<Exclude<MediumKeywordMark, "">, string> = {
  you: "Names you",
  rival: "Names a rival",
}

/** The longest keyword, the same as Reddit's. */
export const MAX_MEDIUM_KEYWORD_CHARS = 200

/**
 * The longest response the app sends. Tyler, 21 Oct 2026: "Up to 600
 * characters", about 100 words, long enough to help and short enough that a
 * writer won't hide it as an advert. The prompt, the endpoint and the count
 * under the box all read this one number.
 */
export const MAX_RESPONSE_CHARS = 600

/** How many response drafts one press asks for. */
export const MEDIUM_DRAFTS_PER_PRESS = 2

/** The three ways a response's words can be rewritten (part 24), in the order their buttons sit. */
export const RESPONSE_REWRITES = ["shorter", "warmer", "less_salesy"] as const
export type ResponseRewrite = (typeof RESPONSE_REWRITES)[number]

export const RESPONSE_REWRITE_WORDS: Record<ResponseRewrite, string> = {
  shorter: "Shorter",
  warmer: "Warmer",
  less_salesy: "Less salesy",
}

/**
 * How long an article the AI writes is. Tyler, 21 Oct 2026: "800 to 1,200
 * words", about a 4 to 5 minute read.
 */
export const ARTICLE_WORDS = { min: 800, max: 1_200 } as const

/** Medium lets a story carry five tags. */
export const MAX_ARTICLE_TAGS = 5
export const MAX_ARTICLE_TITLE_CHARS = 200
export const MAX_ARTICLE_SUBTITLE_CHARS = 300
/** Room for 1,200 words of plain text with headings, with plenty to spare for an edit. */
export const MAX_ARTICLE_BODY_CHARS = 30_000
/** What a person may tell the AI an article is about. */
export const MAX_ARTICLE_ABOUT_CHARS = 2_000

/**
 * Days a new Medium account waits before it responds or publishes. Tyler,
 * 21 Oct 2026: "7 days". Reddit's is the Settings → Behaviour number (3 to
 * begin with); Medium has no karma to build, so time is the only signal.
 * Counted from the day Medium says the account joined.
 */
export const MEDIUM_WARM_UP_DAYS = 7

/** Where a found Medium story has got to. The same four as a Reddit post. */
export type MediumFindStatus = "new" | "shortlisted" | "skipped" | "commented"

/** A response that went out, or tried to. */
export const MEDIUM_RESPONSE_STATUSES = ["waiting", "posted", "failed"] as const
export type MediumResponseStatus = (typeof MEDIUM_RESPONSE_STATUSES)[number]

/** An article, from a draft in Promo to live on Medium. */
export const MEDIUM_ARTICLE_STATUSES = ["draft", "waiting", "published", "failed"] as const
export type MediumArticleStatus = (typeof MEDIUM_ARTICLE_STATUSES)[number]

export const MEDIUM_ARTICLE_STATUS_WORDS: Record<MediumArticleStatus, string> = {
  draft: "Draft",
  waiting: "Waiting to publish",
  published: "Published",
  failed: "Did not publish",
}

/** A story on an account's public Medium list. */
export type MediumListItemStatus = "waiting" | "added" | "failed"

/**
 * The tabs across the Medium module's middle column, in the address as
 * `?view=`. None is To look at. Responses holds its Failed list as `?list=failed`.
 */
export const MEDIUM_VIEWS = ["new", "replied", "skipped", "today", "responses", "articles", "publications"] as const
export type MediumView = (typeof MEDIUM_VIEWS)[number]

export const MEDIUM_VIEW_WORDS: Record<MediumView, string> = {
  new: "To look at",
  replied: "Replied",
  skipped: "Skipped",
  today: "Today",
  responses: "Responses",
  articles: "Articles",
  publications: "Publications",
}

/** One response under a story, as the reader last read it. */
export type MediumStoryResponse = {
  /** Medium's id for the response, which is a story of its own. */
  id: string
  writer: string
  text: string
  claps: number
}

/**
 * Somebody's response under one of ours or under one of our articles, as the
 * last check read it. `postedAt` is an ISO date, since this is stored as JSON.
 */
export type MediumIncoming = {
  id: string
  writerId: string
  writer: string
  text: string
  claps: number
  postedAt: string | null
}

/** An article's outline, picked before the article is written (part 27). */
export type MediumOutline = {
  titles: string[]
  headings: string[]
}

/** Which lines on the AI usage screen are Medium's, and how the module's spend line names them (part 41). */
export const MEDIUM_AI_FEATURES = {
  "medium-response": "responses",
  "medium-answer": "responses",
  "medium-rewrite": "responses",
  "medium-rules-check": "responses",
  "medium-article": "articles",
  "medium-outline": "articles",
  "medium-ideas": "articles",
  "medium-keyword-ideas": "articles",
  "medium-cover": "covers",
} as const
export type MediumAiFeature = keyof typeof MEDIUM_AI_FEATURES
export type MediumSpendPart = (typeof MEDIUM_AI_FEATURES)[MediumAiFeature]

/** A Medium story's own address. Every story has one under /p/, whatever domain it lives on. */
export function mediumStoryUrl(storyId: string): string {
  return `https://medium.com/p/${storyId}`
}

/** A writer's page on Medium. */
export function mediumWriterUrl(handle: string): string {
  return `https://medium.com/@${handle}`
}

/** A publication's page on Medium. */
export function mediumPublicationUrl(slug: string): string {
  return `https://medium.com/${slug}`
}

/** A tag's newest stories on Medium. */
export function mediumTagUrl(tag: string): string {
  return `https://medium.com/tag/${tag}`
}

/**
 * A tag as Medium writes it in an address: lower case, words joined by
 * hyphens, nothing else. "Project Management" is `project-management`.
 */
export function mediumTagSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * A publication's or a writer's name as Medium writes it in an address,
 * taken out of a pasted address when one is given: "medium.com/better-
 * programming" and "better-programming" are both `better-programming`, and
 * "@sam" and "medium.com/@sam" are both `sam`.
 */
export function mediumNameSlug(value: string, kind: "publication" | "writer"): string {
  let text = value.trim()
  const address = text.match(/^(?:https?:\/\/)?(?:www\.)?medium\.com\/(.+)$/i)
  if (address) text = address[1]
  text = text.split(/[/?#]/)[0] ?? ""
  if (kind === "writer") text = text.replace(/^@/, "")
  return text.replace(/[^A-Za-z0-9._-]/g, "")
}

/** A keyword's value as it is stored, or "" when nothing usable is left. */
export function mediumKeywordValue(kind: MediumKeywordKind, value: string): string {
  if (kind === "tag") return mediumTagSlug(value)
  if (kind === "search") return value.trim().replace(/\s+/g, " ")
  return mediumNameSlug(value, kind)
}

/** A keyword in a few words, for a chip: #productivity, "project tools", better-programming, @sam. */
export function mediumKeywordLabel(keyword: { kind: MediumKeywordKind; value: string }): string {
  if (keyword.kind === "tag") return `#${keyword.value}`
  if (keyword.kind === "writer") return `@${keyword.value}`
  if (keyword.kind === "search") return `"${keyword.value}"`
  return keyword.value
}

/**
 * The story id at the end of a Medium address, or null. A story's address
 * ends in its id after the last hyphen, on medium.com, a writer's
 * subdomain or a publication's own domain, and /p/ addresses are the id itself.
 */
export function mediumStoryId(url: string): string | null {
  const path = url.split(/[?#]/)[0] ?? ""
  const match = path.match(/(?:\/p\/|-)([0-9a-f]{8,16})\/?$/)
  return match ? match[1] : null
}

/**
 * Whether a pasted address can be Medium's emailed sign-in link: https, on
 * medium.com itself. Anything else is refused before a job is written, so the
 * account's browser is never sent somewhere a person did not mean.
 */
export function isMediumSignInLink(value: string): boolean {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  return url.protocol === "https:" && (url.hostname === "medium.com" || url.hostname === "www.medium.com")
}

/** Words in a piece of writing, for the count under an article's box. */
export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g)
  return words ? words.length : 0
}
