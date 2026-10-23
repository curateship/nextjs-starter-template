import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { Refusal } from "@/server/browser/refusal"
import { db } from "@/server/db"
import { queueJob } from "@/server/social/jobs"
import { ownedProject } from "@/server/social/projects"
import { promoAccounts, promoJobs } from "@/server/social/schema"
import {
  dismissFailedLinkedinComment,
  listLinkedinComments,
  ownedLinkedinComment,
  queueLinkedinChange,
  queueLinkedinChecks,
  retryFailedLinkedinComment,
  setLinkedinNotExample,
  type LinkedinCommentView,
} from "@/server/social/linkedin/comments"
import {
  checkLinkedinRules,
  linkedinKeywordIdeas,
  linkedinPostIdeas,
  rewriteLinkedinComment,
  writeConnectNote,
  writeLinkedinAnswer,
  writeLinkedinDrafts,
  writeLinkedinNewsletter,
  writeLinkedinPost,
  type LinkedinDraftView,
  type LinkedinKeywordIdea,
  type LinkedinPostIdea,
  type LinkedinRulesVerdict,
  type WrittenLinkedinPost,
} from "@/server/social/linkedin/drafts"
import { hideLinkedinAuthor, listLinkedinFinds, ownedLinkedinFind, setLinkedinFindsStatus, unhideLinkedin, type LinkedinFindView } from "@/server/social/linkedin/finds"
import {
  addLinkedinGroup,
  listLinkedinGroups,
  queueLinkedinGroupRead,
  removeLinkedinGroup,
  saveLinkedinGroupRules,
  type LinkedinGroupView,
} from "@/server/social/linkedin/groups"
import {
  addLinkedinKeyword,
  deleteLinkedinKeyword,
  queueLinkedinSearch,
  queueProjectLinkedinSearches,
  saveBuyerTitles,
  setLinkedinKeyword,
} from "@/server/social/linkedin/keywords"
import {
  readLinkedinFindDetail,
  readLinkedinModuleView,
  readLinkedinToday,
  type LinkedinFindDetail,
  type LinkedinModuleView,
  type LinkedinToday,
} from "@/server/social/linkedin/module"
import {
  acceptLinkedinInvites,
  queueLinkedinConnect,
  queueLinkedinPeopleRead,
  readLinkedinPeople,
  type LinkedinPeople,
  type QueuedConnect,
} from "@/server/social/linkedin/people"
import { cancelLinkedinComment, queueLinkedinAnswer, queueLinkedinComment, type QueuedLinkedinComment } from "@/server/social/linkedin/posting"
import {
  cancelLinkedinPublish,
  deleteLinkedinDraftPost,
  linkedinPostSources,
  listLinkedinPosts,
  queueLinkedinPublish,
  saveLinkedinPost,
  type LinkedinPostSource,
  type LinkedinPostView,
  type QueuedLinkedinPost,
} from "@/server/social/linkedin/posts"
import { listLinkedinReadings, queueLinkedinSeenLook, type LinkedinReadingView } from "@/server/social/linkedin/reach"
import { queueLinkedinCode } from "@/server/social/linkedin/run"
import { promoLinkedinViewers } from "@/server/social/linkedin/schema"
import {
  addLinkedinSearcher,
  listLinkedinSearchers,
  readLinkedinSettings,
  removeLinkedinSearcher,
  saveLinkedinSettings,
  type LinkedinSearcherView,
  type LinkedinSettings,
} from "@/server/social/linkedin/searchers"
import {
  BUYER_TITLE_CHARS,
  LINKEDIN_KEYWORD_KINDS,
  LINKEDIN_KEYWORD_MARKS,
  LINKEDIN_POST_KINDS,
  LINKEDIN_REWRITES,
  MAX_BUYER_TITLES,
  MAX_LINKEDIN_KEYWORD_CHARS,
  type LinkedinKeywordKind,
  type LinkedinKeywordMark,
  type LinkedinPostKind,
  type LinkedinRewrite,
  type LinkedinTag,
} from "@/lib/social/linkedin/options"

import { describeAuthError } from "../error-message"

