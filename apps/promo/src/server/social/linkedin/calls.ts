import { z } from "zod"

import { call, type CommandTarget } from "@/server/browser/command"

/**
 * The typed calls to LinkedIn's routines, each answer checked against its
 * shape before anything reads it. In a browser they reach
 * `docker/browser/routines/linkedin.py`; on a phone the same names reach the
 * LinkedIn app's steps in `rack/promo_rack.py`. Kept beside LinkedIn's own
 * code, as X keeps its calls, so the shared command client only changes when
 * the way of talking changes.
 *
 * Every read a search account takes answers how many posts it put in front
 * of the account (`viewed`), because LinkedIn limits how much one account may
 * look at in a day and Promo stops short of that (part 3). `limited` is true
 * when LinkedIn showed a "you've reached the limit" or security check page
 * anyway.
 */

/** A page load then a few reads: the launcher allows 90 seconds, so this hears its own answer. */
const PAGE_THEN_READ_TIMEOUT_MS = 120_000

/** A check, a look-up or the weekly seen look opens several pages; the launcher allows 120 seconds. */
const PAGES_THEN_READ_TIMEOUT_MS = 150_000

/** A comment or a post is a whole visit; the launcher allows 900 seconds (`launch.py`). */
const VISIT_TIMEOUT_MS = 930_000

/** A newsletter issue types up to 20,000 characters at a person's pace; the launcher allows 1,800 seconds. */
const NEWSLETTER_TIMEOUT_MS = 1_830_000

/** A connect, an accept or a delete waits on several buttons and a look after; the launcher allows 240 seconds. */
const BUTTONS_TIMEOUT_MS = 270_000

/** An edit or a message types up to 1,250 characters at a person's pace; the launcher allows 600 seconds. */
const TYPED_TIMEOUT_MS = 630_000

const pageShape = z.object({ pageId: z.string(), slug: z.string(), name: z.string() })

const stateShape = z.object({
  /** False when the page was not on LinkedIn, so nothing can be said either way. */
  checked: z.boolean(),
  /** The signed-in member's slug, from their own page's address. Null when signed out. */
  slug: z.string().nullable(),
  name: z.string().default(""),
  /** A restriction, identity check, security check or limit page is in the way. */
  blocked: z.boolean(),
  reason: z.string(),
  /** LinkedIn's own words on a "restricted" or "verify your identity" page, which stop the account at once (part 5). Null when there is none. */
  banScreen: z.string().nullable().default(null),
  /** LinkedIn is asking for the code it emailed (part 4). */
  codeAsked: z.boolean().default(false),
  /** The company pages this member runs (part 38), from the "Comment as" list. Null when the look could not tell. */
  pages: z.array(pageShape).nullable().default(null),
  /** Whether the member has Premium, read off the gold badge. Null when the look could not tell. */
  premium: z.boolean().nullable().default(null),
  followers: z.number().int().nullable().default(null),
})

export type LinkedinState = z.infer<typeof stateShape>

const postShape = z.object({
  /** LinkedIn's activity id. */
  postId: z.string(),
  url: z.string(),
  text: z.string(),
  authorName: z.string(),
  /** The line under the writer's name: a person's job title, a page's tagline. */
  authorHeadline: z.string(),
  authorSlug: z.string(),
  authorKind: z.enum(["person", "company"]),
  authorFollowers: z.number().int().nullable(),
  postedSeconds: z.number().nullable(),
  reactions: z.number().int(),
  comments: z.number().int(),
  reposts: z.number().int(),
  /** False when the writer turned comments off or limited them to connections (part 18). */
  canComment: z.boolean(),
  /** A plain repost of somebody else's post with nothing added. */
  isRepost: z.boolean(),
  /** The first link in the post, or "". */
  link: z.string(),
})

export type LinkedinPost = z.infer<typeof postShape>

const readCost = { viewed: z.number().int(), limited: z.boolean() }

const searchShape = z.object({
  posts: z.array(postShape.extend({ position: z.number().int() })),
  ...readCost,
})

const topCommentShape = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string(),
  slug: z.string(),
  text: z.string(),
  reactions: z.number().int(),
})

const postReadShape = z.object({
  post: postShape.nullable(),
  /** The post is gone, or only its writer's connections may see it. */
  missing: z.boolean(),
  comments: z.array(topCommentShape),
  ...readCost,
})

const incomingShape = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string(),
  slug: z.string(),
  text: z.string(),
  reactions: z.number().int(),
  postedSeconds: z.number().nullable(),
})

export type LinkedinIncomingRead = z.infer<typeof incomingShape>

const checkShape = z.object({
  /** The post is there. For a comment, the post it sits under. */
  found: z.boolean(),
  /**
   * For a comment: it shows under its post for a stranger. For a post: it
   * shows on the account's activity. Null when the look ran out of time and
   * could not tell, which is never read as gone.
   */
  visible: z.boolean().nullable(),
  reactions: z.number().int().nullable(),
  /** Replies under our comment, or comments under our post. */
  comments: z.number().int().nullable(),
  reposts: z.number().int().nullable(),
  /** A poll's votes per answer, null for anything but a poll. */
  pollVotes: z.array(z.number().int()).nullable().default(null),
  incoming: z.array(incomingShape),
  ...readCost,
})

