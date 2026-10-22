import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isOwnedImageUrl } from "@/server/media/library"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import {
  MAX_ARTICLE_ABOUT_CHARS,
  MAX_ARTICLE_BODY_CHARS,
  MAX_ARTICLE_SUBTITLE_CHARS,
  MAX_ARTICLE_TAGS,
  MAX_ARTICLE_TITLE_CHARS,
  mediumTagSlug,
  type MediumArticleStatus,
  type MediumIncoming,
  type MediumOutline,
} from "@/lib/social/medium/options"
import { mediumPostingRefusal } from "@/lib/social/medium/wording"

import { askModel, pickProvider } from "../drafts"
import { queueJob } from "../jobs"
import { noticeRung, ringBell } from "../notices"
import { ownedProject, projectDescription } from "../projects"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords } from "../schema"
import { wordsForAccount } from "../voices"
import { mediumCheck, mediumPublish, mediumStats } from "./calls"
import {
  buildArticleIdeasPrompt,
  buildArticlePrompt,
  buildOutlinePrompt,
  readArticle,
  readArticleIdeas,
  readOutline,
  type ArticleIdea,
} from "./drafts"
import { readMediumPostingState, refuseOnPhone, writingAccount } from "./posting"
import { answeredIds, toAnswerCount } from "./responses"
import {
  promoMediumArticleReadings,
  promoMediumArticles,
  promoMediumFinds,
  promoMediumKeywords,
  promoMediumPublications,
  type MediumArticleRow,
} from "./schema"
import { refuseTooSimilar } from "./similar"

/**
 * Medium articles written in Promo (parts 26 to 31, 34 to 36, 39 and 40).
 *
 * Tyler's answers, 21 Oct 2026: 800 to 1,200 words; Publish puts it live on
 * Medium, in waking hours, tried once; no AI label; no limit on articles per
 * account beyond the warm-up and the young-account pace; any Medium account
 * may publish ("Any Medium account, always").
 *
 * An article starts as a draft in Promo. The AI offers three titles and an
 * outline first (part 27), then writes it from the picked ones, linking the
 * account's earlier articles on the topic (part 29). Publish is the only
 * thing that sends it.
 */

/** How many days of readings the chart draws: eight weeks. */
const CHART_DAYS = 56

/** An article is read again once this long after its last reading. */
const CHECK_EVERY_MS = 24 * 3_600_000

/** How many earlier articles the AI may link (part 29). */
const EARLIER_LINKS = 3

/** How many titles the article ideas are drawn from (part 31). */
const IDEA_TITLES = 40

export type ArticleReading = { readOn: string; views: number | null; reads: number | null; claps: number | null; responses: number | null }

export type MediumArticleView = {
  id: string
  account: { id: string; handle: string } | null
  title: string
  subtitle: string
  body: string
  tags: string[]
  coverUrl: string
  publicationSlug: string
  outline: MediumOutline | null
  source: string
  status: MediumArticleStatus
  url: string
  lastError: string
  views: number | null
  reads: number | null
  claps: number | null
  responses: number | null
  incoming: MediumIncoming[] | null
  toAnswer: number
  stillVisible: boolean | null
  numbersReadAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  publishedAt: Date | null
  /** Oldest first, one per day read, for the article's chart (part 40). */
  readings: ArticleReading[]
  mayHaveLanded: boolean
}

function view(
  row: MediumArticleRow,
  handle: string | null,
  readings: ArticleReading[],
  answered: Set<string>
): MediumArticleView {
  return {
    id: row.id,
    account: row.accountId && handle !== null ? { id: row.accountId, handle } : null,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    tags: row.tags,
    coverUrl: row.coverUrl,
    publicationSlug: row.publicationSlug,
    outline: row.outline,
    source: row.source,
    status: row.status,
    url: row.url,
    lastError: row.lastError,
    views: row.views,
    reads: row.reads,
    claps: row.claps,
    responses: row.responses,
    incoming: row.incoming,
    toAnswer: toAnswerCount(row.incoming, answered),
    stillVisible: row.stillVisible,
    numbersReadAt: row.numbersReadAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    readings,
    mayHaveLanded: row.status === "failed" && /may already be on Medium/i.test(row.lastError),
  }
}

