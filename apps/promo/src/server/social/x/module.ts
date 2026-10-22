import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { XReach } from "@/lib/social/x/options"
import type { XPostingState } from "@/lib/social/x/wording"

import { jobCounts, type JobCounts } from "../jobs"
import { ownedProject } from "../projects"
import { promoAccounts, promoJobs, promoVoices } from "../schema"
import { xSpend, type XSpend } from "./cost"
import { listXFinds, listXHidden, ownedXFind, readXFind, type XFindView, type XHiddenRow } from "./finds"
import { listXKeywords, type XKeywordView } from "./keywords"
import { readXPostingState, xHeldForMorning } from "./posting"
import { listXPosts } from "./posts"
import { answeredXIds, listXMentions, listXReplies, pastXAnswers, type PastXAnswer, type XReplyView } from "./replies"
import { promoXCommunities, promoXDrafts, promoXFinds, promoXKeywords, promoXPosts, promoXReplies } from "./schema"
import { listSearchers, type SearcherView } from "./searchers"

/**
 * What the X module on a project's dashboard reads when it opens: the
 * project's X accounts and whether each may post now, its keywords, the
 * counts on its tabs and on its row in the left column, the search accounts
 * and their views today, the month's AI spend, the hidden accounts and the
 * communities. One read, so the module opens with everything at once.
 */

export type XAccountView = {
  id: string
  /** Empty until a look has seen it signed in. */
  handle: string
  /** The browser profile it signs in inside, or "a phone". */
  runsIn: string | null
  onPhone: boolean
  paid: boolean
  /** The next reply starts as Help only, by the account's every-Nth-reply setting (part 24). */
  helpNext: boolean
  voice: { id: string; name: string } | null
  followers: number | null
  reach: XReach | ""
  blocked: boolean
  blockedReason: string
  posting: XPostingState
  /** Replies pressed and held back for the account's morning. */
  held: Array<{ replyId: string; runAfter: Date }>
}

export type XCounts = {
  /** Posts under the project's keywords nobody answered or skipped, fresh enough to answer, one per post. */
  toLook: number
  strong: number
  replied: number
  skipped: number
  /** Replies and mentions nobody has answered from Promo. */
  toAnswer: number
  /** Replies, quotes and posts that did not go out and nobody dealt with. */
  failed: number
}

export type XModuleView = {
  accounts: XAccountView[]
  /** X accounts in no project, for the accounts dropdown's Add. */
  freeAccounts: Array<{ id: string; handle: string }>
  keywords: XKeywordView[]
  hidden: XHiddenRow[]
  counts: XCounts
  spend: XSpend
  /** X is paused on this project. */
  paused: boolean
  /** The search accounts, without which nothing on X is read (parts 3 to 5). */
  searchers: SearcherView[]
  jobs: JobCounts
  communities: Array<{ communityId: string; name: string }>
}

export async function readXModuleView(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XModuleView> {
  const project = await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ account: promoAccounts, voiceName: promoVoices.name, profileName: promoProfiles.name })
    .from(promoAccounts)
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "x"), isNull(promoAccounts.retiredAt)))
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))

  const accounts: XAccountView[] = []
  for (const { account, voiceName, profileName } of rows) {
    if (account.projectId !== projectId) continue
    accounts.push({
      id: account.id,
      handle: account.handle,
      runsIn: profileName ?? (account.phoneId ? "a phone" : null),
      onPhone: Boolean(account.phoneId),
      paid: account.xPaid,
      helpNext: await helpNext(userId, account.id, account.xHelpEvery, db),
      voice: account.voiceId && voiceName !== null ? { id: account.voiceId, name: voiceName } : null,
      followers: account.followers,
      reach: account.xReach,
      blocked: account.blocked,
      blockedReason: account.blockedReason,
      posting: await readXPostingState(userId, account, db, now),
      held: await xHeldForMorning(userId, account.id, db, now),
    })
  }
  const communities = await db
    .select({ communityId: promoXCommunities.communityId, name: promoXCommunities.name })
    .from(promoXCommunities)
    .where(and(eq(promoXCommunities.userId, userId), eq(promoXCommunities.projectId, projectId)))
    .orderBy(asc(promoXCommunities.createdAt))

  return {
    accounts,
    freeAccounts: rows.filter((row) => row.account.projectId === null).map((row) => ({ id: row.account.id, handle: row.account.handle })),
    keywords: await listXKeywords(userId, projectId, db),
    hidden: await listXHidden(userId, db),
    counts: await readXCounts(userId, projectId, db, now),
    spend: await xSpend(userId, projectId, db, now),
    paused: project.pausedNetworks.includes("x"),
    searchers: await listSearchers(userId, db, now),
    jobs: await jobCounts(userId, db),
    communities: communities.map((row) => ({ communityId: row.communityId, name: row.name || `Community ${row.communityId}` })),
  }
}