const lookupShape = z.object({
  found: z.array(
    z.object({
      kind: z.enum(["person", "company"]),
      slug: z.string(),
      exists: z.boolean(),
      name: z.string(),
      headline: z.string(),
      followers: z.number().int().nullable(),
    })
  ),
  ...readCost,
})

const groupShape = z.object({
  name: z.string(),
  description: z.string(),
  rules: z.string(),
  members: z.number().int().nullable(),
  ...readCost,
})

const seenShape = z.object({
  /** One answer per comment asked about: shown under its post for a stranger, or null when the look could not tell. */
  results: z.array(z.object({ commentId: z.string(), shown: z.boolean().nullable() })),
  ...readCost,
})

const findOwnShape = z.object({ found: z.string().nullable(), ...readCost })

const sentPostShape = z.object({ postId: z.string(), url: z.string() })
const sentCommentShape = z.object({ commentId: z.string(), url: z.string() })
const doneShape = z.object({ done: z.boolean() })
const connectShape = z.object({ done: z.boolean(), already: z.boolean() })
const warmUpShape = z.object({ postsRead: z.number().int(), problems: z.array(z.string()) })
const feedShape = z.object({ posts: z.array(postShape.extend({ position: z.number().int() })) })

const personShape = z.object({ slug: z.string(), name: z.string(), headline: z.string() })

const invitesShape = z.object({ invites: z.array(personShape.extend({ note: z.string() })) })

const viewersShape = z.object({
  viewers: z.array(personShape.extend({ viewedSeconds: z.number().nullable() })),
  /** How many LinkedIn says viewed in the last 90 days, null when it did not show. */
  total: z.number().int().nullable(),
  /** LinkedIn hid most viewers behind Premium. */
  premiumNeeded: z.boolean(),
})

const numbersShape = z.object({
  followers: z.number().int().nullable(),
  connections: z.number().int().nullable(),
  /** Profile views in LinkedIn's own window, null when it did not show. */
  profileViews: z.number().int().nullable(),
  /** Post impressions in LinkedIn's own window, null when it did not show. */
  impressions: z.number().int().nullable(),
})

const messageShape = z.object({
  id: z.string(),
  conversationId: z.string(),
  name: z.string(),
  slug: z.string(),
  text: z.string(),
  sentSeconds: z.number().nullable(),
})

const inboxShape = z.object({ messages: z.array(messageShape) })