/** The Articles tab: every article of the project, newest first, with its chart's readings. */
export async function listMediumArticles(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumArticleView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ row: promoMediumArticles, handle: promoAccounts.handle })
    .from(promoMediumArticles)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoMediumArticles.accountId))
    .where(and(eq(promoMediumArticles.userId, userId), eq(promoMediumArticles.projectId, projectId)))
    .orderBy(desc(promoMediumArticles.createdAt))
    .limit(200)
  const ids = rows.map((item) => item.row.id)
  const since = new Date(now.getTime() - CHART_DAYS * 86_400_000).toISOString().slice(0, 10)
  const readings = ids.length
    ? await db
        .select()
        .from(promoMediumArticleReadings)
        .where(and(inArray(promoMediumArticleReadings.articleId, ids), gte(promoMediumArticleReadings.readOn, since)))
        .orderBy(asc(promoMediumArticleReadings.readOn))
    : []
  const answered = await answeredIds(userId, db)
  return rows.map((item) =>
    view(
      item.row,
      item.handle,
      readings
        .filter((reading) => reading.articleId === item.row.id)
        .map(({ readOn, views, reads, claps, responses }) => ({ readOn, views, reads, claps, responses })),
      answered
    )
  )
}

/** An article of the person's, or a refusal. */
async function ownedArticle(userId: string, articleId: string, db: CustomShellDb): Promise<MediumArticleRow> {
  const [row] = await db
    .select()
    .from(promoMediumArticles)
    .where(and(eq(promoMediumArticles.id, articleId), eq(promoMediumArticles.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That article is not there any more.")
  return row
}

/** A Medium account in this project, or a refusal. Any Medium account may write an article. */
async function projectMediumAccount(userId: string, projectId: string, accountId: string, db: CustomShellDb) {
  const account = await writingAccount(userId, accountId, db)
  if (account.projectId !== projectId) throw new Refusal("That account is not in this project.")
  return account
}

/**
 * Starts a new article as a draft. `source` is where it came from: "" from
 * scratch, or a Reddit comment's words (part 30), which the outline and the
 * article grow from.
 */
export async function createMediumArticle(
  userId: string,
  projectId: string,
  input: { accountId: string | null; about: string; source?: { kind: "reddit"; commentId: string } },
  db: CustomShellDb = defaultDb
): Promise<string> {
  await ownedProject(userId, projectId, db)
  if (input.accountId) await projectMediumAccount(userId, projectId, input.accountId, db)
  const id = uuid()
  await db.insert(promoMediumArticles).values({
    id,
    userId,
    projectId,
    accountId: input.accountId,
    // What it is about starts as the working title; the outline replaces it.
    title: input.about.trim().slice(0, MAX_ARTICLE_TITLE_CHARS),
    source: input.source ? `reddit:${input.source.commentId}` : "",
  })
  return id
}

export type ArticleFields = {
  accountId?: string | null
  title?: string
  subtitle?: string
  body?: string
  tags?: string[]
  coverUrl?: string
  publicationSlug?: string
}

/** Saves a draft's fields as they are typed. A published article changes on Medium through Edit instead. */
export async function saveMediumArticle(
  userId: string,
  articleId: string,
  input: ArticleFields,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const article = await ownedArticle(userId, articleId, db)
  if (article.status !== "draft" && article.status !== "failed") {
    throw new Refusal("This article has gone to Medium. Change it there with Edit on the Articles tab.")
  }
  if (input.title !== undefined && input.title.length > MAX_ARTICLE_TITLE_CHARS) throw new Refusal(`A title stops at ${MAX_ARTICLE_TITLE_CHARS} characters.`)
  if (input.subtitle !== undefined && input.subtitle.length > MAX_ARTICLE_SUBTITLE_CHARS) throw new Refusal(`A subtitle stops at ${MAX_ARTICLE_SUBTITLE_CHARS} characters.`)
  if (input.body !== undefined && input.body.length > MAX_ARTICLE_BODY_CHARS) throw new Refusal("That is longer than an article here can be.")
  const tags = input.tags === undefined ? undefined : [...new Set(input.tags.map(mediumTagSlug).filter(Boolean))]
  if (tags && tags.length > MAX_ARTICLE_TAGS) throw new Refusal(`Medium takes ${MAX_ARTICLE_TAGS} tags at most.`)
  if (input.coverUrl && !(await isOwnedImageUrl(userId, input.coverUrl, db))) {
    throw new Refusal("That picture is not one of your uploaded images.")
  }
  if (input.publicationSlug && article.projectId) {
    const [publication] = await db
      .select({ id: promoMediumPublications.id })
      .from(promoMediumPublications)
      .where(
        and(
          eq(promoMediumPublications.projectId, article.projectId),
          sql`lower(${promoMediumPublications.slug}) = lower(${input.publicationSlug})`
        )
      )
      .limit(1)
    if (!publication) throw new Refusal("Add that publication on the Publications tab first.")
  }
  if (input.accountId && article.projectId) await projectMediumAccount(userId, article.projectId, input.accountId, db)
  await db
    .update(promoMediumArticles)
    .set({
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
      ...(input.publicationSlug !== undefined ? { publicationSlug: input.publicationSlug } : {}),
      updatedAt: new Date(),
    })
    .where(eq(promoMediumArticles.id, article.id))
}

/** Deletes a draft that never went to Medium. */
export async function deleteMediumDraft(userId: string, articleId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const article = await ownedArticle(userId, articleId, db)
  if (article.status !== "draft" && article.status !== "failed") {
    throw new Refusal("This article went to Medium. Delete it from Medium with Delete on the Articles tab.")
  }
  await db.delete(promoMediumArticles).where(eq(promoMediumArticles.id, article.id))
}

/** The Reddit comment an article grows from (part 30), checked as one of the person's that landed. */
async function redditSource(userId: string, source: string, db: CustomShellDb): Promise<{ text: string; title: string } | null> {
  if (!source.startsWith("reddit:")) return null
  const [row] = await db
    .select({ text: promoComments.text, title: promoFinds.title })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .where(and(eq(promoComments.id, source.slice("reddit:".length)), eq(promoComments.userId, userId)))
    .limit(1)
  return row ?? null
}

/** The publication's rules for the AI, when the article is going into one. */
async function publicationRules(article: MediumArticleRow, db: CustomShellDb): Promise<string> {
  if (!article.publicationSlug || !article.projectId) return ""
  const [row] = await db
    .select({ rules: promoMediumPublications.rules })
    .from(promoMediumPublications)
    .where(
      and(
        eq(promoMediumPublications.projectId, article.projectId),
        sql`lower(${promoMediumPublications.slug}) = lower(${article.publicationSlug})`
      )
    )
    .limit(1)
  return row?.rules ?? ""
}

async function voiceOf(userId: string, accountId: string | null, db: CustomShellDb): Promise<string> {
  return accountId ? (await wordsForAccount(userId, accountId, db)).voice : ""
}

/** Three titles and an outline for the article (part 27), kept on the draft. */
export async function writeMediumOutline(
  userId: string,
  articleId: string,
  input: { about: string },
  db: CustomShellDb = defaultDb
): Promise<MediumOutline> {
  const article = await ownedArticle(userId, articleId, db)
  const about = input.about.trim().slice(0, MAX_ARTICLE_ABOUT_CHARS)
  const source = await redditSource(userId, article.source, db)
  if (!about && !source) throw new Refusal("Say what the article is about first.")
  const picked = await pickProvider()
  const outline = await askModel(
    {
      userId,
      ...picked,
      feature: "medium-outline",
      metadata: { projectId: article.projectId, articleId: article.id },
      prompt: buildOutlinePrompt({
        about: about || source?.title || "",
        product: await projectDescription(userId, article.projectId, db),
        voice: await voiceOf(userId, article.accountId, db),
        source: source?.text ?? "",
        publicationRules: await publicationRules(article, db),
      }),
    },
    (answer) => {
      const read = readOutline(answer)
      if (!read.titles.length || !read.headings.length) {
        throw new Error(`${picked.provider} answered, but not with titles and headings.`)
      }
      return read
    }
  )
  await db.update(promoMediumArticles).set({ outline, updatedAt: new Date() }).where(eq(promoMediumArticles.id, article.id))
  return outline
}

/** The account's earlier published articles that share words with this title (part 29). */
async function earlierArticles(
  userId: string,
  article: MediumArticleRow,
  title: string,
  db: CustomShellDb
): Promise<Array<{ title: string; url: string }>> {
  if (!article.accountId) return []
  const rows = await db
    .select({ title: promoMediumArticles.title, url: promoMediumArticles.url })
    .from(promoMediumArticles)
    .where(
      and(
        eq(promoMediumArticles.userId, userId),
        eq(promoMediumArticles.accountId, article.accountId),
        eq(promoMediumArticles.status, "published"),
        isNull(promoMediumArticles.deletedAt),
        sql`${promoMediumArticles.id} <> ${article.id}`
      )
    )
    .orderBy(desc(promoMediumArticles.publishedAt))
    .limit(100)
  const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3))
  const wanted = words(title)
  return rows
    .map((row) => ({ row, shared: [...words(row.title)].filter((word) => wanted.has(word)).length }))
    .filter((item) => item.shared >= 1 && item.row.url)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, EARLIER_LINKS)
    .map(({ row }) => ({ title: row.title, url: row.url }))
}