export type {
  LinkedinCommentView,
  LinkedinDraftView,
  LinkedinFindDetail,
  LinkedinFindView,
  LinkedinGroupView,
  LinkedinKeywordIdea,
  LinkedinModuleView,
  LinkedinPeople,
  LinkedinPostIdea,
  LinkedinPostSource,
  LinkedinPostView,
  LinkedinReadingView,
  LinkedinRulesVerdict,
  LinkedinSearcherView,
  LinkedinSettings,
  LinkedinToday,
  QueuedConnect,
  QueuedLinkedinComment,
  QueuedLinkedinPost,
  WrittenLinkedinPost,
}

/**
 * LinkedIn's endpoints (`workspace/tasks/LinkedIn/01-linkedin-features.md`).
 * Admin only, like every Promo endpoint, and the owner's alone: a guest sent
 * from Project does not work LinkedIn.
 *
 * Drafting, rewriting, notes and the rules check happen in the request,
 * because an AI call takes seconds and the person is watching the box.
 * Searching, reading, sending, posting, connecting and checking go on the
 * queue, because they need a browser or a phone.
 */

/**
 * LinkedIn's refusals are written for the reader, naming the account, the
 * post or the limit, so they pass through as they are. Only a database or
 * network failure, which says nothing a person can act on, is swapped for a
 * plain sentence.
 */
const NOT_FOR_READERS = ["violates", "duplicate key", "relation \"", "column \"", "Failed query", "ECONN", "fetch failed", "Unexpected token", "undefined"]

export function getLinkedinErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (message.includes("AI_LIMIT_REACHED")) return "This month's AI allowance is used up."
  const auth = describeAuthError(message)
  if (auth) return auth
  if (!message || NOT_FOR_READERS.some((words) => message.includes(words))) return "That did not work. Please try again."
  return message
}

const id = z.string().min(1).max(64)
const tab = z.enum(["new", "commented", "skipped"])
const words = z.string().max(25_000)
const linkedinId = z.string().max(40)

const moduleFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<LinkedinModuleView> => readLinkedinModuleView(context.user.id, data.projectId))

/** The LinkedIn module's accounts, keywords, buyer titles, groups, counts, search accounts and spend. */
export function loadLinkedinModule(projectId: string) {
  return moduleFn({ data: { projectId } })
}

const findsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id, keywordId: id.nullable(), tab, search: z.string().max(200).optional() }))
  .handler(async ({ context, data }): Promise<LinkedinFindView[]> => listLinkedinFinds(context.user.id, data))

/** One tab of posts, under one keyword or every one. */
export function loadLinkedinFinds(query: { projectId: string; keywordId: string | null; tab: "new" | "commented" | "skipped"; search?: string }) {
  return findsFn({ data: query })
}

const detailFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ findId: id, accountId: id.nullable() }))
  .handler(async ({ context, data }): Promise<LinkedinFindDetail> => readLinkedinFindDetail(context.user.id, data.findId, data.accountId))

/** One post for the right column, with what the picked account said before on posts like it. */
export function loadLinkedinFindDetail(findId: string, accountId: string | null) {
  return detailFn({ data: { findId, accountId } })
}

const todayFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<LinkedinToday> => readLinkedinToday(context.user.id, data.projectId))

export function loadLinkedinToday(projectId: string) {
  return todayFn({ data: { projectId } })
}

const commentsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id, list: z.enum(["sent", "failed"]) }))
  .handler(async ({ context, data }): Promise<LinkedinCommentView[]> => {
    await ownedProject(context.user.id, data.projectId)
    return listLinkedinComments(context.user.id, data.projectId, data.list)
  })

/** The Comments tab: what was sent, or what failed. */
export function loadLinkedinComments(projectId: string, list: "sent" | "failed") {
  return commentsFn({ data: { projectId, list } })
}

export type LinkedinPostsTab = { posts: LinkedinPostView[]; sources: LinkedinPostSource[] }

const postsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<LinkedinPostsTab> => ({
    posts: await listLinkedinPosts(context.user.id, data.projectId),
    sources: await linkedinPostSources(context.user.id, data.projectId),
  }))

/** The Posts tab: posts, reposts and newsletter issues of your own, and what one can start from. */
export function loadLinkedinPosts(projectId: string) {
  return postsFn({ data: { projectId } })
}

const peopleFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<LinkedinPeople> => readLinkedinPeople(context.user.id, data.projectId))

/** The People tab: requests waiting, profile viewers and requests sent. */
export function loadLinkedinPeople(projectId: string) {
  return peopleFn({ data: { projectId } })
}

const keywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      kind: z.enum(LINKEDIN_KEYWORD_KINDS),
      value: z.string().min(1).max(MAX_LINKEDIN_KEYWORD_CHARS * 2),
      mark: z.enum(LINKEDIN_KEYWORD_MARKS).optional(),
    })
  )
  .handler(async ({ context, data }) => addLinkedinKeyword(context.user.id, data.projectId, data))

/** Saves a LinkedIn keyword and searches it. `searchRefused` says why its first search could not be queued. */
export function saveLinkedinKeyword(input: { projectId: string; kind: LinkedinKeywordKind; value: string; mark?: LinkedinKeywordMark }) {
  return keywordFn({ data: input })
}

const keywordChangeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("change", [
      z.object({ change: z.literal("delete"), keywordId: id }),
      z.object({ change: z.literal("enabled"), keywordId: id, enabled: z.boolean() }),
      z.object({ change: z.literal("notify"), keywordId: id, notify: z.boolean() }),
      z.object({ change: z.literal("mark"), keywordId: id, mark: z.enum(LINKEDIN_KEYWORD_MARKS) }),
      z.object({ change: z.literal("search"), keywordId: id }),
    ])
  )
  .handler(async ({ context, data }): Promise<void> => {
    if (data.change === "delete") await deleteLinkedinKeyword(context.user.id, data.keywordId)
    else if (data.change === "enabled") await setLinkedinKeyword(context.user.id, data.keywordId, { enabled: data.enabled })
    else if (data.change === "notify") await setLinkedinKeyword(context.user.id, data.keywordId, { notify: data.notify })
    else if (data.change === "mark") await setLinkedinKeyword(context.user.id, data.keywordId, { mark: data.mark })
    else await queueLinkedinSearch(context.user.id, data.keywordId)
  })

/** Removes, switches, rings, marks or searches one LinkedIn keyword. */
export function changeLinkedinKeyword(
  change:
    | { change: "delete"; keywordId: string }
    | { change: "enabled"; keywordId: string; enabled: boolean }
    | { change: "notify"; keywordId: string; notify: boolean }
    | { change: "mark"; keywordId: string; mark: LinkedinKeywordMark }
    | { change: "search"; keywordId: string }
) {
  return keywordChangeFn({ data: change })
}

const searchAllFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({ queued: await queueProjectLinkedinSearches(context.user.id, data.projectId) }))

/** Searches every switched-on LinkedIn keyword of the project. */
export function searchAllLinkedin(projectId: string) {
  return searchAllFn({ data: { projectId } })
}

const buyersFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, titles: z.array(z.string().max(BUYER_TITLE_CHARS * 2)).max(MAX_BUYER_TITLES * 2) }))
  .handler(async ({ context, data }): Promise<string[]> => saveBuyerTitles(context.user.id, data.projectId, data.titles))

/** Saves the job titles the project sells to (part 14). */
export function saveLinkedinBuyerTitles(projectId: string, titles: string[]) {
  return buyersFn({ data: { projectId, titles } })
}

export type LinkedinIdeas = {
  /** Search words and hashtags from the project's description. */
  ideas: LinkedinKeywordIdea[]
  /** The look-up of the people and pages the AI named, which shows them once it has seen they exist; null when it named none. */
  lookupJobId: string | null
  /** Why they could not be looked up, or "". */
  lookupRefused: string
}

const ideasFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, existing: z.array(z.string().max(220)).max(200) }))
  .handler(async ({ context, data }): Promise<LinkedinIdeas> => {
    const userId = context.user.id
    const ideas = await linkedinKeywordIdeas(userId, data)
    const people = ideas.filter((idea) => idea.kind === "person").map((idea) => idea.value)
    const companies = ideas.filter((idea) => idea.kind === "company").map((idea) => idea.value)
    let lookupJobId: string | null = null
    let lookupRefused = ""
    // A look-up costs a search account views, so a second press never queues another.
    const [waiting] =
      people.length || companies.length
        ? await db
            .select({ id: promoJobs.id })
            .from(promoJobs)
            .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "linkedin_lookup"), inArray(promoJobs.status, ["queued", "running"])))
            .limit(1)
        : []
    if (waiting) {
      lookupRefused = "An earlier look-up is still waiting. Press Ideas again once it has finished."
    } else if (people.length || companies.length) {
      try {
        lookupJobId = await queueJob(userId, "linkedin_lookup", { people: people.slice(0, 6), companies: companies.slice(0, 4) })
      } catch (error) {
        if (!(error instanceof Refusal)) throw error
        lookupRefused = error.message
      }
    }
    return { ideas: ideas.filter((idea) => idea.kind === "search" || idea.kind === "hashtag"), lookupJobId, lookupRefused }
  })

/** Search words, hashtags, people and pages worth trying (part 16). */
export function askLinkedinKeywordIdeas(projectId: string, existing: string[]) {
  return ideasFn({ data: { projectId, existing } })
}

export type LinkedinFoundPerson = { kind: "person" | "company"; slug: string; name: string; headline: string; followers: number | null }

const ideaPeopleFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ jobId: id }))
  .handler(async ({ context, data }): Promise<{ done: boolean; error: string; found: LinkedinFoundPerson[] }> => {
    const [job] = await db
      .select({ status: promoJobs.status, payload: promoJobs.payload, lastError: promoJobs.lastError })
      .from(promoJobs)
      .where(and(eq(promoJobs.id, data.jobId), eq(promoJobs.userId, context.user.id), eq(promoJobs.kind, "linkedin_lookup")))
      .limit(1)
    if (!job) throw new Error("That look-up is not there any more.")
    const found = Array.isArray(job.payload.found) ? (job.payload.found as LinkedinFoundPerson[]) : []
    // A failed look-up always says so, so the screen never reads it as "none of them exist".
    const error = job.status === "failed" ? (job.lastError ? getLinkedinErrorMessage(job.lastError) : "Looking them up failed. Try Ideas again.") : ""
    return { done: job.status === "done" || job.status === "failed", error, found }
  })

/** The people and pages the AI named that LinkedIn says exist, once the look-up has run. */
export function loadLinkedinIdeaPeople(jobId: string) {
  return ideaPeopleFn({ data: { jobId } })
}

const statusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findIds: z.array(id).min(1).max(500), status: z.enum(["new", "skipped"]) }))
  .handler(async ({ context, data }) => setLinkedinFindsStatus(context.user.id, data.findIds, data.status))

export function setLinkedinStatus(findIds: string[], status: "new" | "skipped") {
  return statusFn({ data: { findIds, status } })
}

const hideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.discriminatedUnion("change", [z.object({ change: z.literal("hide"), findId: id }), z.object({ change: z.literal("show"), hiddenId: id })]))
  .handler(async ({ context, data }): Promise<{ hiddenPosts: number; name: string } | null> => {
    if (data.change === "hide") return hideLinkedinAuthor(context.user.id, data.findId)
    await unhideLinkedin(context.user.id, data.hiddenId)
    return null
  })

/** Hides the person or page that wrote a post, or shows a hidden one again (part 17). */
export function changeLinkedinHidden(change: { change: "hide"; findId: string } | { change: "show"; hiddenId: string }) {
  return hideFn({ data: change })
}

const readFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id }))
  .handler(async ({ context, data }): Promise<void> => {
    const find = await ownedLinkedinFind(context.user.id, data.findId)
    if (!find) throw new Error("That LinkedIn post is no longer saved.")
    await queueJob(context.user.id, "linkedin_read", { findId: find.id })
  })

/** Reads one post again with its top comments, through a search account (part 22). */
export function readLinkedinPostNow(findId: string) {
  return readFn({ data: { findId } })
}

const draftsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id, accountId: id.nullable(), helpOnly: z.boolean(), underCommentId: linkedinId.optional(), asPage: z.string().max(200).optional() }))
  .handler(async ({ context, data }): Promise<LinkedinDraftView[]> => writeLinkedinDrafts(context.user.id, data))

export function draftLinkedinComments(input: { findId: string; accountId: string | null; helpOnly: boolean; underCommentId?: string; asPage?: string }) {
  return draftsFn({ data: input })
}

const rewriteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id, text: words, how: z.enum(LINKEDIN_REWRITES) }))
  .handler(async ({ context, data }): Promise<LinkedinDraftView> => rewriteLinkedinComment(context.user.id, data))

export function rewriteLinkedinWords(input: { findId: string; text: string; how: LinkedinRewrite }) {
  return rewriteFn({ data: input })
}

const rulesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, text: words, groupId: z.string().max(20).optional(), isComment: z.boolean() }))
  .handler(async ({ context, data }): Promise<LinkedinRulesVerdict> => {
    await ownedProject(context.user.id, data.projectId)
    const groups = data.groupId ? await listLinkedinGroups(context.user.id, data.projectId) : []
    const group = groups.find((row) => row.groupId === data.groupId)
    return checkLinkedinRules(context.user.id, { projectId: data.projectId, text: data.text, groupRules: group?.rules ?? "", isComment: data.isComment })
  })

/** Checks words against LinkedIn's rules, and a group's when one is named. */
export function checkLinkedinWords(input: { projectId: string; text: string; groupId?: string; isComment: boolean }) {
  return rulesFn({ data: input })
}

const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      findId: id,
      accountId: id,
      text: words,
      underCommentId: linkedinId.optional(),
      helpOnly: z.boolean().optional(),
      asPageId: z.string().max(30).optional(),
      draftId: id.nullable().optional(),
    })
  )
  .handler(async ({ context, data }): Promise<QueuedLinkedinComment> => queueLinkedinComment(context.user.id, data))

/** Post on a comment: every check, then ten seconds to take it back. */
export function sendLinkedinComment(input: {
  findId: string
  accountId: string
  text: string
  underCommentId?: string
  helpOnly?: boolean
  asPageId?: string
  draftId?: string | null
}) {
  return sendFn({ data: input })
}

const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentRowId: id }))
  .handler(async ({ context, data }): Promise<void> => cancelLinkedinComment(context.user.id, data.commentRowId))

export function takeBackLinkedinComment(commentRowId: string) {
  return cancelFn({ data: { commentRowId } })
}

const answerDraftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, accountId: id, mine: words, theirs: words, author: z.string().max(200) }))
  .handler(async ({ context, data }): Promise<string> => writeLinkedinAnswer(context.user.id, data))

export function draftLinkedinAnswer(input: { projectId: string; accountId: string; mine: string; theirs: string; author: string }) {
  return answerDraftFn({ data: input })
}

const answerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      under: z.union([z.object({ commentRowId: id }), z.object({ postRowId: id })]),
      incomingId: linkedinId,
      text: words,
    })
  )
  .handler(async ({ context, data }): Promise<QueuedLinkedinComment> => queueLinkedinAnswer(context.user.id, data))

/** Sends an answer to somebody who replied to one of the account's comments or posts (part 44). */
export function sendLinkedinAnswer(input: { under: { commentRowId: string } | { postRowId: string }; incomingId: string; text: string }) {
  return answerFn({ data: input })
}

const checkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentRowIds: z.array(id).max(50).optional(), postRowIds: z.array(id).max(50).optional() }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({ queued: await queueLinkedinChecks(context.user.id, data) }))

/** Reads sent comments or posts again now, through a search account. */
export function checkLinkedinNow(input: { commentRowIds?: string[]; postRowIds?: string[] }) {
  return checkFn({ data: input })
}

const changeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentRowId: id.optional(), postRowId: id.optional(), action: z.enum(["edit", "delete"]), text: words.optional() }))
  .handler(async ({ context, data }): Promise<{ jobId: string; similarTo: string }> => queueLinkedinChange(context.user.id, data))

/** Edits or deletes a sent comment or post on LinkedIn (part 45). */
export function changeOnLinkedin(input: { commentRowId?: string; postRowId?: string; action: "edit" | "delete"; text?: string }) {
  return changeFn({ data: input })
}

const failedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentRowId: id, action: z.enum(["retry", "dismiss"]) }))
  .handler(async ({ context, data }): Promise<QueuedLinkedinComment | null> => {
    if (data.action === "dismiss") {
      await dismissFailedLinkedinComment(context.user.id, data.commentRowId)
      return null
    }
    return retryFailedLinkedinComment(context.user.id, data.commentRowId)
  })