/** Who the browser is signed in to LinkedIn as, after going to LinkedIn's feed. Only for a `check` a person asked for. */
export function linkedinState(target: CommandTarget) {
  return call(target, "linkedin/state", null, stateShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** The same question without moving the page. Asked after every LinkedIn job. */
export function linkedinQuickState(target: CommandTarget) {
  return call(target, "linkedin/quick_state", {}, stateShape)
}

/** Types the code LinkedIn emailed into the page asking for it (part 4). Nothing else is typed. */
export function linkedinEnterCode(target: CommandTarget, args: { code: string }) {
  return call(target, "linkedin/enter_code", { ...args }, stateShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/**
 * A keyword's newest posts: LinkedIn's post search sorted by latest, a
 * hashtag's page, or a person's or company's recent activity. `max` is the
 * most posts it may put in front of the search account.
 */
export function linkedinSearch(target: CommandTarget, args: { kind: string; value: string; max: number }) {
  return call(target, "linkedin/search", { ...args }, searchShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** One post read again, with its top comments (part 22). */
export function linkedinReadPost(target: CommandTarget, args: { postId: string }) {
  return call(target, "linkedin/post", { ...args }, postReadShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/**
 * A sent comment or post of ours read again by a stranger (part 43): a
 * comment by `commentId` under `postId`, or a post when `commentId` is "".
 */
export function linkedinCheck(target: CommandTarget, args: { postId: string; commentId: string; slug: string }) {
  return call(target, "linkedin/check", { ...args }, checkShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/** Whether people and company pages exist, with their names and followers (part 16). */
export function linkedinLookup(target: CommandTarget, args: { people: string[]; companies: string[] }) {
  return call(target, "linkedin/lookup", { ...args }, lookupShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/** A group's name, about words and rules (part 37). */
export function linkedinGroup(target: CommandTarget, args: { groupId: string }) {
  return call(target, "linkedin/group", { ...args }, groupShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** Whether a stranger sees each of the account's latest comments under its post (part 46). */
export function linkedinSeen(target: CommandTarget, args: { slug: string; comments: Array<{ postId: string; commentId: string; text: string }> }) {
  return call(target, "linkedin/seen", { ...args }, seenShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/**
 * Where a phone's comment or post landed, which the LinkedIn app does not
 * show: a comment by its words under `postId`, or a post by its words on the
 * account's recent activity when `postId` is "".
 */
export function linkedinFindOwn(target: CommandTarget, args: { slug: string; postId: string; text: string }) {
  return call(target, "linkedin/find_own", { ...args }, findOwnShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/**
 * One comment on a post, or a reply under `parentCommentId`, inside a visit.
 * Only ever called after a person pressed Post. `react` gives the post a
 * reaction a few seconds first, unless the account reacted already (part 26).
 * `asPageId` comments as a company page the account runs (part 38). `since`
 * is when the first try began, so the look for an earlier try reaches back
 * that far.
 */
export function linkedinComment(
  target: CommandTarget,
  args: { postId: string; parentCommentId: string; text: string; react: boolean; asPageId: string; since?: number }
) {
  return call(target, "linkedin/comment", { ...args }, sentCommentShape, VISIT_TIMEOUT_MS)
}

/**
 * One post of the account's own, or a repost with thoughts (`repostOf`), with
 * a picture, a video or a poll, tags typed through LinkedIn's own picker and
 * read back, into a group, or as a company page. Only ever called after a
 * person pressed Post.
 */
export function linkedinPublish(
  target: CommandTarget,
  args: {
    text: string
    pictureUrl: string
    videoUrl: string
    poll: { question: string; choices: string[]; days: number } | null
    tags: Array<{ name: string; slug: string; kind: "person" | "company" }>
    repostOf: string
    groupId: string
    asPageId: string
    since?: number
  }
) {
  return call(target, "linkedin/publish", { ...args }, sentPostShape, VISIT_TIMEOUT_MS)
}

/** One issue of the account's newsletter (part 36): a title, a body and a cover. Only ever called after a person pressed Publish. */
export function linkedinNewsletter(target: CommandTarget, args: { title: string; body: string; coverUrl: string; since?: number }) {
  return call(target, "linkedin/newsletter", { ...args }, sentPostShape, NEWSLETTER_TIMEOUT_MS)
}

/** New words for a comment of ours (`commentId` under `postId`), or for a post of ours when `commentId` is "" (part 45). */
export function linkedinEdit(target: CommandTarget, args: { postId: string; commentId: string; text: string }) {
  return call(target, "linkedin/edit", { ...args }, doneShape, TYPED_TIMEOUT_MS)
}

/** Deletes a comment of ours, or a post of ours when `commentId` is "". */
export function linkedinDelete(target: CommandTarget, args: { postId: string; commentId: string }) {
  return call(target, "linkedin/delete", { ...args }, doneShape, BUTTONS_TIMEOUT_MS)
}

/** One connection request from the person's page, with the note or without (part 39). `already` when LinkedIn shows them connected or asked. */
export function linkedinConnect(target: CommandTarget, args: { slug: string; note: string }) {
  return call(target, "linkedin/connect", { ...args }, connectShape, BUTTONS_TIMEOUT_MS)
}

/** The connection requests waiting on the account (part 40). Read only. */
export function linkedinInvites(target: CommandTarget, args: { max: number }) {
  return call(target, "linkedin/invites", { ...args }, invitesShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** Accepts one waiting request, from the invitations page. Only ever called after a person pressed Accept. */
export function linkedinAccept(target: CommandTarget, args: { slug: string }) {
  return call(target, "linkedin/accept", { ...args }, doneShape, BUTTONS_TIMEOUT_MS)
}

/** Who viewed the account's profile (part 41), as many as LinkedIn shows it. Read only. */
export function linkedinViewers(target: CommandTarget, args: { max: number }) {
  return call(target, "linkedin/viewers", { ...args }, viewersShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** The account's own numbers off its dashboard (part 47): followers, connections, profile views, impressions. Read only. */
export function linkedinNumbers(target: CommandTarget) {
  return call(target, "linkedin/numbers", {}, numbersShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/** The newest posts in the account's own home feed (part 13). Read only. */
export function linkedinFeed(target: CommandTarget, args: { max: number }) {
  return call(target, "linkedin/feed", { ...args }, feedShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/** A warming account's day on LinkedIn: the home feed and a search or two on its topic, read only. Nothing is written. */
export function linkedinWarmUp(target: CommandTarget, args: { words: string[] }) {
  return call(target, "linkedin/warm_up", { ...args }, warmUpShape, VISIT_TIMEOUT_MS)
}

/** The newest messages to the account, from people other than itself (part 42). */
export function linkedinInbox(target: CommandTarget) {
  return call(target, "linkedin/inbox", {}, inboxShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/** One answer in the conversation `conversationId`, with `slug` as the other person. Only ever called after a person pressed Send. */
export function linkedinMessage(target: CommandTarget, args: { conversationId: string; slug: string; text: string }) {
  return call(target, "linkedin/message", { ...args }, doneShape, TYPED_TIMEOUT_MS)
}
