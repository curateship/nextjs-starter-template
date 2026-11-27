import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { LinkedinSeen } from "@/lib/social/linkedin/options"
import type { LinkedinPostingState } from "@/lib/social/linkedin/wording"

import { jobCounts, type JobCounts } from "../jobs"
import { ownedProject } from "../projects"
import { promoAccounts, promoJobs, promoVoices } from "../schema"
import { answeredLinkedinIds, listLinkedinComments, pastLinkedinComments, type LinkedinCommentView, type PastLinkedinComment } from "./comments"
import { linkedinSpend, type LinkedinSpend } from "./cost"
import { listLinkedinFinds, listLinkedinHidden, ownedLinkedinFind, readLinkedinFind, type LinkedinFindView, type LinkedinHiddenRow } from "./finds"
import { listLinkedinGroups, type LinkedinGroupView } from "./groups"
import { listLinkedinKeywords, readBuyerTitles, type LinkedinKeywordView } from "./keywords"
import { readLinkedinPostingState, linkedinHeldForWorkday } from "./posting"
import { listLinkedinPosts } from "./posts"
import { promoLinkedinComments, promoLinkedinDrafts, promoLinkedinFinds, promoLinkedinInvites, promoLinkedinPages, promoLinkedinPosts } from "./schema"
import { listLinkedinSearchers, type LinkedinSearcherView } from "./searchers"

/**
 * What the LinkedIn module on a project's dashboard reads when it opens: the
 * project's LinkedIn accounts and whether each may comment now, its keywords
 * and buyer titles, its groups, the counts on its tabs and on its row in the
 * left column, the search accounts and their views today, the month's AI
 * spend and the hidden people. One read, so the module opens with everything
 * at once.
 */

export type LinkedinAccountView = {
  id: string
  /** The member's slug, empty until a look has seen it signed in. */
  handle: string
  /** The browser profile it signs in inside, or "a phone". */
  runsIn: string | null
  onPhone: boolean
  important: boolean
  premium: boolean
  voice: { id: string; name: string } | null
  followers: number | null
  seen: LinkedinSeen | ""
  blocked: boolean
  blockedReason: string
  /** LinkedIn is asking for its emailed code (part 4). */
  codeAsked: boolean
  /** The company pages it runs (part 38). */
  pages: Array<{ pageId: string; name: string }>
  posting: LinkedinPostingState
  /** Comments pressed and held back for its next workday. */
  held: Array<{ commentRowId: string; runAfter: Date }>
}

export type LinkedinCounts = {
  /** Posts nobody commented on or skipped, fresh enough to answer, one per post. */
  toLook: number
  strong: number
  commented: number
  skipped: number
  /** Replies under ours nobody has answered from Promo. */
  toAnswer: number
  /** Comments and posts that did not go out and nobody dealt with. */
  failed: number
  /** Connection requests waiting on the accounts (part 40). */
  invites: number
}

export type LinkedinModuleView = {
  accounts: LinkedinAccountView[]
  /** LinkedIn accounts in no project, for the accounts dropdown's Add. */
  freeAccounts: Array<{ id: string; handle: string }>
  keywords: LinkedinKeywordView[]
  buyerTitles: string[]
  groups: LinkedinGroupView[]
  hidden: LinkedinHiddenRow[]
  counts: LinkedinCounts
  spend: LinkedinSpend
  /** LinkedIn is paused on this project. */
  paused: boolean
  /** The search accounts, without which nothing on LinkedIn is read (part 3). */
  searchers: LinkedinSearcherView[]
  jobs: JobCounts
}