/**
 * Writes the whole article from the picked title and headings, in the
 * account's voice, and keeps it on the draft to be edited. Nothing is sent.
 */
export async function writeMediumArticle(
  userId: string,
  articleId: string,
  input: { title: string; headings: string[]; about: string },
  db: CustomShellDb = defaultDb
): Promise<{ title: string; subtitle: string; tags: string[]; body: string }> {
  const article = await ownedArticle(userId, articleId, db)
  const title = input.title.trim().slice(0, MAX_ARTICLE_TITLE_CHARS)
  if (!title) throw new Refusal("Pick or type a title first.")
  const source = await redditSource(userId, article.source, db)
  const picked = await pickProvider()
  const written = await askModel(
    {
      userId,
      ...picked,
      feature: "medium-article",
      metadata: { projectId: article.projectId, articleId: article.id },
      // 1,200 words is about 1,700 tokens before its headings and the shape around it.
      maxTokens: 4_000,
      prompt: buildArticlePrompt({
        title,
        headings: input.headings.map((heading) => heading.trim()).filter(Boolean).slice(0, 8),
        about: input.about.trim().slice(0, MAX_ARTICLE_ABOUT_CHARS) || title,
        product: await projectDescription(userId, article.projectId, db),
        voice: await voiceOf(userId, article.accountId, db),
        source: source?.text ?? "",
        publicationRules: await publicationRules(article, db),
        earlier: await earlierArticles(userId, article, title, db),
      }),
    },
    (answer) => {
      const read = readArticle(answer)
      if (!read.body) throw new Error(`${picked.provider} answered, but with no article in the answer.`)
      return read
    }
  )
  const body = written.body.slice(0, MAX_ARTICLE_BODY_CHARS)
  await db
    .update(promoMediumArticles)
    .set({ title, subtitle: written.subtitle.slice(0, MAX_ARTICLE_SUBTITLE_CHARS), tags: written.tags, body, updatedAt: new Date() })
    .where(eq(promoMediumArticles.id, article.id))
  return { title, subtitle: written.subtitle, tags: written.tags, body }
}