/** Try again or Dismiss on the Failed list (part 43). */
export function dealWithFailedLinkedinComment(commentRowId: string, action: "retry" | "dismiss") {
  return failedFn({ data: { commentRowId, action } })
}

const exampleFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentRowId: id, notExample: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> => setLinkedinNotExample(context.user.id, data.commentRowId, data.notExample))

/** Keeps a sent comment out of the AI's examples, or lets it back in (part 24). */
export function setLinkedinCommentExample(commentRowId: string, notExample: boolean) {
  return exampleFn({ data: { commentRowId, notExample } })
}

const pollShape = z.object({ question: z.string().max(400), choices: z.array(z.string().max(100)).max(6), days: z.number().int() })
const tagShape = z.object({ name: z.string().max(200), slug: z.string().max(300), kind: z.enum(["person", "company"]) })

const savePostFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      postRowId: id.nullable(),
      accountId: id.nullable(),
      kind: z.enum(LINKEDIN_POST_KINDS),
      text: words,
      title: z.string().max(400),
      pictureUrl: z.string().max(2_048),
      videoUrl: z.string().max(2_048),
      poll: pollShape.nullable(),
      tags: z.array(tagShape).max(20),
      repostFindId: id.nullable(),
      groupId: z.string().max(20),
      asPageId: z.string().max(30),
      source: z.string().max(80),
      scheduledFor: z.string().datetime().nullable(),
    })
  )
  .handler(async ({ context, data }): Promise<{ postRowId: string }> => ({
    postRowId: await saveLinkedinPost(context.user.id, data.projectId, data.postRowId, {
      ...data,
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
    }),
  }))

/** Saves a draft post, repost or newsletter issue, or changes one that has not gone out. */
export function saveLinkedinPostDraft(input: {
  projectId: string
  postRowId: string | null
  accountId: string | null
  kind: LinkedinPostKind
  text: string
  title: string
  pictureUrl: string
  videoUrl: string
  poll: { question: string; choices: string[]; days: number } | null
  tags: LinkedinTag[]
  repostFindId: string | null
  groupId: string
  asPageId: string
  source: string
  scheduledFor: string | null
}) {
  return savePostFn({ data: input })
}

const postActionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ postRowId: id, action: z.enum(["publish", "cancel", "delete_draft"]) }))
  .handler(async ({ context, data }): Promise<QueuedLinkedinPost | null> => {
    if (data.action === "publish") return queueLinkedinPublish(context.user.id, data.postRowId)
    if (data.action === "cancel") await cancelLinkedinPublish(context.user.id, data.postRowId)
    else await deleteLinkedinDraftPost(context.user.id, data.postRowId)
    return null
  })

/** Post, take back, or delete a draft. */
export function actOnLinkedinPost(postRowId: string, action: "publish" | "cancel" | "delete_draft") {
  return postActionFn({ data: { postRowId, action } })
}

const writePostFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      accountId: id.nullable(),
      about: z.string().max(2_000),
      source: words,
      repostFindId: id.nullable(),
      groupId: z.string().max(20),
      poll: z.boolean(),
      asPage: z.string().max(200),
    })
  )
  .handler(async ({ context, data }): Promise<WrittenLinkedinPost> => {
    const userId = context.user.id
    const find = data.repostFindId ? await ownedLinkedinFind(userId, data.repostFindId) : null
    const groups = data.groupId ? await listLinkedinGroups(userId, data.projectId) : []
    return writeLinkedinPost(userId, {
      projectId: data.projectId,
      accountId: data.accountId,
      about: data.about,
      source: data.source,
      reposting: find?.text ?? "",
      groupRules: groups.find((group) => group.groupId === data.groupId)?.rules ?? "",
      poll: data.poll,
      asPage: data.asPage,
    })
  })

/** The AI's words for a post or a repost's line, in the account's voice. Nothing is saved. */
export function writeLinkedinPostWords(input: {
  projectId: string
  accountId: string | null
  about: string
  source: string
  repostFindId: string | null
  groupId: string
  poll: boolean
  asPage: string
}) {
  return writePostFn({ data: input })
}

const newsletterFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: id, accountId: id.nullable(), about: z.string().max(2_000), source: words, outline: words, step: z.enum(["outline", "issue"]) })
  )
  .handler(async ({ context, data }): Promise<{ title: string; body: string }> => writeLinkedinNewsletter(context.user.id, data))

/** An outline, or the issue written from it, for the account's newsletter (part 36). Nothing is saved. */
export function writeLinkedinNewsletterWords(input: { projectId: string; accountId: string | null; about: string; source: string; outline: string; step: "outline" | "issue" }) {
  return newsletterFn({ data: input })
}

const postIdeasFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<LinkedinPostIdea[]> => linkedinPostIdeas(context.user.id, data.projectId))

/** Post ideas from the questions people asked in the project's LinkedIn posts (part 35). */
export function askLinkedinPostIdeas(projectId: string) {
  return postIdeasFn({ data: { projectId } })
}

const groupFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("change", [
      z.object({ change: z.literal("add"), projectId: id, address: z.string().max(400) }),
      z.object({ change: z.literal("remove"), groupRowId: id }),
      z.object({ change: z.literal("read"), groupRowId: id }),
      z.object({ change: z.literal("rules"), groupRowId: id, rules: z.string().max(10_000) }),
    ])
  )
  .handler(async ({ context, data }): Promise<{ readRefused: string | null }> => {
    const userId = context.user.id
    if (data.change === "add") return { readRefused: (await addLinkedinGroup(userId, data.projectId, data.address)).readRefused }
    if (data.change === "remove") await removeLinkedinGroup(userId, data.groupRowId)
    else if (data.change === "read") await queueLinkedinGroupRead(userId, data.groupRowId)
    else await saveLinkedinGroupRules(userId, data.groupRowId, data.rules)
    return { readRefused: null }
  })

/** Adds, removes or reads a group, or saves its rules by hand (part 37). */
export function changeLinkedinGroup(
  change:
    | { change: "add"; projectId: string; address: string }
    | { change: "remove"; groupRowId: string }
    | { change: "read"; groupRowId: string }
    | { change: "rules"; groupRowId: string; rules: string }
) {
  return groupFn({ data: change })
}

const personSource = z.union([z.object({ commentRowId: id }), z.object({ viewerId: id })])

const noteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, from: personSource }))
  .handler(async ({ context, data }): Promise<string> => {
    const userId = context.user.id
    const [account] = await db
      .select({ projectId: promoAccounts.projectId })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.id, data.accountId), eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "linkedin")))
      .limit(1)
    if (!account?.projectId) throw new Error("That is not one of your LinkedIn accounts in a project.")
    if ("commentRowId" in data.from) {
      const row = await ownedLinkedinComment(userId, data.from.commentRowId, db)
      return writeConnectNote(userId, {
        projectId: account.projectId,
        accountId: data.accountId,
        name: row.targetName,
        headline: row.replyTo?.headline ?? "",
        why: `You commented on their post: "${row.targetText.slice(0, 300)}". Your comment: "${row.text.slice(0, 300)}".`,
      })
    }
    const [viewer] = await db
      .select()
      .from(promoLinkedinViewers)
      .where(and(eq(promoLinkedinViewers.id, data.from.viewerId), eq(promoLinkedinViewers.userId, userId)))
      .limit(1)
    if (!viewer) throw new Error("That viewer is not saved any more.")
    return writeConnectNote(userId, {
      projectId: account.projectId,
      accountId: data.accountId,
      name: viewer.name,
      headline: viewer.headline,
      why: "They looked at your profile recently.",
    })
  })

/** The AI's short note for a connection request, to edit before Send (part 39). Nothing is sent. */
export function draftLinkedinConnectNote(input: { accountId: string; from: { commentRowId: string } | { viewerId: string } }) {
  return noteFn({ data: input })
}

const connectFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, note: z.string().max(600), from: personSource }))
  .handler(async ({ context, data }): Promise<QueuedConnect> =>
    queueLinkedinConnect(context.user.id, { accountId: data.accountId, note: data.note, ...data.from })
  )

