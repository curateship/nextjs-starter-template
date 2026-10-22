import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { queueJob } from "@/server/social/jobs"
import {
  cancelMediumPublish,
  createMediumArticle,
  deleteMediumDraft,
  listMediumArticles,
  mediumArticleIdeas,
  queueArticleChecks,
  queueMediumPublish,
  redditCommentsWorthAnArticle,
  saveMediumArticle,
  writeMediumArticle,
  writeMediumOutline,
  type MediumArticleView,
} from "@/server/social/medium/articles"
import { makeMediumCover } from "@/server/social/medium/cover"
import {
  checkMediumRules,
  mediumKeywordIdeas,
  rewriteMediumResponse,
  writeMediumAnswer,
  writeMediumDrafts,
  type KeywordIdea,
  type MediumDraftView,
  type RulesVerdict,
} from "@/server/social/medium/drafts"
import { hideFromFind, listMediumFinds, ownedMediumFind, setMediumFindsStatus, unhide, type MediumFindView } from "@/server/social/medium/finds"
import {
  addMediumKeyword,
  deleteMediumKeyword,
  queueMediumSearch,
  queueProjectMediumSearches,
  setMediumKeywordEnabled,
  setMediumKeywordMark,
} from "@/server/social/medium/keywords"
import { listMediumListItems, queueAddToList, type ListItemView } from "@/server/social/medium/lists"
import {
  readMediumFindDetail,
  readMediumModuleView,
  readMediumToday,
  type MediumFindDetail,
  type MediumModuleView,
  type MediumToday,
} from "@/server/social/medium/module"
import { cancelMediumResponse, queueMediumAnswer, queueMediumResponse, type QueuedResponse } from "@/server/social/medium/posting"
import {
  addMediumPublication,
  listMediumPublications,
  queuePublicationChecks,
  removeMediumPublication,
  saveMediumPublicationRules,
  type MediumPublicationView,
} from "@/server/social/medium/publications"
import {
  dismissFailedResponse,
  listMediumResponses,
  queueMediumChange,
  queueResponseChecks,
  retryFailedResponse,
  type MediumResponseView,
} from "@/server/social/medium/responses"
import { queueMediumSignIn } from "@/server/social/medium/sign-in"
import { ownedProject } from "@/server/social/projects"
import {
  MAX_ARTICLE_ABOUT_CHARS,
  MAX_ARTICLE_BODY_CHARS,
  MAX_ARTICLE_SUBTITLE_CHARS,
  MAX_ARTICLE_TAGS,
  MAX_ARTICLE_TITLE_CHARS,
  MAX_MEDIUM_KEYWORD_CHARS,
  MAX_RESPONSE_CHARS,
  MEDIUM_KEYWORD_KINDS,
  MEDIUM_KEYWORD_MARKS,
  RESPONSE_REWRITES,
} from "@/lib/social/medium/options"

import { describeAuthError } from "../error-message"

export type {
  KeywordIdea,
  ListItemView,
  MediumArticleView,
  MediumDraftView,
  MediumFindDetail,
  MediumFindView,
  MediumModuleView,
  MediumPublicationView,
  MediumResponseView,
  MediumToday,
  QueuedResponse,
  RulesVerdict,
}

/**
 * Medium's endpoints (`workspace/tasks/Medium/01-medium-features.md`). Admin
 * only, like every Promo endpoint. A guest sent from Project does not work
 * Medium: that was feature 50, which was not picked, so every one of these
 * is the owner's.
 *
 * Drafting, rewriting and the rules check happen in the request, because an
 * AI call takes seconds and the person is watching the box. Searching,
 * reading, sending, publishing and checking go on the queue, because they
 * need a browser.
 */

/**
 * Medium's refusals are written for the reader, naming the account, the
 * story or the limit, so they pass through as they are. Only a database or
 * network failure, which says nothing a person can act on, is swapped for a
 * plain sentence.
 */
const NOT_FOR_READERS = ["violates", "duplicate key", "relation \"", "column \"", "Failed query", "ECONN", "fetch failed", "Unexpected token", "undefined"]

export function getMediumErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (message.includes("AI_LIMIT_REACHED")) return "This month's AI allowance is used up."
  const auth = describeAuthError(message)
  if (auth) return auth
  if (!message || NOT_FOR_READERS.some((words) => message.includes(words))) return "That did not work. Please try again."
  return message
}

const id = z.string().min(1).max(64)
const tab = z.enum(["new", "replied", "skipped"])

const moduleFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<MediumModuleView> => readMediumModuleView(context.user.id, data.projectId))

/** The Medium module's accounts, keywords, counts and spend. */
export function loadMediumModule(projectId: string) {
  return moduleFn({ data: { projectId } })
}

const findsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id, keywordId: id.nullable(), tab, search: z.string().max(200).optional() }))
  .handler(async ({ context, data }): Promise<MediumFindView[]> => listMediumFinds(context.user.id, data))

/** One tab of stories, under one keyword or every one. */
export function loadMediumFinds(query: { projectId: string; keywordId: string | null; tab: "new" | "replied" | "skipped"; search?: string }) {
  return findsFn({ data: query })
}

const detailFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ findId: id }))
  .handler(async ({ context, data }): Promise<MediumFindDetail> => readMediumFindDetail(context.user.id, data.findId))

/** One story for the right column. */
export function loadMediumFindDetail(findId: string) {
  return detailFn({ data: { findId } })
}

const todayFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<MediumToday> => readMediumToday(context.user.id, data.projectId))

export function loadMediumToday(projectId: string) {
  return todayFn({ data: { projectId } })
}

const responsesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id, list: z.enum(["sent", "failed"]) }))
  .handler(async ({ context, data }): Promise<MediumResponseView[]> => listMediumResponses(context.user.id, data.projectId, data.list))

export function loadMediumResponses(projectId: string, list: "sent" | "failed") {
  return responsesFn({ data: { projectId, list } })
}

const articlesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<{ articles: MediumArticleView[]; list: ListItemView[] }> => ({
    articles: await listMediumArticles(context.user.id, data.projectId),
    list: await listMediumListItems(context.user.id, data.projectId),
  }))

/** The Articles tab: every article with its readings, and the accounts' Medium lists. */
export function loadMediumArticles(projectId: string) {
  return articlesFn({ data: { projectId } })
}

const publicationsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<MediumPublicationView[]> => listMediumPublications(context.user.id, data.projectId))

export function loadMediumPublications(projectId: string) {
  return publicationsFn({ data: { projectId } })
}

const keywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      kind: z.enum(MEDIUM_KEYWORD_KINDS),
      value: z.string().min(1).max(MAX_MEDIUM_KEYWORD_CHARS * 2),
      mark: z.enum(MEDIUM_KEYWORD_MARKS).optional(),
    })
  )
  .handler(async ({ context, data }) => addMediumKeyword(context.user.id, data.projectId, data))

/** Saves a Medium keyword and searches it. `searchRefused` says why its first search could not be queued. */
export function saveMediumKeyword(input: { projectId: string; kind: (typeof MEDIUM_KEYWORD_KINDS)[number]; value: string; mark?: (typeof MEDIUM_KEYWORD_MARKS)[number] }) {
  return keywordFn({ data: input })
}

const keywordChangeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("change", [
      z.object({ change: z.literal("delete"), keywordId: id }),
      z.object({ change: z.literal("enabled"), keywordId: id, enabled: z.boolean() }),
      z.object({ change: z.literal("mark"), keywordId: id, mark: z.enum(MEDIUM_KEYWORD_MARKS) }),
      z.object({ change: z.literal("search"), keywordId: id }),
    ])
  )
  .handler(async ({ context, data }): Promise<void> => {
    if (data.change === "delete") await deleteMediumKeyword(context.user.id, data.keywordId)
    else if (data.change === "enabled") await setMediumKeywordEnabled(context.user.id, data.keywordId, data.enabled)
    else if (data.change === "mark") await setMediumKeywordMark(context.user.id, data.keywordId, data.mark)
    else await queueMediumSearch(context.user.id, data.keywordId)
  })

/** Removes, switches, marks or searches one Medium keyword. */
export function changeMediumKeyword(
  change:
    | { change: "delete"; keywordId: string }
    | { change: "enabled"; keywordId: string; enabled: boolean }
    | { change: "mark"; keywordId: string; mark: (typeof MEDIUM_KEYWORD_MARKS)[number] }
    | { change: "search"; keywordId: string }
) {
  return keywordChangeFn({ data: change })
}

const searchAllFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({
    queued: await queueProjectMediumSearches(context.user.id, data.projectId),
  }))

/** Searches every switched-on Medium keyword of the project. */
export function searchAllMedium(projectId: string) {
  return searchAllFn({ data: { projectId } })
}

const ideasFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, existing: z.array(z.string().max(220)).max(200) }))
  .handler(async ({ context, data }): Promise<KeywordIdea[]> => mediumKeywordIdeas(context.user.id, data))