/**
 * Article ideas from what people keep asking (part 31): the titles of the
 * project's newest Medium stories and Reddit posts, which are often
 * questions, handed to the AI with the project's description.
 */
export async function mediumArticleIdeas(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<ArticleIdea[]> {
  await ownedProject(userId, projectId, db)
  const medium = await db
    .select({ title: promoMediumFinds.title })
    .from(promoMediumFinds)
    .innerJoin(promoMediumKeywords, eq(promoMediumKeywords.id, promoMediumFinds.keywordId))
    .where(and(eq(promoMediumFinds.userId, userId), eq(promoMediumKeywords.projectId, projectId)))
    .orderBy(desc(promoMediumFinds.lastSeenAt))
    .limit(IDEA_TITLES)
  const reddit = await db
    .select({ title: promoFinds.title })
    .from(promoFinds)
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(and(eq(promoFinds.userId, userId), eq(promoKeywords.projectId, projectId)))
    .orderBy(desc(promoFinds.lastSeenAt))
    .limit(IDEA_TITLES)
  const titles = [...new Set([...reddit, ...medium].map((row) => row.title.trim()).filter(Boolean))].slice(0, IDEA_TITLES)
  if (!titles.length) throw new Refusal("There are no stories or posts found for this project yet, so there is nothing to draw ideas from.")
  const picked = await pickProvider()
  return askModel(
    {
      userId,
      ...picked,
      feature: "medium-ideas",
      metadata: { projectId },
      prompt: buildArticleIdeasPrompt(await projectDescription(userId, projectId, db), titles),
    },
    (answer) => {
      const ideas = readArticleIdeas(answer)
      if (!ideas.length) throw new Error(`${picked.provider} answered, but with no ideas in the answer.`)
      return ideas
    }
  )
}

/**
 * Queues the article for Medium because a person pressed Publish. Refused
 * with why when it may not go: no account, a warming or paused account, a
 * young account at its pace, words too close to another account's, or a
 * publication the account does not write for. Outside waking hours it waits
 * for the account's morning. No AI label is added (Tyler, 21 Oct 2026:
 * "Never label them").
 */
export async function queueMediumPublish(
  userId: string,
  articleId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  sentBy: string | null = null
): Promise<{ jobId: string; runAfter: Date | null }> {
  const article = await ownedArticle(userId, articleId, db)
  if (article.status !== "draft" && article.status !== "failed") throw new Refusal("This article has gone to Medium already.")
  if (!article.accountId || !article.projectId) throw new Refusal("Pick the account it goes out as first.")
  if (!article.title.trim() || !article.body.trim()) throw new Refusal("An article needs a title and its words before it can be published.")
  const account = await projectMediumAccount(userId, article.projectId, article.accountId, db)
  refuseOnPhone(account, "Publishing an article")
  const state = await readMediumPostingState(userId, account, db, now)
  const refusal = mediumPostingRefusal(state, now, state.timeZone)
  if (refusal) throw new Refusal(refusal)
  await refuseTooSimilar(userId, account.id, article.body, db)
  if (article.publicationSlug) {
    const [publication] = await db
      .select()
      .from(promoMediumPublications)
      .where(
        and(
          eq(promoMediumPublications.projectId, article.projectId),
          sql`lower(${promoMediumPublications.slug}) = lower(${article.publicationSlug})`
        )
      )
      .limit(1)
    if (!publication) throw new Refusal("That publication is not on the Publications tab any more.")
    if (!publication.writersReadAt) {
      throw new Refusal(`Promo has not checked who writes for ${publication.name || publication.slug} yet. Press Check on the Publications tab first.`)
    }
    if (!publication.writers.includes(account.id)) {
      throw new Refusal(
        `Medium says this account does not write for ${publication.name || publication.slug}. An editor there has to add it as a writer first, or publish it on the account's own page.`
      )
    }
  }
  const jobId = uuid()
  const runAfter = state.nextWakeAt
  // Only a draft or a failed article moves to waiting, so a second press
  // that passed the checks at the same moment queues nothing.
  await db.transaction(async (tx) => {
    const [moved] = await tx
      .update(promoMediumArticles)
      .set({ status: "waiting", jobId, lastError: "", sentBy, updatedAt: now })
      .where(and(eq(promoMediumArticles.id, article.id), inArray(promoMediumArticles.status, ["draft", "failed"])))
      .returning({ id: promoMediumArticles.id })
    if (!moved) throw new Refusal("This article is already on its way to Medium.")
    await queueJob(userId, "medium_publish", { articleId: article.id, accountId: account.id }, tx, runAfter, jobId)
  })
  return { jobId, runAfter }
}

/** Takes back an article still waiting for its morning, or its first seconds. */
export async function cancelMediumPublish(userId: string, articleId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const article = await ownedArticle(userId, articleId, db)
  if (article.status !== "waiting" || !article.jobId) throw new Error("That article is not waiting to publish.")
  const removed = await db
    .delete(promoJobs)
    .where(and(eq(promoJobs.id, article.jobId), eq(promoJobs.userId, userId), eq(promoJobs.status, "queued")))
    .returning({ id: promoJobs.id })
  if (!removed.length) throw new Error("That article has started going to Medium, so it cannot be taken back.")
  await db.update(promoMediumArticles).set({ status: "draft", jobId: null, updatedAt: new Date() }).where(eq(promoMediumArticles.id, article.id))
}

/** Publishes one waiting article from its account's browser. Tried once. */
export async function runMediumPublish(
  userId: string,
  articleId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const article = await ownedArticle(userId, articleId, db)
  if (article.status !== "waiting") throw new Refusal("That article was taken back before it went.")
  const [publication] = article.publicationSlug && article.projectId
    ? await db
        .select({ name: promoMediumPublications.name })
        .from(promoMediumPublications)
        .where(
          and(
            eq(promoMediumPublications.projectId, article.projectId),
            sql`lower(${promoMediumPublications.slug}) = lower(${article.publicationSlug})`
          )
        )
        .limit(1)
    : []
  // Only the publish itself can fail the row, so an article Medium has is
  // never marked failed and published twice.
  let sent: Awaited<ReturnType<typeof mediumPublish>>
  try {
    sent = await mediumPublish(target, {
      title: article.title,
      subtitle: article.subtitle,
      body: article.body,
      tags: article.tags,
      coverUrl: article.coverUrl,
      publication: article.publicationSlug ? (publication?.name || article.publicationSlug) : "",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoMediumArticles)
      .set({ status: "failed", lastError: message.slice(0, 2_000), updatedAt: now })
      .where(eq(promoMediumArticles.id, article.id))
    throw error
  }
  await db
    .update(promoMediumArticles)
    .set({ status: "published", storyId: sent.storyId.slice(0, 16), url: sent.url.slice(0, 600), publishedAt: now, lastError: "", updatedAt: now })
    .where(eq(promoMediumArticles.id, article.id))
}

/**
 * Asks for the daily readings of published articles: the public numbers and
 * the responses under each from the reader, and views and reads, which only
 * the writer sees, from the account's own browser.
 */
export async function queueArticleChecks(
  userId: string,
  articleIds: string[] | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  if (articleIds && !articleIds.length) return 0
  const due = await db
    .select({ id: promoMediumArticles.id, accountId: promoMediumArticles.accountId, onPhone: sql<boolean>`${promoAccounts.phoneId} IS NOT NULL` })
    .from(promoMediumArticles)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoMediumArticles.accountId))
    .where(
      and(
        eq(promoMediumArticles.userId, userId),
        eq(promoMediumArticles.status, "published"),
        isNull(promoMediumArticles.deletedAt),
        articleIds
          ? inArray(promoMediumArticles.id, articleIds)
          : or(isNull(promoMediumArticles.numbersReadAt), lt(promoMediumArticles.numbersReadAt, new Date(now.getTime() - CHECK_EVERY_MS)))
      )
    )
    .limit(articleIds ? 50 : 20)
  const waiting = await db
    .select({ kind: promoJobs.kind, payload: promoJobs.payload })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, ["medium_check", "medium_stats"]),
        inArray(promoJobs.status, ["queued", "running"])
      )
    )
  const busy = new Set(waiting.map((job) => `${job.kind}:${String(job.payload?.articleId ?? "")}`))
  let queued = 0
  for (const row of due) {
    if (!busy.has(`medium_check:${row.id}`)) {
      await queueJob(userId, "medium_check", { articleId: row.id }, db)
      queued += 1
    }
    // Views and reads are read in the writer's own browser; a phone's app has no stats page Promo reads.
    if (row.accountId && !row.onPhone && !busy.has(`medium_stats:${row.id}`)) {
      await queueJob(userId, "medium_stats", { articleId: row.id, accountId: row.accountId }, db)
      queued += 1
    }
  }
  return queued
}