/** Sends a connection request, with the note as edited, under the week's number (part 39). */
export function sendLinkedinConnect(input: { accountId: string; note: string; from: { commentRowId: string } | { viewerId: string } }) {
  return connectFn({ data: input })
}

const acceptFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ inviteIds: z.array(id).min(1).max(100) }))
  .handler(async ({ context, data }) => acceptLinkedinInvites(context.user.id, data.inviteIds))

/** Accepts the ticked requests, one at a time a minute or two apart (part 40). */
export function acceptLinkedinRequests(inviteIds: string[]) {
  return acceptFn({ data: { inviteIds } })
}

const peopleReadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({ queued: await queueLinkedinPeopleRead(context.user.id, data.accountId) }))

/** Reads an account's waiting requests and profile viewers now. */
export function readLinkedinPeopleNow(accountId: string) {
  return peopleReadFn({ data: { accountId } })
}

const readingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ accountId: id }))
  .handler(async ({ context, data }): Promise<LinkedinReadingView[]> => listLinkedinReadings(context.user.id, data.accountId))

/** A LinkedIn account's weekly numbers, oldest first (part 47). */
export function loadLinkedinReadings(accountId: string) {
  return readingsFn({ data: { accountId } })
}

const accountFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, premium: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> => {
    const updated = await db
      .update(promoAccounts)
      .set({ linkedinPremium: data.premium, updatedAt: new Date() })
      .where(and(eq(promoAccounts.id, data.accountId), eq(promoAccounts.userId, context.user.id), eq(promoAccounts.platform, "linkedin")))
      .returning({ id: promoAccounts.id })
    if (!updated.length) throw new Error("That is not one of your LinkedIn accounts.")
  })

/** Marks a LinkedIn account as having Premium, or not (part 8). */
export function setLinkedinAccount(input: { accountId: string; premium: boolean }) {
  return accountFn({ data: input })
}

const accountActionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.discriminatedUnion("action", [z.object({ accountId: id, action: z.literal("look") }), z.object({ accountId: id, action: z.literal("code"), code: z.string().max(20) })]))
  .handler(async ({ context, data }): Promise<void> => {
    const [account] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.id, data.accountId), eq(promoAccounts.userId, context.user.id), eq(promoAccounts.platform, "linkedin")))
      .limit(1)
    if (!account) throw new Error("That is not one of your LinkedIn accounts.")
    if (data.action === "code") await queueLinkedinCode(context.user.id, account.id, data.code)
    else await queueLinkedinSeenLook(context.user.id, account.id)
  })

/** Types the code LinkedIn emailed in the account's browser (part 4), or takes its comments look now (part 46). */
export function actOnLinkedinAccount(input: { accountId: string; action: "look" } | { accountId: string; action: "code"; code: string }) {
  return accountActionFn({ data: input })
}

const behaviourFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ searchers: LinkedinSearcherView[]; settings: LinkedinSettings }> => ({
    searchers: await listLinkedinSearchers(context.user.id),
    settings: await readLinkedinSettings(context.user.id),
  }))

/** LinkedIn's part of Settings → Behaviour: the search accounts and LinkedIn's own numbers. */
export function loadLinkedinBehaviour() {
  return behaviourFn()
}

const searcherFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.discriminatedUnion("change", [z.object({ change: z.literal("add"), profileId: id }), z.object({ change: z.literal("remove"), searcherId: id })]))
  .handler(async ({ context, data }): Promise<void> => {
    if (data.change === "add") await addLinkedinSearcher(context.user.id, data.profileId)
    else await removeLinkedinSearcher(context.user.id, data.searcherId)
  })

/** Makes a browser profile a LinkedIn search account, or stops one searching (part 3). */
export function changeLinkedinSearcher(change: { change: "add"; profileId: string } | { change: "remove"; searcherId: string }) {
  return searcherFn({ data: change })
}

const settingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentsPerDay: z.number().int(), viewsPerDay: z.number().int(), connectsPerWeek: z.number().int() }))
  .handler(async ({ context, data }): Promise<LinkedinSettings> => saveLinkedinSettings(context.user.id, data))

/** Saves LinkedIn's numbers in Settings → Behaviour. */
export function saveLinkedinBehaviour(input: LinkedinSettings) {
  return settingsFn({ data: input })
}