export async function readLinkedinModuleView(userId: string, projectId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<LinkedinModuleView> {
  const project = await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ account: promoAccounts, voiceName: promoVoices.name, profileName: promoProfiles.name })
    .from(promoAccounts)
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "linkedin"), isNull(promoAccounts.retiredAt)))
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))
  const mine = rows.filter((row) => row.account.projectId === projectId)
  const pages = mine.length
    ? await db
        .select({ accountId: promoLinkedinPages.accountId, pageId: promoLinkedinPages.pageId, name: promoLinkedinPages.name })
        .from(promoLinkedinPages)
        .where(and(eq(promoLinkedinPages.userId, userId), inArray(promoLinkedinPages.accountId, mine.map((row) => row.account.id))))
        .orderBy(asc(promoLinkedinPages.name))
    : []
  const accounts: LinkedinAccountView[] = []
  for (const { account, voiceName, profileName } of mine) {
    accounts.push({
      id: account.id,
      handle: account.handle,
      runsIn: profileName ?? (account.phoneId ? "a phone" : null),
      onPhone: Boolean(account.phoneId),
      important: account.importance === "important" || Boolean(account.movingToPhoneId),
      premium: account.linkedinPremium,
      voice: account.voiceId && voiceName !== null ? { id: account.voiceId, name: voiceName } : null,
      followers: account.followers,
      seen: account.linkedinSeen,
      blocked: account.blocked,
      blockedReason: account.blockedReason,
      codeAsked: Boolean(account.linkedinCodeAskedAt),
      pages: pages.filter((page) => page.accountId === account.id).map((page) => ({ pageId: page.pageId, name: page.name || `Page ${page.pageId}` })),
      posting: await readLinkedinPostingState(userId, account, db, now),
      held: await linkedinHeldForWorkday(userId, account.id, db, now),
    })
  }
  return {
    accounts,
    freeAccounts: rows.filter((row) => row.account.projectId === null).map((row) => ({ id: row.account.id, handle: row.account.handle })),
    keywords: await listLinkedinKeywords(userId, projectId, db),
    buyerTitles: await readBuyerTitles(userId, projectId, db),
    groups: await listLinkedinGroups(userId, projectId, db),
    hidden: await listLinkedinHidden(userId, db),
    counts: await readLinkedinCounts(userId, projectId, db, now),
    spend: await linkedinSpend(userId, projectId, db, now),
    paused: project.pausedNetworks.includes("linkedin"),
    searchers: await listLinkedinSearchers(userId, db, now),
    jobs: await jobCounts(userId, db),
  }
}

/** The unanswered replies under the project's comments and posts. */
async function unansweredCount(userId: string, projectId: string, db: CustomShellDb): Promise<number> {
  const answered = await answeredLinkedinIds(userId, db)
  const comments = await db
    .select({ incoming: promoLinkedinComments.incoming })
    .from(promoLinkedinComments)
    .where(and(eq(promoLinkedinComments.userId, userId), eq(promoLinkedinComments.projectId, projectId), eq(promoLinkedinComments.status, "posted")))
  const posts = await db
    .select({ incoming: promoLinkedinPosts.incoming })
    .from(promoLinkedinPosts)
    .where(and(eq(promoLinkedinPosts.userId, userId), eq(promoLinkedinPosts.projectId, projectId), eq(promoLinkedinPosts.status, "posted")))
  return [...comments, ...posts].reduce((sum, row) => sum + (row.incoming ?? []).filter((item) => !answered.has(item.id)).length, 0)
}

/**
 * The counts on the module's tabs and its row in the left column (part 21):
 * the row says how many strong posts, unanswered replies and waiting
 * connection requests wait.
 */
export async function readLinkedinCounts(userId: string, projectId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<LinkedinCounts> {
  const toLook = await listLinkedinFinds(userId, { projectId, keywordId: null, tab: "new", limit: null }, db, now)
  const count = async (status: "commented" | "skipped") => {
    const [row] = await db
      .select({ n: sql<number>`count(DISTINCT ${promoLinkedinFinds.postId})::int` })
      .from(promoLinkedinFinds)
      .where(and(eq(promoLinkedinFinds.userId, userId), eq(promoLinkedinFinds.projectId, projectId), eq(promoLinkedinFinds.status, status)))
    return row?.n ?? 0
  }
  const failedComments = await listLinkedinComments(userId, projectId, "failed", db)
  const [failedPosts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoLinkedinPosts)
    .leftJoin(promoJobs, eq(promoJobs.id, promoLinkedinPosts.jobId))
    .where(
      and(
        eq(promoLinkedinPosts.userId, userId),
        eq(promoLinkedinPosts.projectId, projectId),
        eq(promoLinkedinPosts.status, "failed"),
        isNull(promoLinkedinPosts.deletedAt),
        isNull(promoJobs.dismissedAt)
      )
    )
  const [invites] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoLinkedinInvites)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinInvites.accountId))
    .where(and(eq(promoLinkedinInvites.userId, userId), eq(promoAccounts.projectId, projectId), eq(promoLinkedinInvites.status, "waiting")))
  return {
    toLook: toLook.length,
    strong: toLook.filter((find) => find.band === "strong").length,
    commented: await count("commented"),
    skipped: await count("skipped"),
    toAnswer: await unansweredCount(userId, projectId, db),
    failed: failedComments.length + (failedPosts?.n ?? 0),
    invites: invites?.n ?? 0,
  }
}

