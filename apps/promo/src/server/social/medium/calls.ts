import { z } from "zod"

import { call, type CommandTarget } from "@/server/browser/command"

/**
 * The typed calls to Medium's routines (`docker/browser/routines/medium.py`),
 * each answer checked against its shape before anything reads it, the same
 * way `src/server/browser/command.ts` does for Reddit's. Kept beside Medium's
 * own code, as the phone apps keep theirs in `phone-apps/calls.ts`, so the
 * shared command client only changes when the way of talking changes.
 */

/** A page load then a few reads: the launcher allows 90 seconds, so this hears its own answer. */
const PAGE_THEN_READ_TIMEOUT_MS = 120_000

/** A response is a whole visit; the launcher allows 900 seconds (`launch.py`). */
const VISIT_TIMEOUT_MS = 930_000

/** An article is typed and pasted, then its topics; the launcher allows 600 seconds. */
const LONG_WRITE_TIMEOUT_MS = 630_000

/** A list add or a delete waits on several buttons and a check after; the launcher allows 240 seconds. */
const BUTTONS_TIMEOUT_MS = 270_000

const stateShape = z.object({
  checked: z.boolean(),
  handle: z.string().nullable(),
  blocked: z.boolean(),
  reason: z.string(),
  joinedSeconds: z.number().nullable().default(null),
  followers: z.number().int().nullable().default(null),
})

export type MediumState = z.infer<typeof stateShape>

const storyShape = z.object({
  storyId: z.string(),
  url: z.string(),
  title: z.string(),
  subtitle: z.string(),
  writerId: z.string(),
  writerHandle: z.string(),
  writerName: z.string(),
  writerFollowers: z.number().int().nullable(),
  publicationSlug: z.string(),
  publicationName: z.string(),
  tags: z.array(z.string()),
  postedSeconds: z.number().nullable(),
  claps: z.number().int(),
  responseCount: z.number().int(),
  membersOnly: z.boolean(),
  allowResponses: z.boolean(),
  deleted: z.boolean(),
  text: z.string(),
})

export type MediumStory = z.infer<typeof storyShape>

const searchShape = z.object({
  stories: z.array(storyShape.extend({ position: z.number().int() })),
  unread: z.number().int(),
})

const storyReadShape = storyShape.extend({
  responses: z.array(z.object({ id: z.string(), writer: z.string(), text: z.string(), claps: z.number().int() })),
})

const incomingShape = z.object({
  id: z.string(),
  writerId: z.string(),
  writer: z.string(),
  text: z.string(),
  claps: z.number().int(),
  replies: z.number().int(),
  hidden: z.boolean(),
  deleted: z.boolean(),
  postedSeconds: z.number().nullable(),
})

export type MediumIncomingRead = z.infer<typeof incomingShape>

const checkShape = z.object({
  found: z.boolean(),
  visible: z.boolean(),
  claps: z.number().int().nullable(),
  incoming: z.array(incomingShape),
  /** For an article: the publication it is in now, "" for none. Left out for a response. */
  publicationSlug: z.string().default(""),
  responseCount: z.number().int().nullable().default(null),
})

const respondShape = z.object({ responseId: z.string(), responseUrl: z.string() })
const publishShape = z.object({ storyId: z.string(), url: z.string() })
const doneShape = z.object({ done: z.boolean() })
const statsShape = z.object({ views: z.number().int().nullable(), reads: z.number().int().nullable() })
const warmUpShape = z.object({ storiesRead: z.number().int(), followed: z.array(z.string()), problems: z.array(z.string()) })
const publicationShape = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  rules: z.string(),
  signedIn: z.boolean(),
  writes: z.boolean(),
})

/** Who the browser is signed in to Medium as, after going to Medium's front page. Only for a `check` a person asked for. */
export function mediumState(target: CommandTarget) {
  return call(target, "medium/state", null, stateShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** The same question without moving the page. Asked after every Medium job. */
export function mediumQuickState(target: CommandTarget) {
  return call(target, "medium/quick_state", {}, stateShape)
}

/** Opens Medium's emailed sign-in link inside this profile's browser, then says who is signed in. */
export function mediumSignIn(target: CommandTarget, args: { url: string }) {
  return call(target, "medium/sign_in", { ...args }, stateShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** A keyword's stories, each read from Medium's own data. */
export function mediumSearch(target: CommandTarget, args: { kind: string; value: string }) {
  return call(target, "medium/search", { ...args }, searchShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** One story read in full, with its top responses. */
export function mediumStory(target: CommandTarget, args: { storyId: string }) {
  return call(target, "medium/story", { ...args }, storyReadShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** A sent response (with `responseId`) or an article read again. */
export function mediumCheck(target: CommandTarget, args: { storyId: string; responseId?: string }) {
  return call(target, "medium/check", { ...args }, checkShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** One response or answer, inside a visit. Only ever called after a person pressed Post. */
export function mediumRespond(
  target: CommandTarget,
  args: { storyId: string; text: string; line: string; tags: string[] }
) {
  return call(target, "medium/respond", { ...args }, respondShape, VISIT_TIMEOUT_MS)
}

/** One article. Only ever called after a person pressed Publish. */
export function mediumPublish(
  target: CommandTarget,
  args: { title: string; subtitle: string; body: string; tags: string[]; coverUrl: string; publication: string }
) {
  return call(target, "medium/publish", { ...args }, publishShape, LONG_WRITE_TIMEOUT_MS)
}

/** New words for a response or an article the account wrote. */
export function mediumEdit(target: CommandTarget, args: { storyId: string; text: string; title?: string }) {
  return call(target, "medium/edit", { ...args }, doneShape, LONG_WRITE_TIMEOUT_MS)
}

/** Deletes a response or an article the account wrote. */
export function mediumDelete(target: CommandTarget, args: { storyId: string }) {
  return call(target, "medium/delete", { ...args }, doneShape, BUTTONS_TIMEOUT_MS)
}

/** An article's views and reads, which only its writer sees. */
export function mediumStats(target: CommandTarget, args: { storyId: string }) {
  return call(target, "medium/stats", { ...args }, statsShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** A warming account's day on Medium. Nothing is written. */
export function mediumWarmUp(target: CommandTarget, args: { tags: string[] }) {
  return call(target, "medium/warm_up", { ...args }, warmUpShape, VISIT_TIMEOUT_MS)
}

/** Puts a story on the account's public Medium list. */
export function mediumAddToList(target: CommandTarget, args: { storyId: string; list: string }) {
  return call(target, "medium/add_to_list", { ...args }, doneShape, BUTTONS_TIMEOUT_MS)
}

/** A publication's name, about words, submission guidelines, and whether this account writes for it. */
export function mediumPublication(target: CommandTarget, args: { slug: string }) {
  return call(target, "medium/publication", { ...args }, publicationShape, PAGE_THEN_READ_TIMEOUT_MS)
}

const profileShape = z.object({
  joinedSeconds: z.number().nullable(),
  followers: z.number().int().nullable(),
  userId: z.string().nullable(),
})

/** When a writer joined and their followers, read by the reader. For an account on a phone, whose app shows neither date. */
export function mediumProfile(target: CommandTarget, args: { handle: string }) {
  return call(target, "medium/profile", { ...args }, profileShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** Medium's id for a response a phone sent, looked up under its story by the account's name and words. "" when not there yet. */
export function mediumFindResponse(target: CommandTarget, args: { storyId: string; writer: string; text: string }) {
  return call(target, "medium/find_response", { ...args }, z.object({ responseId: z.string() }), PAGE_THEN_READ_TIMEOUT_MS)
}
