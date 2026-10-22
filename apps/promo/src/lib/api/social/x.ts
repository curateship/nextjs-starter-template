import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { Refusal } from "@/server/browser/refusal"
import { db } from "@/server/db"
import { queueJob } from "@/server/social/jobs"
import { promoAccounts, promoJobs } from "@/server/social/schema"
import {
  addXCommunity,
  listXCommunities,
  queueXCommunityRead,
  removeXCommunity,
  saveXCommunityRules,
  type XCommunityView,
} from "@/server/social/x/communities"
import {
  checkXRules,
  rewriteXReply,
  writeXAnswer,
  writeXDrafts,
  writeXPost,
  xKeywordIdeas,
  xTrendIdeas,
  type WrittenXPost,
  type XDraftView,
  type XKeywordIdea,
  type XRulesVerdict,
} from "@/server/social/x/drafts"
import { hideXAuthor, listXFinds, ownedXFind, setXFindsStatus, unhideX, type XFindView } from "@/server/social/x/finds"
import { addXKeyword, deleteXKeyword, queueProjectXSearches, queueXSearch, setXKeyword } from "@/server/social/x/keywords"
import { listXListItems, queueXListAdd, type XListItemView } from "@/server/social/x/lists"
import {
  readXFindDetail,
  readXModuleView,
  readXToday,
  type XFindDetail,
  type XModuleView,
  type XToday,
} from "@/server/social/x/module"
import { cancelXReply, queueXAnswer, queueXReply, type QueuedXReply } from "@/server/social/x/posting"
import {
  cancelXPublish,
  deleteXDraftPost,
  listXPosts,
  listXQuotes,
  queueXPublish,
  saveXPost,
  xPostSources,
  type QueuedXPost,
  type XPostSource,
  type XPostView,
} from "@/server/social/x/posts"
import { listXReadings, queueXReachLook, type XReadingView } from "@/server/social/x/reach"
import {
  dismissFailedXReply,
  listXMentions,
  listXReplies,
  queueXChange,
  queueXChecks,
  retryFailedXReply,
  type XMentionView,
  type XReplyView,
} from "@/server/social/x/replies"
import { lastXTrends } from "@/server/social/x/search"
import {
  addSearcher,
  listSearchers,
  readXSettings,
  removeSearcher,
  saveXSettings,
  type SearcherView,
  type XSettings,
} from "@/server/social/x/searchers"
import { ownedProject } from "@/server/social/projects"
import {
  MAX_THREAD_PIECES,
  MAX_X_KEYWORD_CHARS,
  POLL_CHOICES,
  X_KEYWORD_KINDS,
  X_KEYWORD_MARKS,
  X_REWRITES,
  type XKeywordKind,
  type XKeywordMark,
  type XRewrite,
} from "@/lib/social/x/options"

import { describeAuthError } from "../error-message"

export type {
  QueuedXPost,
  QueuedXReply,
  SearcherView,
  WrittenXPost,
  XCommunityView,
  XDraftView,
  XFindDetail,
  XFindView,
  XKeywordIdea,
  XListItemView,
  XMentionView,
  XModuleView,
  XPostSource,
  XPostView,
  XReadingView,
  XReplyView,
  XRulesVerdict,
  XSettings,
  XToday,
}

/**
 * X's endpoints (`workspace/tasks/X/01-x-features.md`). Admin only, like
 * every Promo endpoint, and the owner's alone: a guest sent from Project does
 * not work X.
 *
 * Drafting, rewriting and the rules check happen in the request, because an
 * AI call takes seconds and the person is watching the box. Searching,
 * reading, sending, posting and checking go on the queue, because they need
 * a browser.
 */

/**
 * X's refusals are written for the reader, naming the account, the post or
 * the limit, so they pass through as they are. Only a database or network
 * failure, which says nothing a person can act on, is swapped for a plain
 * sentence.
 */