/** Tags, search words and publications from the project's description. */
export function askMediumKeywordIdeas(projectId: string, existing: string[]) {
  return ideasFn({ data: { projectId, existing } })
}

const statusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findIds: z.array(id).min(1).max(200), status: z.enum(["new", "skipped"]) }))
  .handler(async ({ context, data }) => setMediumFindsStatus(context.user.id, data.findIds, data.status))

/** Skips stories, or puts them back on To look at. */
export function setMediumStatus(findIds: string[], status: "new" | "skipped") {
  return statusFn({ data: { findIds, status } })
}

const hideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.discriminatedUnion("change", [
    z.object({ change: z.literal("hide"), findId: id, kind: z.enum(["writer", "publication"]) }),
    z.object({ change: z.literal("show"), hiddenId: id }),
  ]))
  .handler(async ({ context, data }): Promise<{ name: string; hiddenStories: number } | null> => {
    if (data.change === "show") {
      await unhide(context.user.id, data.hiddenId)
      return null
    }
    const hidden = await hideFromFind(context.user.id, data.findId, data.kind)
    return { name: hidden.name, hiddenStories: hidden.hiddenStories }
  })

/** Hides a story's writer or publication from every list, or shows one again. */
export function changeMediumHidden(change: { change: "hide"; findId: string; kind: "writer" | "publication" } | { change: "show"; hiddenId: string }) {
  return hideFn({ data: change })
}

const readFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id }))
  .handler(async ({ context, data }): Promise<void> => {
    const find = await ownedMediumFind(context.user.id, data.findId)
    if (!find) throw new Error("That Medium story is no longer saved.")
    await queueJob(context.user.id, "medium_story", { findId: find.id })
  })

/** Reads one story in full, with its top responses, in the reader. */
export function readMediumStoryNow(findId: string) {
  return readFn({ data: { findId } })
}

const draftsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id, accountId: id.nullable(), helpOnly: z.boolean() }))
  .handler(async ({ context, data }): Promise<MediumDraftView[]> => writeMediumDrafts(context.user.id, data))

/** Two response drafts in the account's voice. Nothing is sent. */
export function draftMediumResponses(input: { findId: string; accountId: string | null; helpOnly: boolean }) {
  return draftsFn({ data: input })
}

const rewriteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: id, text: z.string().min(1).max(MAX_RESPONSE_CHARS * 2), how: z.enum(RESPONSE_REWRITES) }))
  .handler(async ({ context, data }): Promise<MediumDraftView> => rewriteMediumResponse(context.user.id, data))

export function rewriteMediumWords(input: { findId: string; text: string; how: (typeof RESPONSE_REWRITES)[number] }) {
  return rewriteFn({ data: input })
}

const rulesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, text: z.string().min(1).max(MAX_ARTICLE_BODY_CHARS), publicationSlug: z.string().max(120).optional() }))
  .handler(async ({ context, data }): Promise<RulesVerdict> => {
    // The spend is filed under the project, so it must be the person's own.
    await ownedProject(context.user.id, data.projectId)
    const publications = data.publicationSlug ? await listMediumPublications(context.user.id, data.projectId) : []
    const publication = publications.find((row) => row.slug.toLowerCase() === data.publicationSlug?.toLowerCase())
    return checkMediumRules(context.user.id, { projectId: data.projectId, text: data.text, publicationRules: publication?.rules ?? "" })
  })

/** Checks a response or an article against Medium's rules, and its publication's. */
export function checkMediumWords(input: { projectId: string; text: string; publicationSlug?: string }) {
  return rulesFn({ data: input })
}

const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      findId: id,
      accountId: id,
      text: z.string().min(1).max(MAX_RESPONSE_CHARS * 2),
      line: z.string().max(1_000).optional(),
      helpOnly: z.boolean().optional(),
      draftId: id.nullable().optional(),
    })
  )
  .handler(async ({ context, data }): Promise<QueuedResponse> => queueMediumResponse(context.user.id, data))

/** Queues a response a person pressed Post for. Ten seconds to take it back. */
export function sendMediumResponse(input: { findId: string; accountId: string; text: string; line?: string; helpOnly?: boolean; draftId?: string | null }) {
  return sendFn({ data: input })
}

const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ responseId: id }))
  .handler(async ({ context, data }): Promise<void> => cancelMediumResponse(context.user.id, data.responseId))

export function takeBackMediumResponse(responseId: string) {
  return cancelFn({ data: { responseId } })
}

const under = z.union([z.object({ responseId: id }), z.object({ articleId: id })])

const answerDraftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, accountId: id, title: z.string().max(600), mine: z.string().max(MAX_ARTICLE_BODY_CHARS), theirs: z.string().max(4_000), writer: z.string().max(120) }))
  .handler(async ({ context, data }): Promise<{ text: string }> => ({ text: await writeMediumAnswer(context.user.id, data) }))

/** A drafted answer to somebody who responded to us. Nothing is sent. */
export function draftMediumAnswer(input: { projectId: string; accountId: string; title: string; mine: string; theirs: string; writer: string }) {
  return answerDraftFn({ data: input })
}

const answerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ under, incomingId: id, text: z.string().min(1).max(MAX_RESPONSE_CHARS * 2) }))
  .handler(async ({ context, data }): Promise<QueuedResponse> => queueMediumAnswer(context.user.id, data))

/** Queues an answer a person pressed Send for. */
export function sendMediumAnswer(input: { under: { responseId: string } | { articleId: string }; incomingId: string; text: string }) {
  return answerFn({ data: input })
}

const checkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ responseIds: z.array(id).max(50).optional(), articleIds: z.array(id).max(50).optional() }))
  .handler(async ({ context, data }): Promise<{ queued: number }> => ({
    queued:
      (data.responseIds ? await queueResponseChecks(context.user.id, data.responseIds) : 0) +
      (data.articleIds ? await queueArticleChecks(context.user.id, data.articleIds) : 0),
  }))

/** Reads sent responses or articles again now. */
export function checkMediumNow(input: { responseIds?: string[]; articleIds?: string[] }) {
  return checkFn({ data: input })
}

const changeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      responseId: id.optional(),
      articleId: id.optional(),
      action: z.enum(["edit", "delete"]),
      text: z.string().max(MAX_ARTICLE_BODY_CHARS).optional(),
      title: z.string().max(MAX_ARTICLE_TITLE_CHARS).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<void> => {
    await queueMediumChange(context.user.id, data)
  })

/** Edits or deletes a sent response or a published article on Medium. */
export function changeOnMedium(input: { responseId?: string; articleId?: string; action: "edit" | "delete"; text?: string; title?: string }) {
  return changeFn({ data: input })
}

const failedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ responseId: id, action: z.enum(["retry", "dismiss"]) }))
  .handler(async ({ context, data }): Promise<QueuedResponse | null> => {
    if (data.action === "dismiss") {
      await dismissFailedResponse(context.user.id, data.responseId)
      return null
    }
    return retryFailedResponse(context.user.id, data.responseId)
  })

/** Tries a failed response again, or takes it off the Failed list. */
export function dealWithFailedResponse(responseId: string, action: "retry" | "dismiss") {
  return failedFn({ data: { responseId, action } })
}

const newArticleFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, accountId: id.nullable(), about: z.string().max(MAX_ARTICLE_ABOUT_CHARS), redditCommentId: id.optional() }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await createMediumArticle(context.user.id, data.projectId, {
      accountId: data.accountId,
      about: data.about,
      ...(data.redditCommentId ? { source: { kind: "reddit" as const, commentId: data.redditCommentId } } : {}),
    }),
  }))

/** Starts an article as a draft, from scratch or from a Reddit comment. */
export function startMediumArticle(input: { projectId: string; accountId: string | null; about: string; redditCommentId?: string }) {
  return newArticleFn({ data: input })
}

const saveArticleFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      articleId: id,
      accountId: id.nullable().optional(),
      title: z.string().max(MAX_ARTICLE_TITLE_CHARS).optional(),
      subtitle: z.string().max(MAX_ARTICLE_SUBTITLE_CHARS).optional(),
      body: z.string().max(MAX_ARTICLE_BODY_CHARS).optional(),
      tags: z.array(z.string().max(80)).max(MAX_ARTICLE_TAGS * 2).optional(),
      coverUrl: z.string().max(2048).optional(),
      publicationSlug: z.string().max(120).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<void> => {
    const { articleId, ...fields } = data
    await saveMediumArticle(context.user.id, articleId, fields)
  })

/** Saves a draft's fields as they are typed. */
export function saveMediumArticleFields(input: {
  articleId: string
  accountId?: string | null
  title?: string
  subtitle?: string
  body?: string
  tags?: string[]
  coverUrl?: string
  publicationSlug?: string
}) {
  return saveArticleFn({ data: input })
}

const articleOnly = z.object({ articleId: id })

const deleteDraftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(articleOnly)
  .handler(async ({ context, data }): Promise<void> => deleteMediumDraft(context.user.id, data.articleId))

