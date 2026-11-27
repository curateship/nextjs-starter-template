import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { MediumPostingState } from "@/lib/social/medium/wording"

import { readBehaviour } from "../behaviour"
import { jobCounts, type JobCounts } from "../jobs"
import { ownedProject } from "../projects"
import { promoAccounts, promoJobs, promoVoices } from "../schema"
import { mediumSpend, type MediumSpend } from "./cost"
import { listMediumFinds, listHidden, ownedMediumFind, type HiddenRow, type MediumFindView } from "./finds"
import { listMediumKeywords, type MediumKeywordView } from "./keywords"
import { heldForMorning, readMediumPostingState } from "./posting"
import { answeredIds, listMediumResponses, pastMediumAnswers, type MediumResponseView, type PastMediumAnswer } from "./responses"
import { mediumFitBand } from "./rank"
import {
  promoMediumArticles,
  promoMediumDrafts,
  promoMediumFinds,
  promoMediumKeywords,
  promoMediumPublications,
  promoMediumResponses,
} from "./schema"

/**
 * What the Medium module on a project's dashboard reads when it opens: the
 * project's Medium accounts and whether each may write now, its keywords,
 * the counts on its tabs and on its row in the left column, the month's AI
 * spend, and the hidden writers and publications. One read, so the module
 * opens with everything at once.
 */

export type MediumAccountView = {
  id: string
  /** Empty until the browser has seen it signed in. */
  handle: string
  /** The browser profile it signs in inside, or "a phone". */
  runsIn: string | null
  /** It runs in the Medium app on a phone, which sends responses and answers only (part 42). */
  onPhone: boolean
  voice: { id: string; name: string } | null
  followers: number | null
  joinedAt: Date | null
  blocked: boolean
  blockedReason: string
  posting: MediumPostingState
  /** Responses pressed and held back for the account's morning. */
  held: Array<{ responseId: string; runAfter: Date }>
}

export type MediumCounts = {
  /** Stories under the project's keywords nobody answered or skipped, one per story. */
  toLook: number
  strong: number
  replied: number
  skipped: number
  /** Responses under ours and under our articles nobody has answered from Promo. */
  toAnswer: number
  /** Responses and articles that did not go out and nobody dealt with. */
  failed: number
}

export type MediumModuleView = {
  accounts: MediumAccountView[]
  /** Medium accounts in no project, for the accounts dropdown's Add. */
  freeAccounts: Array<{ id: string; handle: string }>
  keywords: MediumKeywordView[]
  hidden: HiddenRow[]
  counts: MediumCounts
  spend: MediumSpend
  /** Medium is paused on this project (part 5). */
  paused: boolean
  /** Whether a reader browser is picked, without which nothing is searched. */
  readerPicked: boolean
  jobs: JobCounts
  publications: Array<{ slug: string; name: string; writers: string[] }>
}

export async function readMediumModuleView(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumModuleView> {
  const project = await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ account: promoAccounts, voiceName: promoVoices.name, profileName: promoProfiles.name })
    .from(promoAccounts)
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "medium"), isNull(promoAccounts.retiredAt)))
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))

  const accounts: MediumAccountView[] = []
  for (const { account, voiceName, profileName } of rows) {
    if (account.projectId !== projectId) continue
    accounts.push({
      id: account.id,
      handle: account.handle,
      runsIn: profileName ?? (account.phoneId ? "a phone" : null),
      onPhone: Boolean(account.phoneId),
      voice: account.voiceId && voiceName !== null ? { id: account.voiceId, name: voiceName } : null,
      followers: account.followers,
      joinedAt: account.mediumJoinedAt,
      blocked: account.blocked,
      blockedReason: account.blockedReason,
      posting: await readMediumPostingState(userId, account, db, now),
      held: await heldForMorning(userId, account.id, db, now),
    })
  }

  const publications = await db
    .select({ slug: promoMediumPublications.slug, name: promoMediumPublications.name, writers: promoMediumPublications.writers })
    .from(promoMediumPublications)
    .where(and(eq(promoMediumPublications.userId, userId), eq(promoMediumPublications.projectId, projectId)))
    .orderBy(asc(promoMediumPublications.name))

  return {
    accounts,
    freeAccounts: rows
      .filter((row) => row.account.projectId === null)
      .map((row) => ({ id: row.account.id, handle: row.account.handle })),
    keywords: await listMediumKeywords(userId, projectId, db),
    hidden: await listHidden(userId, db),
    counts: await readMediumCounts(userId, projectId, db, now),
    spend: await mediumSpend(userId, projectId, db, now),
    paused: project.pausedNetworks.includes("medium"),
    readerPicked: Boolean((await readBehaviour(userId, db)).readerProfileId),
    jobs: await jobCounts(userId, db),
    publications,
  }
}