const NOT_FOR_READERS = ["violates", "duplicate key", "relation \"", "column \"", "Failed query", "ECONN", "fetch failed", "Unexpected token", "undefined"]

export function getXErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (message.includes("AI_LIMIT_REACHED")) return "This month's AI allowance is used up."
  const auth = describeAuthError(message)
  if (auth) return auth
  if (!message || NOT_FOR_READERS.some((words) => message.includes(words))) return "That did not work. Please try again."
  return message
}

const id = z.string().min(1).max(64)
const tab = z.enum(["new", "replied", "skipped"])
const words = z.string().max(20_000)

const moduleFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<XModuleView> => readXModuleView(context.user.id, data.projectId))

/** The X module's accounts, keywords, counts, search accounts and spend. */
export function loadXModule(projectId: string) {
  return moduleFn({ data: { projectId } })
}

const findsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id, keywordId: id.nullable(), tab, search: z.string().max(200).optional() }))
  .handler(async ({ context, data }): Promise<XFindView[]> => listXFinds(context.user.id, data))

/** One tab of posts, under one keyword or every one. */
export function loadXFinds(query: { projectId: string; keywordId: string | null; tab: "new" | "replied" | "skipped"; search?: string }) {
  return findsFn({ data: query })
}

const detailFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ findId: id }))
  .handler(async ({ context, data }): Promise<XFindDetail> => readXFindDetail(context.user.id, data.findId))

/** One post for the right column. */
export function loadXFindDetail(findId: string) {
  return detailFn({ data: { findId } })
}

const todayFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<XToday> => readXToday(context.user.id, data.projectId))

export function loadXToday(projectId: string) {
  return todayFn({ data: { projectId } })
}

const repliesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id, list: z.enum(["sent", "failed"]) }))
  .handler(async ({ context, data }): Promise<{ replies: XReplyView[]; mentions: XMentionView[] }> => ({
    replies: await listXReplies(context.user.id, data.projectId, data.list),
    mentions: data.list === "sent" ? await listXMentions(context.user.id, data.projectId) : [],
  }))

/** The Replies tab: what was sent, or what failed, and the posts naming the project's accounts. */
export function loadXReplies(projectId: string, list: "sent" | "failed") {
  return repliesFn({ data: { projectId, list } })
}

export type XPostsTab = {
  posts: XPostView[]
  quotes: Awaited<ReturnType<typeof listXQuotes>>
  list: XListItemView[]
  sources: XPostSource[]
}

const postsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<XPostsTab> => ({
    posts: await listXPosts(context.user.id, data.projectId),
    quotes: await listXQuotes(context.user.id, data.projectId),
    list: await listXListItems(context.user.id, data.projectId),
    sources: await xPostSources(context.user.id, data.projectId),
  }))

/** The Posts tab: posts and threads of your own, quote posts, the public lists, and what a post can start from. */
export function loadXPosts(projectId: string) {
  return postsFn({ data: { projectId } })
}

const communitiesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<XCommunityView[]> => listXCommunities(context.user.id, data.projectId))

export function loadXCommunities(projectId: string) {
  return communitiesFn({ data: { projectId } })
}

const keywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      kind: z.enum(X_KEYWORD_KINDS),
      value: z.string().min(1).max(MAX_X_KEYWORD_CHARS * 2),
      mark: z.enum(X_KEYWORD_MARKS).optional(),
    })
  )
  .handler(async ({ context, data }) => addXKeyword(context.user.id, data.projectId, data))

/** Saves an X keyword and searches it. `searchRefused` says why its first search could not be queued. */
export function saveXKeyword(input: { projectId: string; kind: XKeywordKind; value: string; mark?: XKeywordMark }) {
  return keywordFn({ data: input })
}

const keywordChangeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("change", [
      z.object({ change: z.literal("delete"), keywordId: id }),
      z.object({ change: z.literal("enabled"), keywordId: id, enabled: z.boolean() }),
      z.object({ change: z.literal("notify"), keywordId: id, notify: z.boolean() }),
      z.object({ change: z.literal("mark"), keywordId: id, mark: z.enum(X_KEYWORD_MARKS) }),
      z.object({ change: z.literal("search"), keywordId: id }),
    ])
  )
  .handler(async ({ context, data }): Promise<void> => {
    if (data.change === "delete") await deleteXKeyword(context.user.id, data.keywordId)
    else if (data.change === "enabled") await setXKeyword(context.user.id, data.keywordId, { enabled: data.enabled })
    else if (data.change === "notify") await setXKeyword(context.user.id, data.keywordId, { notify: data.notify })
    else if (data.change === "mark") await setXKeyword(context.user.id, data.keywordId, { mark: data.mark })
    else await queueXSearch(context.user.id, data.keywordId)
  })

/** Removes, switches, rings, marks or searches one X keyword. */
export function changeXKeyword(
  change:
    | { change: "delete"; keywordId: string }
    | { change: "enabled"; keywordId: string; enabled: boolean }
    | { change: "notify"; keywordId: string; notify: boolean }
    | { change: "mark"; keywordId: string; mark: XKeywordMark }
    | { change: "search"; keywordId: string }
) {
  return keywordChangeFn({ data: change })
}

const searchAllFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({ queued: await queueProjectXSearches(context.user.id, data.projectId) }))

/** Searches every switched-on X keyword of the project. */
export function searchAllX(projectId: string) {
  return searchAllFn({ data: { projectId } })
}

export type XIdeas = {
  /** Search words and hashtags from the project's description, and trends on its topic. */
  ideas: XKeywordIdea[]
  /** The look-up of the accounts the AI named, which shows them once it has seen they exist; null when it named none. */
  lookupJobId: string | null
  /** Why the accounts could not be looked up, or "". */
  lookupRefused: string
  /** Where the trends were read for, and when, or null before any read. */
  trends: { place: string; readAt: Date } | null
}

const ideasFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, existing: z.array(z.string().max(220)).max(200) }))
  .handler(async ({ context, data }): Promise<XIdeas> => {
    const userId = context.user.id
    const ideas = await xKeywordIdeas(userId, data)
    const handles = ideas.filter((idea) => idea.kind === "account").map((idea) => idea.value)
    let lookupJobId: string | null = null
    let lookupRefused = ""
    // A look-up costs a search account about 20 views an account, so a second press never queues another.
    const [waiting] = handles.length
      ? await db
          .select({ id: promoJobs.id })
          .from(promoJobs)
          .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "x_lookup"), inArray(promoJobs.status, ["queued", "running"])))
          .limit(1)
      : []
    if (waiting) {
      lookupRefused = "An earlier look-up is still waiting. Press Ideas again once it has finished."
    } else if (handles.length) {
      try {
        lookupJobId = await queueJob(userId, "x_lookup", { handles: handles.slice(0, 8) })
      } catch (error) {
        if (!(error instanceof Refusal)) throw error
        lookupRefused = error.message
      }
    }
    const last = await lastXTrends(userId)
    const trending = last ? await xTrendIdeas(userId, { projectId: data.projectId, trends: last.trends.map((trend) => trend.name) }) : []
    return {
      ideas: [...ideas.filter((idea) => idea.kind !== "account"), ...trending],
      lookupJobId,
      lookupRefused,
      trends: last ? { place: last.place, readAt: last.readAt } : null,
    }
  })

/** Search words, hashtags and accounts worth trying, and trends on the project's topic (parts 14 and 15). */
export function askXKeywordIdeas(projectId: string, existing: string[]) {
  return ideasFn({ data: { projectId, existing } })
}

const ideaAccountsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ jobId: id }))
  .handler(
    async ({ context, data }): Promise<{ done: boolean; error: string; found: Array<{ handle: string; name: string; followers: number | null }> }> => {
      const [job] = await db
        .select({ status: promoJobs.status, payload: promoJobs.payload, lastError: promoJobs.lastError })
        .from(promoJobs)
        .where(and(eq(promoJobs.id, data.jobId), eq(promoJobs.userId, context.user.id), eq(promoJobs.kind, "x_lookup")))
        .limit(1)
      if (!job) throw new Error("That look-up is not there any more.")
      const found = Array.isArray(job.payload.found) ? (job.payload.found as Array<{ handle: string; name: string; followers: number | null }>) : []
      // A failed look-up always says so, even when the job left no words, so
      // the screen never reads it as "none of them exist".
      const error = job.status === "failed" ? (job.lastError ? getXErrorMessage(job.lastError) : "Looking up the accounts failed. Try Ideas again.") : ""
      return { done: job.status === "done" || job.status === "failed", error, found }
    }
  )

/** The accounts the AI named that X says exist, once the look-up has run. */
export function loadXIdeaAccounts(jobId: string) {
  return ideaAccountsFn({ data: { jobId } })
}

const statusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findIds: z.array(id).min(1).max(500), status: z.enum(["new", "skipped"]) }))
  .handler(async ({ context, data }) => setXFindsStatus(context.user.id, data.findIds, data.status))

export function setXStatus(findIds: string[], status: "new" | "skipped") {
  return statusFn({ data: { findIds, status } })
}

const hideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.discriminatedUnion("change", [z.object({ change: z.literal("hide"), findId: id }), z.object({ change: z.literal("show"), hiddenId: id })]))
  .handler(async ({ context, data }): Promise<{ hiddenPosts: number; name: string } | null> => {
    if (data.change === "hide") {
      const hidden = await hideXAuthor(context.user.id, data.findId)
      return { hiddenPosts: hidden.hiddenPosts, name: hidden.name }
    }
    await unhideX(context.user.id, data.hiddenId)
    return null
  })

/** Hides the account that wrote a post, or shows a hidden one again (part 16). */
export function changeXHidden(change: { change: "hide"; findId: string } | { change: "show"; hiddenId: string }) {
  return hideFn({ data: change })
}

const readFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id }))
  .handler(async ({ context, data }): Promise<void> => {
    const find = await ownedXFind(context.user.id, data.findId)
    if (!find) throw new Error("That X post is no longer saved.")
    await queueJob(context.user.id, "x_read", { findId: find.id })
  })

/** Reads one post again with its top replies, through a search account (part 22). */
export function readXPostNow(findId: string) {
  return readFn({ data: { findId } })
}

const draftsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      findId: id,
      accountId: id.nullable(),
      helpOnly: z.boolean(),
      kind: z.enum(["reply", "quote"]),
      underReplyId: z.string().max(25).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<XDraftView[]> => writeXDrafts(context.user.id, data))

export function draftXReplies(input: { findId: string; accountId: string | null; helpOnly: boolean; kind: "reply" | "quote"; underReplyId?: string }) {
  return draftsFn({ data: input })
}

const rewriteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id, accountId: id.nullable(), text: words, how: z.enum(X_REWRITES) }))
  .handler(async ({ context, data }): Promise<XDraftView> => rewriteXReply(context.user.id, data))

export function rewriteXWords(input: { findId: string; accountId: string | null; text: string; how: XRewrite }) {
  return rewriteFn({ data: input })
}

const rulesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, text: words, communityId: z.string().max(25).optional(), isReply: z.boolean() }))
  .handler(async ({ context, data }): Promise<XRulesVerdict> => {
    await ownedProject(context.user.id, data.projectId)
    const communities = data.communityId ? await listXCommunities(context.user.id, data.projectId) : []
    const community = communities.find((row) => row.communityId === data.communityId)
    return checkXRules(context.user.id, { projectId: data.projectId, text: data.text, communityRules: community?.rules ?? "", isReply: data.isReply })
  })