export function deleteMediumArticleDraft(articleId: string) {
  return deleteDraftFn({ data: { articleId } })
}

const outlineFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ articleId: id, about: z.string().max(MAX_ARTICLE_ABOUT_CHARS) }))
  .handler(async ({ context, data }) => writeMediumOutline(context.user.id, data.articleId, { about: data.about }))

/** Three titles and an outline (part 27). */
export function outlineMediumArticle(articleId: string, about: string) {
  return outlineFn({ data: { articleId, about } })
}

const writeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      articleId: id,
      title: z.string().min(1).max(MAX_ARTICLE_TITLE_CHARS),
      headings: z.array(z.string().max(200)).max(10),
      about: z.string().max(MAX_ARTICLE_ABOUT_CHARS),
    })
  )
  .handler(async ({ context, data }) => writeMediumArticle(context.user.id, data.articleId, data))

/** The whole article from the picked title and headings. */
export function writeMediumArticleNow(articleId: string, input: { title: string; headings: string[]; about: string }) {
  return writeFn({ data: { articleId, ...input } })
}

const coverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(articleOnly)
  .handler(async ({ context, data }): Promise<{ coverUrl: string }> => ({ coverUrl: await makeMediumCover(context.user.id, data.articleId) }))

/** An AI cover from the title, saved to the media library (part 28). */
export function makeMediumArticleCover(articleId: string) {
  return coverFn({ data: { articleId } })
}

const publishFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(articleOnly)
  .handler(async ({ context, data }) => queueMediumPublish(context.user.id, data.articleId))

/** Queues the article for Medium because a person pressed Publish. */
export function publishMediumArticle(articleId: string) {
  return publishFn({ data: { articleId } })
}

const cancelPublishFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(articleOnly)
  .handler(async ({ context, data }): Promise<void> => cancelMediumPublish(context.user.id, data.articleId))

export function cancelMediumArticle(articleId: string) {
  return cancelPublishFn({ data: { articleId } })
}

const articleIdeasFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }) => mediumArticleIdeas(context.user.id, data.projectId))

/** Article ideas from what people keep asking (part 31). */
export function askMediumArticleIdeas(projectId: string) {
  return articleIdeasFn({ data: { projectId } })
}

const redditSourcesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }) => redditCommentsWorthAnArticle(context.user.id, data.projectId))

/** The project's Reddit comments that did best, to grow into an article (part 30). */
export function loadRedditSources(projectId: string) {
  return redditSourcesFn({ data: { projectId } })
}

const publicationFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("change", [
      z.object({ change: z.literal("add"), projectId: id, slug: z.string().min(1).max(300) }),
      z.object({ change: z.literal("remove"), publicationId: id }),
      z.object({ change: z.literal("rules"), publicationId: id, rules: z.string().max(8_000) }),
      z.object({ change: z.literal("check"), publicationId: id }),
    ])
  )
  .handler(async ({ context, data }): Promise<{ checkRefused: string | null }> => {
    const userId = context.user.id
    if (data.change === "add") return { checkRefused: (await addMediumPublication(userId, data.projectId, { slug: data.slug })).checkRefused }
    if (data.change === "remove") await removeMediumPublication(userId, data.publicationId)
    else if (data.change === "rules") await saveMediumPublicationRules(userId, data.publicationId, data.rules)
    else await queuePublicationChecks(userId, data.publicationId)
    return { checkRefused: null }
  })

/** Adds, removes, checks, or pastes the rules of a publication. */
export function changeMediumPublication(
  change:
    | { change: "add"; projectId: string; slug: string }
    | { change: "remove"; publicationId: string }
    | { change: "rules"; publicationId: string; rules: string }
    | { change: "check"; publicationId: string }
) {
  return publicationFn({ data: change })
}

const listFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, findId: id.optional(), articleId: id.optional() }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({ id: await queueAddToList(context.user.id, data) }))

/** Puts a story on the account's public Medium list (part 34). */
export function addToMediumList(input: { accountId: string; findId?: string; articleId?: string }) {
  return listFn({ data: input })
}

const signInFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id, url: z.string().min(1).max(4_000) }))
  .handler(async ({ context, data }): Promise<void> => {
    await queueMediumSignIn(context.user.id, data.accountId, data.url)
  })

/** Opens Medium's emailed sign-in link inside the account's own browser profile (part 2). */
export function pasteMediumSignInLink(accountId: string, url: string) {
  return signInFn({ data: { accountId, url } })
}