export type LinkedinFindDetail = LinkedinFindView & {
  readAt: Date | null
  /** A read of the post is waiting or running. */
  reading: boolean
  drafts: Array<{ id: string; text: string; replyToId: string; helpOnly: boolean; rewrite: string; createdAt: Date }>
  /** What you said before on posts like this, by the account picked (part 23). */
  past: PastLinkedinComment[]
  /** What the person's accounts already sent on this post. */
  sentHere: LinkedinCommentView[]
}

/** One post for the right column: its words, its top comments, the drafts, what you said before, and what was sent. */
export async function readLinkedinFindDetail(
  userId: string,
  findId: string,
  accountId: string | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<LinkedinFindDetail> {
  const find = await ownedLinkedinFind(userId, findId, db)
  const base = find ? await readLinkedinFind(userId, findId, db, now) : null
  if (!find || !base) throw new Error("That LinkedIn post is no longer saved.")
  const drafts = await db
    .select()
    .from(promoLinkedinDrafts)
    .where(and(eq(promoLinkedinDrafts.userId, userId), eq(promoLinkedinDrafts.findId, find.id)))
    .orderBy(desc(promoLinkedinDrafts.createdAt))
    .limit(10)
  const [reading] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "linkedin_read"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'findId' = ${find.id}`
      )
    )
    .limit(1)
  const sent = [
    ...(await listLinkedinComments(userId, find.projectId, "sent", db, find.postId)),
    ...(await listLinkedinComments(userId, find.projectId, "failed", db, find.postId)),
  ]
  return {
    ...base,
    readAt: find.readAt,
    reading: Boolean(reading),
    drafts: drafts.map((draft) => ({ id: draft.id, text: draft.text, replyToId: draft.replyToId, helpOnly: draft.helpOnly, rewrite: draft.rewrite, createdAt: draft.createdAt })),
    past: await pastLinkedinComments(userId, { postId: find.postId, keywordId: find.keywordId, text: find.text }, accountId, db),
    sentHere: sent.filter((row) => row.kind !== "answer" && row.targetId === find.postId),
  }
}

export type LinkedinToday = {
  /** The strongest posts waiting, best first, all under 2 days old. */
  strong: LinkedinFindView[]
  /** Replies under ours nobody has answered from Promo yet. */
  toAnswer: Array<{
    under: { commentRowId: string } | { postRowId: string }
    /** What it answers, in a few words. */
    about: string
    account: string
    incoming: { id: string; name: string; headline: string; text: string; reactions: number; postedAt: string | null }
  }>
  /** Connection requests waiting on the accounts, people the project sells to first. */
  invites: number
}

/** The Today tab of the LinkedIn module (part 21): what is worth doing now, on this project. */
export async function readLinkedinToday(userId: string, projectId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<LinkedinToday> {
  await ownedProject(userId, projectId, db)
  const strong = (await listLinkedinFinds(userId, { projectId, keywordId: null, tab: "new", limit: null }, db, now)).filter((find) => find.band === "strong").slice(0, 10)
  const answered = await answeredLinkedinIds(userId, db)
  const toAnswer: LinkedinToday["toAnswer"] = []
  const comments = await db
    .select({ row: promoLinkedinComments, handle: promoAccounts.handle })
    .from(promoLinkedinComments)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinComments.accountId))
    .where(and(eq(promoLinkedinComments.userId, userId), eq(promoLinkedinComments.projectId, projectId), eq(promoLinkedinComments.status, "posted")))
  for (const { row, handle } of comments) {
    for (const item of row.incoming ?? []) {
      if (!answered.has(item.id)) toAnswer.push({ under: { commentRowId: row.id }, about: row.text.slice(0, 120), account: handle, incoming: item })
    }
  }
  for (const post of await listLinkedinPosts(userId, projectId, db)) {
    for (const item of post.incoming ?? []) {
      if (!answered.has(item.id)) toAnswer.push({ under: { postRowId: post.id }, about: (post.title || post.text).slice(0, 120), account: post.account?.handle ?? "", incoming: item })
    }
  }
  toAnswer.sort((a, b) => (b.incoming.postedAt ?? "").localeCompare(a.incoming.postedAt ?? ""))
  const counts = await readLinkedinCounts(userId, projectId, db, now)
  return { strong, toAnswer: toAnswer.slice(0, 30), invites: counts.invites }
}