/**
 * Whether the account's next reply is one of its every-Nth help-only ones
 * (part 24): with every 3rd, replies 3, 6 and 9 start as Help only. A person
 * can still switch it either way before Draft.
 */
async function helpNext(userId: string, accountId: string, every: number, db: CustomShellDb): Promise<boolean> {
  if (every <= 0) return false
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoXReplies)
    .where(
      and(
        eq(promoXReplies.userId, userId),
        eq(promoXReplies.accountId, accountId),
        inArray(promoXReplies.kind, ["reply", "quote"]),
        inArray(promoXReplies.status, ["waiting", "posted"])
      )
    )
  return ((row?.n ?? 0) + 1) % every === 0
}

/** The unanswered replies under the project's replies and posts, and its unanswered mentions. */
async function unansweredCount(userId: string, projectId: string, db: CustomShellDb): Promise<number> {
  const answered = await answeredXIds(userId, db)
  const replies = await db
    .select({ incoming: promoXReplies.incoming })
    .from(promoXReplies)
    .where(and(eq(promoXReplies.userId, userId), eq(promoXReplies.projectId, projectId), eq(promoXReplies.status, "posted")))
  const posts = await db
    .select({ incoming: promoXPosts.incoming })
    .from(promoXPosts)
    .where(and(eq(promoXPosts.userId, userId), eq(promoXPosts.projectId, projectId), eq(promoXPosts.status, "posted")))
  const mentions = await listXMentions(userId, projectId, db)
  return (
    [...replies, ...posts].reduce((sum, row) => sum + (row.incoming ?? []).filter((item) => !answered.has(item.id)).length, 0) +
    mentions.filter((mention) => !mention.answered).length
  )
}

/**
 * The counts on the module's tabs and its row in the left column (part 20):
 * the row says how many strong posts and unanswered replies wait.
 */
