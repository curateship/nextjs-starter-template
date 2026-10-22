import { z } from "zod"

import { call, type CommandTarget } from "@/server/browser/command"

/**
 * The typed calls to X's routines, each answer checked against its shape
 * before anything reads it. In a browser they reach
 * `docker/browser/routines/x.py`; on a phone the same names reach the X app's
 * steps in `rack/promo_rack.py`. Kept beside X's own code, as Medium keeps
 * its calls, so the shared command client only changes when the way of
 * talking changes.
 *
 * Every read a search account takes answers how many posts it put in front
 * of the account (`viewed`), because X caps how many posts an account may
 * see in a day and Promo stops short of that cap (part 5). `limited` is true
 * when X showed its "rate limit exceeded" screen anyway.
 */

/** A page load then a few reads: the launcher allows 90 seconds, so this hears its own answer. */
const PAGE_THEN_READ_TIMEOUT_MS = 120_000

/** A sent post read again, a reach look or a look-up opens several pages; the launcher allows 120 seconds. */
const PAGES_THEN_READ_TIMEOUT_MS = 150_000

/** A reply or a quote is a whole visit; the launcher allows 900 seconds (`launch.py`). */
const VISIT_TIMEOUT_MS = 930_000

/** A follow, a list add or a delete waits on several buttons and a look after; the launcher allows 240 seconds. */
const BUTTONS_TIMEOUT_MS = 270_000

/** An edit or a message types up to 1,000 characters at a person's pace; the launcher allows 600 seconds. */
const TYPED_TIMEOUT_MS = 630_000

const stateShape = z.object({
  /** False when the page was not on X, so nothing can be said either way. */
  checked: z.boolean(),
  handle: z.string().nullable(),
  /** A lock, suspension, "confirm it's you" or rate-limit screen is in the way. */
  blocked: z.boolean(),
  reason: z.string(),
  /** X's own words on a lock or suspended screen, which stop the account at once (part 7). Null when there is none. */
  banScreen: z.string().nullable().default(null),
  joinedSeconds: z.number().nullable().default(null),
  followers: z.number().int().nullable().default(null),
})

export type XState = z.infer<typeof stateShape>

const postShape = z.object({
  postId: z.string(),
  url: z.string(),
  text: z.string(),
  authorId: z.string(),
  authorHandle: z.string(),
  authorName: z.string(),
  authorFollowers: z.number().int().nullable(),
  postedSeconds: z.number().nullable(),
  views: z.number().int().nullable(),
  likes: z.number().int(),
  replies: z.number().int(),
  reposts: z.number().int(),
  /** False when the poster limited replies to followers or to people they named (part 17). */
  repliesOpen: z.boolean(),
  /** A reply under somebody else's post, rather than a post of its own. */
  isReply: z.boolean(),
  /** The first link in the post, or "". */
  link: z.string(),
})

export type XPost = z.infer<typeof postShape>

const readCost = { viewed: z.number().int(), limited: z.boolean() }

const searchShape = z.object({
  posts: z.array(postShape.extend({ position: z.number().int() })),
  ...readCost,
})

const topReplyShape = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  text: z.string(),
  likes: z.number().int(),
})

const postReadShape = z.object({
  post: postShape.nullable(),
  /** The post is gone or its account is protected. */
  missing: z.boolean(),
  replies: z.array(topReplyShape),
  ...readCost,
})

const incomingShape = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  text: z.string(),
  likes: z.number().int(),
  postedSeconds: z.number().nullable(),
})

export type XIncomingRead = z.infer<typeof incomingShape>

const checkShape = z.object({
  found: z.boolean(),
  /**
   * Under its post for a stranger, not folded behind "Show more replies".
   * Null when the look ran out of time and could not tell, which is never
   * read as gone.
   */
  visible: z.boolean().nullable(),
  views: z.number().int().nullable(),
  likes: z.number().int().nullable(),
  replies: z.number().int().nullable(),
  reposts: z.number().int().nullable(),
  /** A poll's votes per choice, null for anything but a poll. */
  pollVotes: z.array(z.number().int()).nullable().default(null),
  incoming: z.array(incomingShape),
  ...readCost,
})

const mentionsShape = z.object({ incoming: z.array(incomingShape), ...readCost })

const trendsShape = z.object({
  trends: z.array(z.object({ name: z.string(), posts: z.number().int().nullable() })),
  /** Where X says the trends are for, as it words it ("Trending in United Kingdom"), or "". */
  place: z.string(),
  ...readCost,
})

const lookupShape = z.object({
  accounts: z.array(
    z.object({
      handle: z.string(),
      exists: z.boolean(),
      name: z.string(),
      followers: z.number().int().nullable(),
      joinedSeconds: z.number().nullable(),
    })
  ),
  ...readCost,
})

const communityShape = z.object({
  name: z.string(),
  description: z.string(),
  rules: z.string(),
  members: z.number().int().nullable(),
  ...readCost,
})

const reachShape = z.object({
  /** The account's latest reply showed up in X's search for its own words. */
  inSearch: z.boolean(),
  /** Where it sat under its post for a stranger. */
  underPost: z.enum(["shown", "folded", "missing"]),
  ...readCost,
})

const sentShape = z.object({ postId: z.string(), url: z.string() })
const doneShape = z.object({ done: z.boolean() })
const warmUpShape = z.object({ postsRead: z.number().int(), problems: z.array(z.string()) })

const messageShape = z.object({
  id: z.string(),
  conversationId: z.string(),
  handle: z.string(),
  name: z.string(),
  text: z.string(),
  sentSeconds: z.number().nullable(),
})