/** Today's reading, kept once a day per article, the newest of the day winning. */
async function keepReading(
  articleId: string,
  reading: Partial<Omit<ArticleReading, "readOn">>,
  db: CustomShellDb,
  now: Date
): Promise<void> {
  const readOn = now.toISOString().slice(0, 10)
  await db
    .insert(promoMediumArticleReadings)
    .values({ articleId, readOn, ...reading })
    .onConflictDoUpdate({
      target: [promoMediumArticleReadings.articleId, promoMediumArticleReadings.readOn],
      set: reading,
    })
}

/**
 * Writes one article's public reading: claps, responses, the responses
 * under it, and whether it is still up and still in its publication. A new
 * response under it, the article gone, or the article pulled from its
 * publication rings the bell once (part 39).
 */
export async function recordArticleCheck(
  userId: string,
  articleId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const article = await ownedArticle(userId, articleId, db)
  if (!article.storyId) throw new Refusal("That article never landed on Medium, so there is nothing to read.")
  const read = await mediumCheck(target, { storyId: article.storyId })
  const incoming = read.incoming
    .filter((item) => !item.hidden && !item.deleted)
    .map((item) => ({
      id: item.id,
      writerId: item.writerId,
      writer: item.writer,
      text: item.text,
      claps: item.claps,
      postedAt: item.postedSeconds ? new Date(item.postedSeconds * 1000).toISOString() : null,
    }))
  const before = new Set((article.incoming ?? []).map((item) => item.id))
  await db
    .update(promoMediumArticles)
    .set({ claps: read.claps, responses: read.responseCount ?? incoming.length, incoming, stillVisible: read.visible, numbersReadAt: now })
    .where(eq(promoMediumArticles.id, article.id))
  await keepReading(article.id, { claps: read.claps, responses: read.responseCount ?? incoming.length }, db, now)

  const href = article.projectId
    ? `/admin/projects/${encodeURIComponent(article.projectId)}?network=medium&tab=articles&open=${encodeURIComponent(article.id)}`
    : "/admin/projects"
  if (article.stillVisible !== false && !read.visible && !article.deletedAt) {
    await ringBell(
      userId,
      {
        kind: "medium_gone",
        targetId: article.id,
        message: `${NOTICE_HEADINGS.medium_gone} "${article.title.slice(0, 80)}"`,
        detail: "Your article no longer shows on Medium. It was taken down or deleted.",
        href,
      },
      db,
      now
    )
  }
  if (read.visible && article.publicationSlug && read.publicationSlug.toLowerCase() !== article.publicationSlug.toLowerCase()) {
    await ringBell(
      userId,
      {
        kind: "medium_pulled",
        targetId: article.id,
        message: `${NOTICE_HEADINGS.medium_pulled} "${article.title.slice(0, 80)}"`,
        detail: `Medium no longer shows it in ${article.publicationSlug}. It is still up on the account's own page.`,
        href,
      },
      db,
      now
    )
  }
  for (const item of incoming) {
    if (before.has(item.id) || (await noticeRung("medium_reply", item.id, db))) continue
    await ringBell(
      userId,
      {
        kind: "medium_reply",
        targetId: item.id,
        message: `${NOTICE_HEADINGS.medium_reply} from ${item.writer ? `@${item.writer}` : "a reader"}`,
        detail: item.text.slice(0, 300),
        href,
      },
      db,
      now
    )
  }
}

/** Writes an article's views and reads, read in its writer's own browser. */
export async function recordArticleStats(
  userId: string,
  articleId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const article = await ownedArticle(userId, articleId, db)
  if (!article.storyId) throw new Refusal("That article never landed on Medium, so it has no numbers.")
  const stats = await mediumStats(target, { storyId: article.storyId })
  await db.update(promoMediumArticles).set({ views: stats.views, reads: stats.reads }).where(eq(promoMediumArticles.id, article.id))
  await keepReading(article.id, { views: stats.views, reads: stats.reads }, db, now)
}

/** A sent Reddit comment worth growing into an article (part 30): the person's best still up, by upvotes. */
export async function redditCommentsWorthAnArticle(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<Array<{ id: string; text: string; upvotes: number | null; postTitle: string }>> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ id: promoComments.id, text: promoComments.text, upvotes: promoComments.upvotes, postTitle: promoFinds.title })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoKeywords.projectId, projectId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.deletedAt),
        isNull(promoComments.parentId)
      )
    )
    .orderBy(sql`${promoComments.upvotes} DESC NULLS LAST`, desc(promoComments.postedAt))
    .limit(10)
  return rows
}