export async function readXCounts(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XCounts> {
  const toLook = await listXFinds(userId, { projectId, keywordId: null, tab: "new", limit: null }, db, now)
  const count = async (status: "commented" | "skipped") => {
    const [row] = await db
      .select({ n: sql<number>`count(DISTINCT ${promoXFinds.postId})::int` })
      .from(promoXFinds)
      .innerJoin(promoXKeywords, eq(promoXKeywords.id, promoXFinds.keywordId))
      .where(and(eq(promoXFinds.userId, userId), eq(promoXKeywords.projectId, projectId), eq(promoXFinds.status, status)))
    return row?.n ?? 0
  }
  const failedReplies = await listXReplies(userId, projectId, "failed", db, now)
  const [failedPosts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoXPosts)
    .leftJoin(promoJobs, eq(promoJobs.id, promoXPosts.jobId))
    .where(
      and(
        eq(promoXPosts.userId, userId),
        eq(promoXPosts.projectId, projectId),
        eq(promoXPosts.status, "failed"),
        isNull(promoXPosts.deletedAt),
        isNull(promoJobs.dismissedAt)
      )
    )
  return {
    toLook: toLook.length,
    strong: toLook.filter((find) => find.band === "strong").length,
    replied: await count("commented"),
    skipped: await count("skipped"),
    toAnswer: await unansweredCount(userId, projectId, db),
    failed: failedReplies.length + (failedPosts?.n ?? 0),
  }
}

export type XFindDetail = XFindView & {
  readAt: Date | null
  /** A read of the post is waiting or running. */
  reading: boolean
  drafts: Array<{ id: string; text: string; kind: "reply" | "quote"; replyToId: string; helpOnly: boolean; rewrite: string; createdAt: Date }>
  past: PastXAnswer[]
  /** What the person's accounts already sent on this post. */
  sentHere: XReplyView[]
}

/** One post for the right column: its words, its top replies, the drafts, what you said before, and what was sent. */
export async function readXFindDetail(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XFindDetail> {
  const find = await ownedXFind(userId, findId, db)
  const base = find ? await readXFind(userId, findId, db, now) : null
  if (!find || !base) throw new Error("That X post is no longer saved.")
  const drafts = await db
    .select()
    .from(promoXDrafts)
    .where(and(eq(promoXDrafts.userId, userId), eq(promoXDrafts.findId, find.id)))
    .orderBy(desc(promoXDrafts.createdAt))
    .limit(10)
  const [reading] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "x_read"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'findId' = ${find.id}`
      )
    )
    .limit(1)
  const replyIds = new Set([find.postId, ...(find.topReplies ?? []).map((reply) => reply.id)])
  const sent = [...(await listXReplies(userId, find.projectId, "sent", db, now)), ...(await listXReplies(userId, find.projectId, "failed", db, now))]
  return {
    ...base,
    readAt: find.readAt,
    reading: Boolean(reading),
    drafts: drafts.map((draft) => ({
      id: draft.id,
      text: draft.text,
      kind: draft.kind,
      replyToId: draft.replyToId,
      helpOnly: draft.helpOnly,
      rewrite: draft.rewrite,
      createdAt: draft.createdAt,
    })),
    past: await pastXAnswers(userId, { id: find.id, postId: find.postId, keywordId: find.keywordId, text: find.text }, db),
    sentHere: sent.filter((row) => row.kind !== "answer" && replyIds.has(row.targetId)),
  }
}

export type XToday = {
  /** The strongest posts waiting, best first, all under 12 hours old. */
  strong: XFindView[]
  /** Replies under ours and posts naming us nobody has answered from Promo yet. */
  toAnswer: Array<{
    under: { replyId: string } | { postRowId: string } | { mentionId: string }
    /** What it answers, in a few words. */
    about: string
    account: string
    incoming: { id: string; handle: string; text: string; likes: number; postedAt: string | null }
  }>
}

/** The Today tab of the X module (part 20): what is worth doing now, on this project. */
export async function readXToday(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XToday> {
  await ownedProject(userId, projectId, db)
  const strong = (await listXFinds(userId, { projectId, keywordId: null, tab: "new", limit: null }, db, now))
    .filter((find) => find.band === "strong")
    .slice(0, 10)
  const answered = await answeredXIds(userId, db)
  const toAnswer: XToday["toAnswer"] = []
  const replies = await db
    .select({ row: promoXReplies, handle: promoAccounts.handle })
    .from(promoXReplies)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoXReplies.accountId))
    .where(and(eq(promoXReplies.userId, userId), eq(promoXReplies.projectId, projectId), eq(promoXReplies.status, "posted")))
  for (const { row, handle } of replies) {
    for (const item of row.incoming ?? []) {
      if (!answered.has(item.id)) toAnswer.push({ under: { replyId: row.id }, about: row.text.slice(0, 120), account: handle, incoming: item })
    }
  }
  for (const post of await listXPosts(userId, projectId, db)) {
    for (const item of post.incoming ?? []) {
      if (!answered.has(item.id)) {
        toAnswer.push({ under: { postRowId: post.id }, about: post.pieces[0]?.text.slice(0, 120) ?? "", account: post.account?.handle ?? "", incoming: item })
      }
    }
  }
  for (const mention of await listXMentions(userId, projectId, db)) {
    if (mention.answered) continue
    toAnswer.push({
      under: { mentionId: mention.id },
      about: `Names @${mention.account.handle}`,
      account: mention.account.handle,
      incoming: { id: mention.postId, handle: mention.handle, text: mention.text, likes: mention.likes, postedAt: mention.postedAt?.toISOString() ?? null },
    })
  }
  toAnswer.sort((a, b) => (b.incoming.postedAt ?? "").localeCompare(a.incoming.postedAt ?? ""))
  return { strong, toAnswer: toAnswer.slice(0, 30) }
}