/** Checks words against X's rules, and a community's when one is named. */
export function checkXWords(input: { projectId: string; text: string; communityId?: string; isReply: boolean }) {
  return rulesFn({ data: input })
}

const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      findId: id,
      accountId: id,
      text: words,
      kind: z.enum(["reply", "quote"]),
      underReplyId: z.string().max(25).optional(),
      helpOnly: z.boolean().optional(),
      draftId: id.nullable().optional(),
    })
  )
  .handler(async ({ context, data }): Promise<QueuedXReply> => queueXReply(context.user.id, data))

/** Post on a reply or a quote: every check, then ten seconds to take it back. */
export function sendXReply(input: {
  findId: string
  accountId: string
  text: string
  kind: "reply" | "quote"
  underReplyId?: string
  helpOnly?: boolean
  draftId?: string | null
}) {
  return sendFn({ data: input })
}

const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ replyId: id }))
  .handler(async ({ context, data }): Promise<void> => cancelXReply(context.user.id, data.replyId))

export function takeBackXReply(replyId: string) {
  return cancelFn({ data: { replyId } })
}

const under = z.union([z.object({ replyId: id }), z.object({ postRowId: id }), z.object({ mentionId: id })])

const answerDraftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, accountId: id, mine: words, theirs: words, author: z.string().max(40) }))
  .handler(async ({ context, data }): Promise<string> => writeXAnswer(context.user.id, data))

export function draftXAnswer(input: { projectId: string; accountId: string; mine: string; theirs: string; author: string }) {
  return answerDraftFn({ data: input })
}

const answerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ under, incomingId: z.string().max(25).optional(), text: words }))
  .handler(async ({ context, data }): Promise<QueuedXReply> => queueXAnswer(context.user.id, data))

/** Answers somebody who replied to one of ours or named the account (parts 38 and 39). */
export function sendXAnswer(input: { under: { replyId: string } | { postRowId: string } | { mentionId: string }; incomingId?: string; text: string }) {
  return answerFn({ data: input })
}

const checkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ replyIds: z.array(id).max(50).optional(), postIds: z.array(id).max(50).optional() }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({
    queued: await queueXChecks(context.user.id, { replyIds: data.replyIds ?? [], postIds: data.postIds ?? [] }),
  }))

/** Reads sent replies or posts again now. */
export function checkXNow(input: { replyIds?: string[]; postIds?: string[] }) {
  return checkFn({ data: input })
}

const changeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ replyId: id.optional(), postRowId: id.optional(), action: z.enum(["edit", "delete"]), text: words.optional() }))
  .handler(async ({ context, data }): Promise<{ jobId: string; similarTo: string }> => queueXChange(context.user.id, data))

/** Edits (paid accounts, within the hour) or deletes a reply or post on X (part 40). */
export function changeOnX(input: { replyId?: string; postRowId?: string; action: "edit" | "delete"; text?: string }) {
  return changeFn({ data: input })
}

const failedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ replyId: id, action: z.enum(["retry", "dismiss"]) }))
  .handler(async ({ context, data }): Promise<QueuedXReply | null> => {
    if (data.action === "dismiss") {
      await dismissFailedXReply(context.user.id, data.replyId)
      return null
    }
    return retryFailedXReply(context.user.id, data.replyId)
  })

/** Try again on a failed reply, or take it off the Failed list. */
export function dealWithFailedXReply(replyId: string, action: "retry" | "dismiss") {
  return failedFn({ data: { replyId, action } })
}

const pieceShape = z.object({ text: z.string().max(30_000), pictureUrl: z.string().max(2_048) })
const postShape = z.object({
  accountId: id.nullable(),
  pieces: z.array(pieceShape).min(1).max(MAX_THREAD_PIECES),
  poll: z.object({ choices: z.array(z.string().max(100)).max(POLL_CHOICES.max), minutes: z.number().int() }).nullable(),
  communityId: z.string().max(25),
  source: z.string().max(80),
  scheduledFor: z.string().datetime().nullable(),
})

const savePostFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, postRowId: id.nullable(), post: postShape }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await saveXPost(context.user.id, data.projectId, data.postRowId, {
      ...data.post,
      scheduledFor: data.post.scheduledFor ? new Date(data.post.scheduledFor) : null,
    }),
  }))

/** Saves a draft post or thread of your own, new or changed. */
export function saveXPostDraft(input: {
  projectId: string
  postRowId: string | null
  post: {
    accountId: string | null
    pieces: Array<{ text: string; pictureUrl: string }>
    poll: { choices: string[]; minutes: number } | null
    communityId: string
    source: string
    scheduledFor: string | null
  }
}) {
  return savePostFn({ data: input })
}

const postActionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ postRowId: id, action: z.enum(["publish", "cancel", "delete_draft"]) }))
  .handler(async ({ context, data }): Promise<QueuedXPost | null> => {
    const userId = context.user.id
    // Try again on a thread that stopped halfway is Post again: it sends only the pieces still missing.
    if (data.action === "publish") return queueXPublish(userId, data.postRowId)
    if (data.action === "cancel") await cancelXPublish(userId, data.postRowId)
    else await deleteXDraftPost(userId, data.postRowId)
    return null
  })

/** Post, take back, try again, or delete a draft that never went out. */
export function actOnXPost(postRowId: string, action: "publish" | "cancel" | "delete_draft") {
  return postActionFn({ data: { postRowId, action } })
}

const writePostFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      accountId: id.nullable(),
      about: z.string().max(2_000),
      pieces: z.number().int().min(1).max(MAX_THREAD_PIECES),
      source: z.string().max(80),
      communityId: z.string().max(25),
      poll: z.boolean(),
    })
  )
  .handler(async ({ context, data }): Promise<WrittenXPost> => {
    const userId = context.user.id
    const sources = data.source ? await xPostSources(userId, data.projectId) : []
    const from = sources.find((item) => item.source === data.source)
    if (data.source && !from) throw new Refusal("That piece to start from is not there any more.")
    const communities = data.communityId ? await listXCommunities(userId, data.projectId) : []
    const community = communities.find((row) => row.communityId === data.communityId)
    return writeXPost(userId, {
      projectId: data.projectId,
      accountId: data.accountId,
      about: data.about,
      pieces: data.pieces,
      source: from?.text ?? "",
      endLink: from?.endLink ?? "",
      communityRules: community?.rules ?? "",
      poll: data.poll,
    })
  })

/** The AI writes a post or thread in the account's voice (parts 29, 32 and 33). */
export function writeXPostWords(input: {
  projectId: string
  accountId: string | null
  about: string
  pieces: number
  source: string
  communityId: string
  poll: boolean
}) {
  return writePostFn({ data: input })
}

const communityFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("change", [
      z.object({ change: z.literal("add"), projectId: id, address: z.string().min(1).max(300) }),
      z.object({ change: z.literal("read"), communityRowId: id }),
      z.object({ change: z.literal("rules"), communityRowId: id, rules: z.string().max(8_000) }),
      z.object({ change: z.literal("remove"), communityRowId: id }),
    ])
  )
  .handler(async ({ context, data }): Promise<{ readRefused: string | null } | null> => {
    const userId = context.user.id
    if (data.change === "add") {
      const added = await addXCommunity(userId, data.projectId, data.address)
      return { readRefused: added.readRefused }
    }
    if (data.change === "read") await queueXCommunityRead(userId, data.communityRowId)
    else if (data.change === "rules") await saveXCommunityRules(userId, data.communityRowId, data.rules)
    else await removeXCommunity(userId, data.communityRowId)
    return null
  })

/** Adds a community by its address, reads its rules again, writes rules by hand, or takes it off (part 35). */
export function changeXCommunity(
  change:
    | { change: "add"; projectId: string; address: string }
    | { change: "read"; communityRowId: string }
    | { change: "rules"; communityRowId: string; rules: string }
    | { change: "remove"; communityRowId: string }
) {
  return communityFn({ data: change })
}

const listFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, findId: id }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({ id: await queueXListAdd(context.user.id, data) }))

/** Puts the poster of a found post on the account's public X list (part 36). */
export function addToXList(input: { accountId: string; findId: string }) {
  return listFn({ data: input })
}

const readingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ accountId: id }))
  .handler(async ({ context, data }): Promise<XReadingView[]> => listXReadings(context.user.id, data.accountId))

/** An X account's daily followers and views, oldest first (part 43). */
export function loadXReadings(accountId: string) {
  return readingsFn({ data: { accountId } })
}

const accountFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      accountId: id,
      paid: z.boolean().optional(),
      followBack: z.boolean().optional(),
      helpEvery: z.number().int().min(0).max(20).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<void> => {
    const updated = await db
      .update(promoAccounts)
      .set({
        ...(data.paid === undefined ? {} : { xPaid: data.paid }),
        ...(data.followBack === undefined ? {} : { xFollowBack: data.followBack }),
        ...(data.helpEvery === undefined ? {} : { xHelpEvery: data.helpEvery }),
        updatedAt: new Date(),
      })
      .where(and(eq(promoAccounts.id, data.accountId), eq(promoAccounts.userId, context.user.id), eq(promoAccounts.platform, "x")))
      .returning({ id: promoAccounts.id })
    if (!updated.length) throw new Error("That is not one of your X accounts.")
  })

/** An X account's own switches: paid (part 27), follow the people it replies to (part 44), and every how-many-th reply starts as Help only (part 24). */
export function setXAccount(input: { accountId: string; paid?: boolean; followBack?: boolean; helpEvery?: number }) {
  return accountFn({ data: input })
}

const accountActionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, action: z.enum(["code", "look"]) }))
  .handler(async ({ context, data }): Promise<void> => {
    const [account] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.id, data.accountId), eq(promoAccounts.userId, context.user.id), eq(promoAccounts.platform, "x")))
      .limit(1)
    if (!account) throw new Error("That is not one of your X accounts.")
    if (data.action === "code") await queueJob(context.user.id, "x_code", { accountId: account.id })
    else await queueXReachLook(context.user.id, account.id)
  })

/** Types X's sign-in code in the account's browser (part 6), or takes its look from outside now (parts 42 and 43). */
export function actOnXAccount(accountId: string, action: "code" | "look") {
  return accountActionFn({ data: { accountId, action } })
}

const searchersFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ searchers: SearcherView[]; settings: XSettings }> => ({
    searchers: await listSearchers(context.user.id),
    settings: await readXSettings(context.user.id),
  }))

/** X's part of Settings → Behaviour: the search accounts and X's own numbers. */
export function loadXBehaviour() {
  return searchersFn()
}

const searcherFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.discriminatedUnion("change", [z.object({ change: z.literal("add"), profileId: id }), z.object({ change: z.literal("remove"), searcherId: id })]))
  .handler(async ({ context, data }): Promise<void> => {
    if (data.change === "add") await addSearcher(context.user.id, data.profileId)
    else await removeSearcher(context.user.id, data.searcherId)
  })

/** Makes a browser profile an X search account, or stops one searching (parts 3 and 4). */
export function changeXSearcher(change: { change: "add"; profileId: string } | { change: "remove"; searcherId: string }) {
  return searcherFn({ data: change })
}

const settingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      repliesPerDay: z.number().int(),
      repliesPerHour: z.number().int(),
      viewsPerDay: z.number().int(),
      followsPerDay: z.number().int(),
    })
  )
  .handler(async ({ context, data }): Promise<XSettings> => saveXSettings(context.user.id, data))

/** Saves X's numbers in Settings → Behaviour. */
export function saveXBehaviour(input: XSettings) {
  return settingsFn({ data: input })
}