/**
 * The counts on the module's tabs and its row in the left column (part 16):
 * the row says how many strong stories and unanswered responses wait.
 */
export async function readMediumCounts(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumCounts> {
  const toLook = await listMediumFinds(userId, { projectId, keywordId: null, tab: "new", limit: null }, db, now)
  const [replied] = await db
    .select({ n: sql<number>`count(DISTINCT ${promoMediumFinds.storyId})::int` })
    .from(promoMediumFinds)
    .innerJoin(promoMediumKeywords, eq(promoMediumKeywords.id, promoMediumFinds.keywordId))
    .where(and(eq(promoMediumFinds.userId, userId), eq(promoMediumKeywords.projectId, projectId), eq(promoMediumFinds.status, "commented")))
  const [skipped] = await db
    .select({ n: sql<number>`count(DISTINCT ${promoMediumFinds.storyId})::int` })
    .from(promoMediumFinds)
    .innerJoin(promoMediumKeywords, eq(promoMediumKeywords.id, promoMediumFinds.keywordId))
    .where(and(eq(promoMediumFinds.userId, userId), eq(promoMediumKeywords.projectId, projectId), eq(promoMediumFinds.status, "skipped")))
  const answered = await answeredIds(userId, db)
  const mine = await db
    .select({ incoming: promoMediumResponses.incoming })
    .from(promoMediumResponses)
    .where(and(eq(promoMediumResponses.userId, userId), eq(promoMediumResponses.projectId, projectId), eq(promoMediumResponses.status, "posted")))
  const articles = await db
    .select({ incoming: promoMediumArticles.incoming, status: promoMediumArticles.status, jobId: promoMediumArticles.jobId })
    .from(promoMediumArticles)
    .where(and(eq(promoMediumArticles.userId, userId), eq(promoMediumArticles.projectId, projectId)))
  const toAnswer = [...mine, ...articles.filter((row) => row.status === "published")].reduce(
    (sum, row) => sum + (row.incoming ?? []).filter((item) => !answered.has(item.id)).length,
    0
  )
  const failedResponses = await listMediumResponses(userId, projectId, "failed", db)
  const failedArticleJobs = articles.filter((row) => row.status === "failed" && row.jobId).map((row) => row.jobId as string)
  const dismissed = failedArticleJobs.length
    ? await db
        .select({ id: promoJobs.id })
        .from(promoJobs)
        .where(and(inArray(promoJobs.id, failedArticleJobs), sql`${promoJobs.dismissedAt} IS NOT NULL`))
    : []
  return {
    toLook: toLook.length,
    strong: toLook.filter((find) => find.band === "strong").length,
    replied: replied?.n ?? 0,
    skipped: skipped?.n ?? 0,
    toAnswer,
    failed: failedResponses.length + failedArticleJobs.length - dismissed.length,
  }
}

export type MediumFindDetail = MediumFindView & {
  text: string
  responses: Array<{ id: string; writer: string; text: string; claps: number }> | null
  readAt: Date | null
  /** A read of the story is waiting or running. */
  reading: boolean
  drafts: Array<{ id: string; text: string; line: string; helpOnly: boolean; rewrite: string; createdAt: Date }>
  past: PastMediumAnswer[]
  /** What the person's accounts already sent on this story. */
  sentHere: MediumResponseView[]
}

/** One story for the right column: its words, its top responses, the drafts, what you said before, and what was sent. */
export async function readMediumFindDetail(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumFindDetail> {
  const find = await ownedMediumFind(userId, findId, db)
  if (!find) throw new Error("That Medium story is no longer saved.")
  const [listed] = (await listMediumFinds(userId, { projectId: find.projectId, keywordId: find.keywordId, tab: tabOf(find.status) }, db, now)).filter(
    (row) => row.storyId === find.storyId
  )
  const base: MediumFindView = listed ?? {
    id: find.id,
    storyId: find.storyId,
    url: find.url,
    title: find.title,
    subtitle: find.subtitle,
    writer: { id: find.writerId, handle: find.writerHandle, name: find.writerName, followers: find.writerFollowers },
    publication: find.publicationSlug ? { slug: find.publicationSlug, name: find.publicationName } : null,
    tags: find.tags,
    postedAt: find.postedAt,
    claps: find.claps,
    responseCount: find.responseCount,
    membersOnly: find.membersOnly,
    rank: find.rank,
    band: mediumFitBand(find.rank),
    reason: "",
    status: find.status,
    named: "",
    keywords: [],
    read: find.storyReadAt !== null,
  }
  const drafts = await db
    .select()
    .from(promoMediumDrafts)
    .where(and(eq(promoMediumDrafts.userId, userId), eq(promoMediumDrafts.findId, find.id)))
    .orderBy(desc(promoMediumDrafts.createdAt))
    .limit(10)
  const [reading] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "medium_story"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'findId' = ${find.id}`
      )
    )
    .limit(1)
  const sent = await listMediumResponses(userId, find.projectId, "sent", db)
  const failed = await listMediumResponses(userId, find.projectId, "failed", db)
  return {
    ...base,
    text: find.text,
    responses: find.responses,
    readAt: find.storyReadAt,
    reading: Boolean(reading),
    drafts: drafts.map((draft) => ({ id: draft.id, text: draft.text, line: draft.line, helpOnly: draft.helpOnly, rewrite: draft.rewrite, createdAt: draft.createdAt })),
    past: await pastMediumAnswers(userId, { id: find.id, storyId: find.storyId, keywordId: find.keywordId, title: find.title }, db),
    sentHere: [...sent, ...failed].filter((row) => row.storyId === find.storyId && !row.isAnswer),
  }
}

function tabOf(status: MediumFindView["status"]): "new" | "replied" | "skipped" {
  return status === "commented" ? "replied" : status === "skipped" ? "skipped" : "new"
}

export type MediumToday = {
  /** The strongest stories waiting, best first. */
  strong: MediumFindView[]
  /** Responses under ours and under our articles nobody has answered from Promo yet. */
  toAnswer: Array<{
    under: { responseId: string } | { articleId: string }
    title: string
    account: string
    incoming: { id: string; writer: string; text: string; claps: number; postedAt: string | null }
  }>
}

/** The Today tab of the Medium module (part 15): what is worth doing now, on this project. */
export async function readMediumToday(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumToday> {
  await ownedProject(userId, projectId, db)
  const strong = (await listMediumFinds(userId, { projectId, keywordId: null, tab: "new", limit: null }, db, now))
    .filter((find) => find.band === "strong")
    .slice(0, 10)
  const answered = await answeredIds(userId, db)
  const responses = await db
    .select({ row: promoMediumResponses, handle: promoAccounts.handle })
    .from(promoMediumResponses)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoMediumResponses.accountId))
    .where(and(eq(promoMediumResponses.userId, userId), eq(promoMediumResponses.projectId, projectId), eq(promoMediumResponses.status, "posted")))
  const articles = await db
    .select({ row: promoMediumArticles, handle: promoAccounts.handle })
    .from(promoMediumArticles)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoMediumArticles.accountId))
    .where(and(eq(promoMediumArticles.userId, userId), eq(promoMediumArticles.projectId, projectId), eq(promoMediumArticles.status, "published")))
  const toAnswer: MediumToday["toAnswer"] = []
  for (const { row, handle } of responses) {
    for (const item of row.incoming ?? []) {
      if (!answered.has(item.id)) toAnswer.push({ under: { responseId: row.id }, title: row.storyTitle, account: handle, incoming: item })
    }
  }
  for (const { row, handle } of articles) {
    for (const item of row.incoming ?? []) {
      if (!answered.has(item.id)) toAnswer.push({ under: { articleId: row.id }, title: row.title, account: handle, incoming: item })
    }
  }
  toAnswer.sort((a, b) => (b.incoming.postedAt ?? "").localeCompare(a.incoming.postedAt ?? ""))
  return { strong, toAnswer: toAnswer.slice(0, 30) }
}