export type XMessageRead = z.infer<typeof messageShape>

const inboxShape = z.object({ messages: z.array(messageShape) })

/** Who the browser is signed in to X as, after going to X's home. Only for a `check` a person asked for. */
export function xState(target: CommandTarget) {
  return call(target, "x/state", null, stateShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** The same question without moving the page. Asked after every X job. */
export function xQuickState(target: CommandTarget) {
  return call(target, "x/quick_state", {}, stateShape)
}

/** Types X's six-digit sign-in code into the page asking for it (part 6). Nothing else is typed. */
export function xEnterCode(target: CommandTarget, args: { code: string }) {
  return call(target, "x/enter_code", { ...args }, stateShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/**
 * A keyword's newest posts, on X's Latest tab or an account's own page.
 * `max` is the most posts it may put in front of the search account.
 */
export function xSearch(target: CommandTarget, args: { kind: string; value: string; max: number }) {
  return call(target, "x/search", { ...args }, searchShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** One post read again, with its top replies (part 22). */
export function xReadPost(target: CommandTarget, args: { postId: string }) {
  return call(target, "x/post", { ...args }, postReadShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** A sent reply or post of ours read again, with what was said under it (part 37). */
export function xCheck(target: CommandTarget, args: { postId: string; handle: string }) {
  return call(target, "x/check", { ...args }, checkShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/** The newest posts naming the account as @handle, replies to us included (part 39). */
export function xMentions(target: CommandTarget, args: { handle: string; max: number }) {
  return call(target, "x/mentions", { ...args }, mentionsShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** What X says is trending for the search account's place (part 15). */
export function xTrends(target: CommandTarget) {
  return call(target, "x/trends", {}, trendsShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** Whether accounts exist, with their names and followers (parts 14 and 43). */
export function xLookup(target: CommandTarget, args: { handles: string[] }) {
  return call(target, "x/lookup", { ...args }, lookupShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/** A community's name, about words and rules (part 35). */
export function xCommunity(target: CommandTarget, args: { communityId: string }) {
  return call(target, "x/community", { ...args }, communityShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** Whether a stranger finds the account's latest reply in search and under its post (part 42). */
export function xReach(target: CommandTarget, args: { handle: string; postId: string; text: string; parentId: string }) {
  return call(target, "x/reach", { ...args }, reachShape, PAGES_THEN_READ_TIMEOUT_MS)
}

/**
 * One reply, or an answer, inside a visit. Only ever called after a person
 * pressed Post. `replyToId` is the post it sits under.
 */
export function xReply(target: CommandTarget, args: { replyToId: string; text: string }) {
  return call(target, "x/reply", { ...args }, sentShape, VISIT_TIMEOUT_MS)
}

/** One quote post of somebody's post (part 34). Only ever called after a person pressed Post. */
export function xQuote(target: CommandTarget, args: { postId: string; text: string }) {
  return call(target, "x/quote", { ...args }, sentShape, VISIT_TIMEOUT_MS)
}

/**
 * One post of the account's own: the first of a thread (into a community
 * when `communityId` is set, with a poll when `poll` is set), or a later one
 * under `replyToId`. Only ever called after a person pressed Post.
 */
export function xPublish(
  target: CommandTarget,
  args: {
    text: string
    pictureUrl: string
    replyToId: string
    communityId: string
    poll: { choices: string[]; minutes: number } | null
    /** When the post's first try began, in seconds, so the look for an earlier try reaches back that far. */
    since?: number
  }
) {
  return call(target, "x/publish", { ...args }, sentShape, VISIT_TIMEOUT_MS)
}

/** An edit's answer: X gives the edited post a new id, null when the routine could not read it. */
const editShape = z.object({ done: z.boolean(), postId: z.string().nullable() })

/** New words for a post of ours, which X allows a paid account within an hour (part 40). */
export function xEdit(target: CommandTarget, args: { postId: string; text: string }) {
  return call(target, "x/edit", { ...args }, editShape, TYPED_TIMEOUT_MS)
}

/** Deletes a post of ours. */
export function xDelete(target: CommandTarget, args: { postId: string }) {
  return call(target, "x/delete", { ...args }, doneShape, BUTTONS_TIMEOUT_MS)
}

/** Follows one account from its page (part 44). */
export function xFollow(target: CommandTarget, args: { handle: string }) {
  return call(target, "x/follow", { ...args }, doneShape, BUTTONS_TIMEOUT_MS)
}

/** A warming account's day on X: the home feed and a search or two on its topic, read only. Nothing is written. */
export function xWarmUp(target: CommandTarget, args: { words: string[] }) {
  return call(target, "x/warm_up", { ...args }, warmUpShape, VISIT_TIMEOUT_MS)
}

/** Puts an account on the account's public X list called `list`, making the list the first time (part 36). */
export function xListAdd(target: CommandTarget, args: { list: string; handle: string }) {
  return call(target, "x/list_add", { ...args }, doneShape, BUTTONS_TIMEOUT_MS)
}

/** The newest direct messages to the account, from people other than itself (part 41). */
export function xInbox(target: CommandTarget) {
  return call(target, "x/inbox", {}, inboxShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** One answer in the direct-message conversation with `handle`. Only ever called after a person pressed Send. */
export function xMessage(target: CommandTarget, args: { handle: string; text: string }) {
  return call(target, "x/message", { ...args }, doneShape, TYPED_TIMEOUT_MS)
}
