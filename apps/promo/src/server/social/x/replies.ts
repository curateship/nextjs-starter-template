import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { xPostUrl, type XIncoming, type XReplyKind } from "@/lib/social/x/options"
import { zoneClockText } from "@/lib/social/waking"
import { xMayHaveLanded, xPostingRefusal } from "@/lib/social/x/wording"

import { queueJob, TryAgainLater } from "../jobs"
import { noticeRung, ringBell } from "../notices"
import { promoAccounts, promoJobs } from "../schema"
import { titleWords } from "../title-words"
import { xCheck, xDelete, xEdit, xMentions, xQuote, xReply, xSearch, type XIncomingRead } from "./calls"
import { refuseXInteraction } from "../apart"
import { markPostReplied } from "./finds"
import { queueFollowBack } from "./follows"
import {
  queueXAnswer,
  queueXReply,
  readXPostingState,
  refuseReplyWords,
  refuseXOnPhone,
  xWritingAccount,
  type QueuedXReply,
} from "./posting"
import { promoXFinds, promoXMentions, promoXPosts, promoXReplies } from "./schema"
import type { XReader } from "./search"
import { spendViews } from "./searchers"
import { closestXPiece, similarWarning } from "./similar"

/**
 * The replies, quotes and answers that went out on X, or tried to (parts
 * 23, 37, 38, 39 and 40): sending one from the account's browser or phone,
 * the Replies tab, reading each one again once a day through a search
 * account, the replies and mentions people wrote back, editing (paid
 * accounts) and deleting, and the Failed list with Try again.
 */

type ReplyRow = typeof promoXReplies.$inferSelect

/** A sent reply or post is read again once this long after its last reading. */
const CHECK_EVERY_MS = 24 * 3_600_000

/** One pass of the ticker asks for at most this many checks for a person. */
const CHECKS_PER_PASS = 20

/** X lets a paid account edit a post for an hour after it went out. */
const EDIT_WINDOW_MS = 60 * 60_000

/** How many mentions one read takes in at most. */
const MENTIONS_MAX = 20

function iso(seconds: number | null): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

/** The replies under ours as the app stores them, our own account's left out. */
export function incomingFrom(reads: XIncomingRead[], ownHandle: string): XIncoming[] {
  return reads
    .filter((item) => item.handle.toLowerCase() !== ownHandle.toLowerCase())
    .map((item) => ({
      id: item.id,
      handle: item.handle,
      name: item.name,
      text: item.text,
      likes: item.likes,
      postedAt: iso(item.postedSeconds),
    }))
}

/**
 * Sends one waiting reply, quote or answer from its account's browser or
 * phone. The row says what happened either way, and a failure is thrown on
 * so the job fails and the bell rings. Never tried twice: the job is a write.
 */
export async function runXReply(
  userId: string,
  replyId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoXReplies)
    .where(and(eq(promoXReplies.id, replyId), eq(promoXReplies.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That reply was taken back before it went.")
  if (row.status !== "waiting") throw new Refusal("That reply has been dealt with already.")
  // Only the send itself can fail the row. Once X has it, nothing after may
  // mark it failed, or Try again would send it a second time.
  let sent: { postId: string; url: string }
  try {
    sent =
      row.kind === "quote"
        ? await xQuote(target, { postId: row.targetId, text: row.text })
        : await xReply(target, { replyToId: row.targetId, text: row.text })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoXReplies)
      .set({ status: "failed", lastError: message.slice(0, 2_000) })
      .where(eq(promoXReplies.id, row.id))
    throw error
  }
  const postId = /^\d{5,25}$/.test(sent.postId) ? sent.postId : ""
  await db
    .update(promoXReplies)
    .set({
      status: "posted",
      postId,
      postUrl: postId ? (/^https:\/\/(x|twitter)\.com\//.test(sent.url) ? sent.url.slice(0, 300) : xPostUrl(postId)) : "",
      postedAt: now,
      lastError: "",
    })
    .where(eq(promoXReplies.id, row.id))
  await db.update(promoAccounts).set({ lastPostedAt: now }).where(eq(promoAccounts.id, row.accountId))
  if (row.findId) {
    const [find] = await db.select({ postId: promoXFinds.postId }).from(promoXFinds).where(eq(promoXFinds.id, row.findId)).limit(1)
    if (find) await markPostReplied(userId, find.postId, db)
  }
  // A reply, not a quote: following the person replied to is part 44, only
  // when the account has it switched on, and never inside the visit.
  if (row.kind !== "quote" && row.targetHandle) {
    await queueFollowBack(userId, row.accountId, row.targetHandle, db, now)
  }
  // The X app on a phone does not always show where a reply landed, so a
  // search account looks it up a minute later.
  if (!postId) {
    try {
      await queueJob(userId, "x_check", { replyId: row.id }, db, new Date(now.getTime() + 60_000))
    } catch (error) {
      console.warn(`X reply ${row.id} went out, but its address can't be looked up: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export type XReplyView = {
  id: string
  kind: XReplyKind
  account: { id: string; handle: string; paid: boolean; onPhone: boolean } | null
  targetId: string
  targetUrl: string
  targetHandle: string
  targetText: string
  text: string
  helpOnly: boolean
  similarTo: string
  status: ReplyRow["status"]
  postUrl: string
  lastError: string
  /** Null until read; "not read yet" is never shown as 0 or "gone". */
  views: number | null
  likes: number | null
  replyCount: number | null
  stillVisible: boolean | null
  checkedAt: Date | null
  /** The replies under ours, each saying whether Promo answered it, null until a check has read them. */
  incoming: Array<XIncoming & { answered: boolean }> | null
  /** The ones of those nobody has answered from Promo yet. */
  toAnswer: number
  /** For an answer: what it answered. */
  replyTo: XIncoming | null
  editedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  postedAt: Date | null
  /** True while a paid account may still edit it on X. */
  canEdit: boolean
  /** True when the failed one may be on X anyway, because the browser stopped after Post. */
  mayHaveLanded: boolean
}

/** The ids of posts Promo already answered or is answering. */
export async function answeredXIds(userId: string, db: CustomShellDb): Promise<Set<string>> {
  const rows = await db
    .select({ targetId: promoXReplies.targetId })
    .from(promoXReplies)
    .where(
      and(eq(promoXReplies.userId, userId), eq(promoXReplies.kind, "answer"), inArray(promoXReplies.status, ["waiting", "posted"]))
    )
  return new Set(rows.map((row) => row.targetId))
}

/** How many replies under a row nobody has answered. */
export function toAnswerCount(incoming: XIncoming[] | null, answered: Set<string>): number {
  return (incoming ?? []).filter((item) => !answered.has(item.id)).length
}

function view(
  row: ReplyRow,
  account: { handle: string; paid: boolean; onPhone: boolean } | null,
  answered: Set<string>,
  now: Date
): XReplyView {
  return {
    id: row.id,
    kind: row.kind,
    account: account === null ? null : { id: row.accountId, handle: account.handle, paid: account.paid, onPhone: account.onPhone },
    targetId: row.targetId,
    targetUrl: row.targetUrl,
    targetHandle: row.targetHandle,
    targetText: row.targetText,
    text: row.text,
    helpOnly: row.helpOnly,
    similarTo: row.similarTo,
    status: row.status,
    postUrl: row.postUrl,
    lastError: row.lastError,
    views: row.views,
    likes: row.likes,
    replyCount: row.replyCount,
    stillVisible: row.stillVisible,
    checkedAt: row.checkedAt,
    incoming: row.incoming?.map((item) => ({ ...item, answered: answered.has(item.id) })) ?? null,
    toAnswer: toAnswerCount(row.incoming, answered),
    replyTo: row.replyTo,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    canEdit: Boolean(
      account?.paid && row.status === "posted" && row.postId && !row.deletedAt && row.postedAt && now.getTime() - row.postedAt.getTime() < EDIT_WINDOW_MS
    ),
    mayHaveLanded: row.status === "failed" && xMayHaveLanded(row.lastError),
  }
}

/**
 * The Replies tab: every reply, quote and answer this project's accounts
 * sent, newest first (`sent`), or the ones that did not go out and nobody
 * has dealt with yet (`failed`).
 */
export async function listXReplies(
  userId: string,
  projectId: string,
  list: "sent" | "failed",
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XReplyView[]> {
  const rows = await db
    .select({ row: promoXReplies, handle: promoAccounts.handle, paid: promoAccounts.xPaid, phoneId: promoAccounts.phoneId, dismissedAt: promoJobs.dismissedAt })
    .from(promoXReplies)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoXReplies.accountId))
    .leftJoin(promoJobs, eq(promoJobs.id, promoXReplies.jobId))
    .where(
      and(
        eq(promoXReplies.userId, userId),
        eq(promoXReplies.projectId, projectId),
        list === "failed" ? eq(promoXReplies.status, "failed") : ne(promoXReplies.status, "failed")
      )
    )
    .orderBy(desc(promoXReplies.createdAt))
    .limit(300)
  const answered = await answeredXIds(userId, db)
  return rows
    .filter((item) => list !== "failed" || !item.dismissedAt)
    .map((item) =>
      view(item.row, item.handle === null ? null : { handle: item.handle, paid: Boolean(item.paid), onPhone: Boolean(item.phoneId) }, answered, now)
    )
}

/** A reply of the person's, or a refusal. */
async function ownedReply(userId: string, replyId: string, db: CustomShellDb): Promise<ReplyRow> {
  const [row] = await db
    .select()
    .from(promoXReplies)
    .where(and(eq(promoXReplies.id, replyId), eq(promoXReplies.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That reply is not one Promo sent.")
  return row
}

export type PastXAnswer = { id: string; targetText: string; text: string; likes: number | null; postUrl: string; postedAt: Date | null }

/**
 * What you said before on posts like this one (part 23): up to three
 * replies that landed and are still up, under the same keyword first, then
 * by how many words their post shares with this one. The same rule as
 * Reddit's and Medium's past answers, over X's own replies.
 */
export async function pastXAnswers(
  userId: string,
  find: { id: string; postId: string; keywordId: string; text: string },
  db: CustomShellDb = defaultDb
): Promise<PastXAnswer[]> {
  const rows = await db
    .select({
      id: promoXReplies.id,
      targetText: promoXReplies.targetText,
      text: promoXReplies.text,
      likes: promoXReplies.likes,
      postUrl: promoXReplies.postUrl,
      postedAt: promoXReplies.postedAt,
      keywordId: promoXFinds.keywordId,
    })
    .from(promoXReplies)
    .leftJoin(promoXFinds, eq(promoXFinds.id, promoXReplies.findId))
    .where(
      and(
        eq(promoXReplies.userId, userId),
        eq(promoXReplies.status, "posted"),
        ne(promoXReplies.kind, "answer"),
        isNull(promoXReplies.deletedAt),
        ne(promoXReplies.targetId, find.postId)
      )
    )
    .orderBy(desc(promoXReplies.postedAt))
    .limit(300)
  const wanted = titleWords(find.text)
  return rows
    .map((row) => {
      const shared = [...titleWords(row.targetText)].filter((word) => wanted.has(word)).length
      return { row, score: (row.keywordId === find.keywordId ? 100 : 0) + shared }
    })
    // A reply under another keyword sharing one word is a coincidence.
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ row }) => ({
      id: row.id,
      targetText: row.targetText,
      text: row.text,
      likes: row.likes,
      postUrl: row.postUrl,
      postedAt: row.postedAt,
    }))
}

/**
 * Asks for a fresh reading of sent replies and posts: the ones named, or,
 * from the ticker, those whose last reading is a day old. Read through a
 * search account, so the check is how a stranger sees them.
 */
export async function queueXChecks(
  userId: string,
  named: { replyIds?: string[]; postIds?: string[] } | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const stale = new Date(now.getTime() - CHECK_EVERY_MS)
  const replies =
    named && !named.replyIds?.length
      ? []
      : await db
          .select({ id: promoXReplies.id })
          .from(promoXReplies)
          .where(
            and(
              eq(promoXReplies.userId, userId),
              eq(promoXReplies.status, "posted"),
              isNull(promoXReplies.deletedAt),
              named?.replyIds
                ? inArray(promoXReplies.id, named.replyIds)
                : or(isNull(promoXReplies.checkedAt), lt(promoXReplies.checkedAt, stale))
            )
          )
          .limit(named ? 50 : CHECKS_PER_PASS)
  const posts =
    named && !named.postIds?.length
      ? []
      : await db
          .select({ id: promoXPosts.id })
          .from(promoXPosts)
          .where(
            and(
              eq(promoXPosts.userId, userId),
              eq(promoXPosts.status, "posted"),
              isNull(promoXPosts.deletedAt),
              named?.postIds ? inArray(promoXPosts.id, named.postIds) : or(isNull(promoXPosts.checkedAt), lt(promoXPosts.checkedAt, stale))
            )
          )
          .limit(named ? 50 : CHECKS_PER_PASS)
  const waiting = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "x_check"), inArray(promoJobs.status, ["queued", "running"])))
  const already = new Set(waiting.map((job) => String(job.payload?.replyId ?? job.payload?.postRowId ?? "")))
  let queued = 0
  for (const row of replies) {
    if (already.has(row.id)) continue
    await queueJob(userId, "x_check", { replyId: row.id }, db)
    queued += 1
  }
  for (const row of posts) {
    if (already.has(row.id)) continue
    await queueJob(userId, "x_check", { postRowId: row.id }, db)
    queued += 1
  }
  return queued
}

/** The address a reply's notices open: the Replies tab of its project with it open. */
function replyHref(projectId: string | null, rowId: string, tab: "replies" | "posts" = "replies"): string {
  return projectId
    ? `/admin/projects/${encodeURIComponent(projectId)}?network=x&tab=${tab}&open=${encodeURIComponent(rowId)}`
    : "/admin/projects"
}

/** Rings the bell once per new reply under one of ours (part 37). */
async function ringNewReplies(
  userId: string,
  incoming: XIncoming[],
  before: Set<string>,
  href: string,
  db: CustomShellDb,
  now: Date
): Promise<void> {
  for (const item of incoming) {
    // The person's id is in the notice's target, because X's ids are the same
    // for everyone and one person's notice must never stand in for another's.
    const target = `${userId}:${item.id}`
    if (before.has(item.id) || (await noticeRung("x_reply", target, db))) continue
    await ringBell(
      userId,
      {
        kind: "x_reply",
        targetId: target,
        message: `${NOTICE_HEADINGS.x_reply} from @${item.handle || "someone"}`,
        detail: item.text.slice(0, 300),
        href,
      },
      db,
      now
    )
  }
}

/**
 * Writes one fresh reading of a reply or a post of ours (part 37). A new
 * reply under it rings the bell once, as does one of ours that has gone:
 * hidden by the poster, folded away, removed by X, or deleted. A reply a
 * phone sent with no address is looked up first.
 */
export async function recordXCheck(
  userId: string,
  payload: Record<string, unknown>,
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const replyId = typeof payload.replyId === "string" ? payload.replyId : ""
  const postRowId = typeof payload.postRowId === "string" ? payload.postRowId : ""
  if (replyId) {
    const row = await ownedReply(userId, replyId, db)
    const [account] = await db.select({ handle: promoAccounts.handle }).from(promoAccounts).where(eq(promoAccounts.id, row.accountId)).limit(1)
    const handle = account?.handle ?? ""
    if (!row.postId) {
      await findSentReply(row, handle, reader, db, now)
      return
    }
    const read = await xCheck(reader.target, { postId: row.postId, handle })
    await spendViews(reader.searcher.id, read, db, now)
    const incoming = incomingFrom(read.incoming, handle)
    const before = new Set((row.incoming ?? []).map((item) => item.id))
    // A look that could not tell keeps what the last one said.
    const visible = read.found ? read.visible ?? row.stillVisible : false
    await db
      .update(promoXReplies)
      .set({
        // A number X did not show this time keeps the last one read, never 0.
        views: read.views ?? row.views,
        likes: read.likes ?? row.likes,
        replyCount: read.replies ?? row.replyCount,
        reposts: read.reposts ?? row.reposts,
        stillVisible: visible,
        checkedAt: now,
        ...(read.found ? { incoming } : {}),
      })
      .where(eq(promoXReplies.id, row.id))
    const href = replyHref(row.projectId, row.id)
    if (row.stillVisible !== false && visible === false && !row.deletedAt) {
      await ringBell(
        userId,
        {
          kind: "x_gone",
          targetId: row.id,
          message: `${NOTICE_HEADINGS.x_gone} your reply to @${row.targetHandle || "a post"}`,
          detail: read.found
            ? "It is folded behind \"Show more replies\" for a stranger, so almost nobody sees it."
            : "It no longer shows under the post. The poster or X hid it, or it was deleted.",
          href,
        },
        db,
        now
      )
    }
    await ringNewReplies(userId, incoming, before, href, db, now)
    return
  }
  if (!postRowId) throw new Error("That check names no reply or post.")
  const [post] = await db
    .select({ post: promoXPosts, handle: promoAccounts.handle })
    .from(promoXPosts)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoXPosts.accountId))
    .where(and(eq(promoXPosts.id, postRowId), eq(promoXPosts.userId, userId)))
    .limit(1)
  if (!post || post.post.status !== "posted") throw new Refusal("That post never landed, so there is nothing to read.")
  const handle = post.handle ?? ""
  const first = post.post.pieces[0]?.postId
  if (!first) {
    // A phone does not say where a post landed, so it is looked up by its words.
    const found = await findOwnPost(handle, post.post.pieces[0]?.text ?? "", reader, db, now)
    if (!found) {
      await db.update(promoXPosts).set({ checkedAt: now }).where(eq(promoXPosts.id, post.post.id))
      notFoundYet()
    }
    const pieces = post.post.pieces.map((piece, index) => (index === 0 ? { ...piece, postId: found } : piece))
    await db.update(promoXPosts).set({ pieces, updatedAt: now }).where(eq(promoXPosts.id, post.post.id))
    return
  }
  const read = await xCheck(reader.target, { postId: first, handle })
  await spendViews(reader.searcher.id, read, db, now)
  const incoming = incomingFrom(read.incoming, handle)
  const before = new Set((post.post.incoming ?? []).map((item) => item.id))
  await db
    .update(promoXPosts)
    .set({
      views: read.views ?? post.post.views,
      likes: read.likes ?? post.post.likes,
      replyCount: read.replies ?? post.post.replyCount,
      reposts: read.reposts ?? post.post.reposts,
      stillVisible: read.found,
      checkedAt: now,
      ...(read.found ? { incoming } : {}),
      ...(post.post.poll && read.pollVotes ? { poll: { ...post.post.poll, votes: read.pollVotes } } : {}),
    })
    .where(eq(promoXPosts.id, post.post.id))
  const postHref = replyHref(post.post.projectId, post.post.id, "posts")
  if (post.post.stillVisible !== false && !read.found && !post.post.deletedAt) {
    await ringBell(
      userId,
      {
        kind: "x_gone",
        targetId: post.post.id,
        message: `${NOTICE_HEADINGS.x_gone} your post "${(post.post.pieces[0]?.text ?? "").slice(0, 60)}"`,
        detail: "It no longer shows on X. X removed it, or it was deleted.",
        href: postHref,
      },
      db,
      now
    )
  }
  await ringNewReplies(userId, incoming, before, postHref, db, now)
}

/**
 * X's id for a post the account sent from a phone, found by the account's
 * name and its opening words through X's own search. Not found yet is tried
 * again a little later, up to three tries in all, since a new post can take
 * a moment to show.
 */
async function findOwnPost(handle: string, text: string, reader: XReader, db: CustomShellDb, now: Date): Promise<string | null> {
  if (!handle) throw new Refusal("That account has no X name yet, so what it sent can't be looked up.")
  const opening = sameWords(text).split(" ").slice(0, 8).join(" ")
  const read = await xSearch(reader.target, { kind: "search", value: `from:${handle} "${opening}"`, max: 10 })
  await spendViews(reader.searcher.id, read, db, now)
  const found = read.posts.find(
    (post) => post.authorHandle.toLowerCase() === handle.toLowerCase() && sameWords(post.text).startsWith(opening.slice(0, 40))
  )
  return found ? found.postId.slice(0, 25) : null
}

/** Words as both sides are compared: lower case, quotes and line breaks as single spaces. */
function sameWords(text: string): string {
  return text.toLowerCase().replace(/["“”\s]+/g, " ").trim()
}

/** Not found yet is tried again a little later; the day's check is written, so the ticker does not ask every pass. */
function notFoundYet(): never {
  throw new TryAgainLater("It does not show in X's search yet.", 5 * 60_000)
}

/** Finds and writes the id of a reply a phone sent. */
async function findSentReply(row: ReplyRow, handle: string, reader: XReader, db: CustomShellDb, now: Date): Promise<void> {
  const postId = await findOwnPost(handle, row.text, reader, db, now)
  if (!postId) {
    await db.update(promoXReplies).set({ checkedAt: now }).where(eq(promoXReplies.id, row.id))
    notFoundYet()
  }
  await db.update(promoXReplies).set({ postId, postUrl: xPostUrl(postId, handle) }).where(eq(promoXReplies.id, row.id))
}

/**
 * Asks for each X account's mentions once a day (part 39): posts naming it
 * as @handle that are not replies under one of ours, read through a search
 * account.
 */
export async function queueMentionReads(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const accounts = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "x"), ne(promoAccounts.handle, ""), isNull(promoAccounts.retiredAt)))
  const waiting = await db
    .select({ payload: promoJobs.payload, createdAt: promoJobs.createdAt })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "x_mentions"), sql`${promoJobs.createdAt} > ${new Date(now.getTime() - CHECK_EVERY_MS).toISOString()}::timestamptz`))
  const recent = new Set(waiting.map((job) => String(job.payload?.accountId ?? "")))
  let queued = 0
  for (const account of accounts) {
    if (recent.has(account.id)) continue
    await queueJob(userId, "x_mentions", { accountId: account.id }, db)
    queued += 1
  }
  return queued
}

/** Reads one account's mentions and keeps the new ones, ringing the bell once each. */
export async function recordXMentions(
  userId: string,
  accountId: string,
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [account] = await db
    .select({ handle: promoAccounts.handle, projectId: promoAccounts.projectId })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "x")))
    .limit(1)
  if (!account?.handle) throw new Refusal("That X account has no name yet, so nobody can name it.")
  const read = await xMentions(reader.target, { handle: account.handle, max: Math.min(MENTIONS_MAX, Math.max(1, reader.searcher.viewsLeft)) })
  await spendViews(reader.searcher.id, read, db, now)
  // A reply under one of ours is already read by the reply's own check.
  const ours = await db
    .select({ postId: promoXReplies.postId })
    .from(promoXReplies)
    .where(and(eq(promoXReplies.userId, userId), eq(promoXReplies.accountId, accountId), ne(promoXReplies.postId, "")))
  const underOurs = new Set(
    (
      await db
        .select({ incoming: promoXReplies.incoming })
        .from(promoXReplies)
        .where(and(eq(promoXReplies.userId, userId), eq(promoXReplies.accountId, accountId)))
    ).flatMap((row) => (row.incoming ?? []).map((item) => item.id))
  )
  const own = new Set(ours.map((row) => row.postId))
  for (const item of read.incoming) {
    if (own.has(item.id) || underOurs.has(item.id) || item.handle.toLowerCase() === account.handle.toLowerCase()) continue
    const inserted = await db
      .insert(promoXMentions)
      .values({
        id: uuid(),
        userId,
        accountId,
        postId: item.id.slice(0, 25),
        handle: item.handle.slice(0, 20),
        name: item.name.slice(0, 200),
        text: item.text,
        likes: item.likes,
        postedAt: item.postedSeconds ? new Date(item.postedSeconds * 1000) : null,
        firstSeenAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: promoXMentions.id })
    const row = inserted[0]
    const target = `${userId}:${item.id}`
    if (!row || (await noticeRung("x_reply", target, db))) continue
    await ringBell(
      userId,
      {
        kind: "x_reply",
        targetId: target,
        message: `${NOTICE_HEADINGS.x_reply} from @${item.handle || "someone"}, naming @${account.handle}`,
        detail: item.text.slice(0, 300),
        href: account.projectId
          ? `/admin/projects/${encodeURIComponent(account.projectId)}?network=x&tab=replies&open=${encodeURIComponent(row.id)}`
          : "/admin/projects",
      },
      db,
      now
    )
  }
}

export type XMentionView = {
  id: string
  account: { id: string; handle: string; paid: boolean }
  postId: string
  url: string
  handle: string
  name: string
  text: string
  likes: number
  postedAt: Date | null
  answered: boolean
}

/** The project's accounts' mentions, newest first, for the Replies window (part 39). */
export async function listXMentions(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<XMentionView[]> {
  const rows = await db
    .select({ mention: promoXMentions, handle: promoAccounts.handle, paid: promoAccounts.xPaid })
    .from(promoXMentions)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoXMentions.accountId))
    .where(and(eq(promoXMentions.userId, userId), eq(promoAccounts.projectId, projectId)))
    .orderBy(desc(promoXMentions.firstSeenAt))
    .limit(100)
  const answered = await answeredXIds(userId, db)
  return rows.map(({ mention, handle, paid }) => ({
    id: mention.id,
    account: { id: mention.accountId, handle, paid },
    postId: mention.postId,
    url: xPostUrl(mention.postId, mention.handle),
    handle: mention.handle,
    name: mention.name,
    text: mention.text,
    likes: mention.likes,
    postedAt: mention.postedAt,
    answered: answered.has(mention.postId),
  }))
}

/**
 * Queues an edit or a delete of a sent reply or post (part 40), from the
 * account that wrote it. A delete works on any account. An edit only on an
 * account marked paid, within the hour X allows (part 27). An edit goes
 * through the same checks as a new reply, its new words included. A delete is
 * refused only by a pause. Both wait for the account's waking hours, as every
 * visit to X does.
 */
export async function queueXChange(
  userId: string,
  input: { replyId?: string; postRowId?: string; action: "edit" | "delete"; text?: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ jobId: string; similarTo: string }> {
  const kind = input.action === "edit" ? "x_edit" : "x_delete"
  let accountId: string
  let postedAt: Date | null
  if (input.replyId) {
    const row = await ownedReply(userId, input.replyId, db)
    if (row.status !== "posted" || !row.postId) throw new Refusal("Only a reply that landed can be changed.")
    if (row.deletedAt) throw new Refusal("That reply is deleted already.")
    if (input.action === "edit" && (input.text ?? "").trim() === row.text) throw new Refusal("Those are the words it has already.")
    accountId = row.accountId
    postedAt = row.postedAt
  } else if (input.postRowId) {
    const [post] = await db
      .select()
      .from(promoXPosts)
      .where(and(eq(promoXPosts.id, input.postRowId), eq(promoXPosts.userId, userId)))
      .limit(1)
    if (!post || post.status !== "posted" || !post.accountId || !post.pieces[0]?.postId) {
      throw new Refusal("Only a post that went out can be changed on X.")
    }
    if (post.deletedAt) throw new Refusal("That post is deleted already.")
    if (input.action === "edit") throw new Refusal("A post of your own is deleted and posted again rather than edited.")
    accountId = post.accountId
    postedAt = post.postedAt
  } else {
    throw new Error("Name the reply or the post to change.")
  }
  const owner = await xWritingAccount(userId, accountId, db)
  refuseXOnPhone(owner, input.action === "edit" ? "Editing on X" : "Deleting on X")
  let similarTo = ""
  if (input.action === "edit") {
    if (!owner.xPaid) {
      throw new Refusal("X lets only a paid account edit a post. Delete it and reply again, or mark the account as paid on the Accounts dashboard.")
    }
    if (!postedAt || now.getTime() - postedAt.getTime() >= EDIT_WINDOW_MS) {
      throw new Refusal("X allows an edit for one hour after posting, and that hour is over. Delete it and reply again instead.")
    }
    const text = refuseReplyWords(input.text ?? "", true)
    const [row] = input.replyId ? await db.select({ targetHandle: promoXReplies.targetHandle }).from(promoXReplies).where(eq(promoXReplies.id, input.replyId)).limit(1) : []
    await refuseXInteraction(userId, owner, { postAuthor: row?.targetHandle, words: [text] }, db)
    const close = await closestXPiece(userId, accountId, text, db)
    similarTo = close ? similarWarning(close) : ""
  }
  const state = await readXPostingState(userId, owner, db, now)
  // A delete takes something down, so only a pause holds it; the warm-up and
  // the pace are about putting things up, and must never trap a bad reply.
  // A pause is the first thing the posting words name.
  const refusal = input.action === "edit" || state.paused ? xPostingRefusal(state, now, state.timeZone) : null
  if (refusal) throw new Refusal(refusal)
  // Every change waits for the account's morning, like anything it does on X,
  // so an edit that would wake after X's hour to edit is refused now.
  if (input.action === "edit" && postedAt && state.nextWakeAt && state.nextWakeAt.getTime() >= postedAt.getTime() + EDIT_WINDOW_MS) {
    throw new Refusal(
      `The account is asleep until ${zoneClockText(state.nextWakeAt, state.timeZone)}, after X's hour to edit is over. Delete it and reply again instead.`
    )
  }
  const [busy] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, ["x_edit", "x_delete"]),
        inArray(promoJobs.status, ["queued", "running"]),
        input.replyId
          ? sql`${promoJobs.payload}->>'replyId' = ${input.replyId}`
          : sql`${promoJobs.payload}->>'postRowId' = ${input.postRowId ?? ""}`
      )
    )
    .limit(1)
  if (busy) throw new Refusal("A change to that one is already on its way.")
  const jobId = await queueJob(
    userId,
    kind,
    {
      accountId,
      ...(input.replyId ? { replyId: input.replyId } : { postRowId: input.postRowId }),
      ...(input.action === "edit" ? { text: (input.text ?? "").trim() } : {}),
    },
    db
  )
  return { jobId, similarTo }
}

/** Runs an edit or a delete in the account's browser and writes down what it found afterwards. */
export async function runXChange(
  userId: string,
  kind: "x_edit" | "x_delete",
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const replyId = typeof payload.replyId === "string" ? payload.replyId : ""
  const postRowId = typeof payload.postRowId === "string" ? payload.postRowId : ""
  const text = typeof payload.text === "string" ? payload.text : ""
  if (replyId) {
    const row = await ownedReply(userId, replyId, db)
    if (kind === "x_delete") {
      const { done } = await xDelete(target, { postId: row.postId })
      if (!done) throw new Error("Delete was pressed but the reply still shows on X. Look at it there.")
      await db.update(promoXReplies).set({ deletedAt: now, stillVisible: false }).where(eq(promoXReplies.id, row.id))
    } else {
      const { done, postId } = await xEdit(target, { postId: row.postId, text })
      if (!done) throw new Error("Save was pressed but X still shows the old words. Look at it there.")
      // X gives an edited post a new id, so later checks and deletes read the new version.
      const edited = postId && /^\d{5,25}$/.test(postId) ? { postId, postUrl: row.postUrl.replace(row.postId, postId) } : {}
      await db
        .update(promoXReplies)
        .set({ text, editedAt: now, originalText: row.originalText ?? row.text, ...edited })
        .where(eq(promoXReplies.id, row.id))
    }
    return
  }
  if (!postRowId || kind !== "x_delete") throw new Error("That change names no reply or post.")
  const [post] = await db
    .select()
    .from(promoXPosts)
    .where(and(eq(promoXPosts.id, postRowId), eq(promoXPosts.userId, userId)))
    .limit(1)
  if (!post) throw new Error("That post is not one Promo posted.")
  // A thread is deleted from its last piece back, so no piece is left
  // answering one that is gone.
  for (const piece of [...post.pieces].reverse()) {
    if (!piece.postId) continue
    const { done } = await xDelete(target, { postId: piece.postId })
    if (!done) throw new Error("Delete was pressed but the post still shows on X. Look at it there.")
  }
  await db.update(promoXPosts).set({ deletedAt: now, stillVisible: false, updatedAt: now }).where(eq(promoXPosts.id, post.id))
}

/** Takes a failed reply off the Failed list without sending it again. The record stays. */
export async function dismissFailedXReply(userId: string, replyId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const row = await ownedReply(userId, replyId, db)
  if (row.status !== "failed" || !row.jobId) throw new Error("That reply did not fail.")
  await db.update(promoJobs).set({ dismissedAt: new Date() }).where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId)))
}

/**
 * Try again on a failed reply (part 40): the same words, from the same
 * account, through every check a first press goes through. The first try's
 * record stays, off the Failed list. A first try that landed after all is
 * not sent twice: the browser looks for it under the post before typing,
 * and reports it as sent when it is there (`reply` in
 * `docker/browser/routines/x.py`).
 */
export async function retryFailedXReply(
  userId: string,
  replyId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedXReply> {
  const row = await ownedReply(userId, replyId, db)
  if (row.status !== "failed") throw new Error("That reply did not fail.")
  // The X app looks nowhere before it types, so a phone's failure that may
  // have landed is never sent again from here (nothing is tried twice).
  const [sender] = await db.select({ phoneId: promoAccounts.phoneId }).from(promoAccounts).where(eq(promoAccounts.id, row.accountId)).limit(1)
  if (sender?.phoneId && xMayHaveLanded(row.lastError)) {
    throw new Refusal("This went from a phone and may already be on X. Look under the post on X first. If it isn't there, Dismiss this one and write it again.")
  }
  // Taken off the Failed list first, and only once, so a second press or a
  // stale tab cannot send the same words again after the first try lands.
  if (row.jobId) {
    const taken = await db
      .update(promoJobs)
      .set({ dismissedAt: now })
      .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), isNull(promoJobs.dismissedAt)))
      .returning({ id: promoJobs.id })
    if (!taken.length) throw new Refusal("That reply was already tried again or dismissed.")
  }
  try {
    if (row.kind === "answer") {
      if (!row.replyTo) throw new Error("That answer no longer says what it answered.")
      if (row.parentId) {
        return await queueXAnswer(userId, { under: { replyId: row.parentId }, incomingId: row.replyTo.id, text: row.text }, db, now)
      }
      const [mention] = await db
        .select({ id: promoXMentions.id })
        .from(promoXMentions)
        .where(and(eq(promoXMentions.userId, userId), eq(promoXMentions.accountId, row.accountId), eq(promoXMentions.postId, row.replyTo.id)))
        .limit(1)
      if (mention) return await queueXAnswer(userId, { under: { mentionId: mention.id }, text: row.text }, db, now)
      const [post] = await db
        .select({ id: promoXPosts.id })
        .from(promoXPosts)
        .where(and(eq(promoXPosts.userId, userId), sql`${promoXPosts.incoming} @> ${JSON.stringify([{ id: row.replyTo.id }])}::jsonb`))
        .limit(1)
      if (!post) throw new Refusal("What this answered is not saved any more, so it can't be sent from here again.")
      return await queueXAnswer(userId, { under: { postRowId: post.id }, incomingId: row.replyTo.id, text: row.text }, db, now)
    }
    if (!row.findId) throw new Refusal("The post this was for has been tidied away, so it can't be sent from here again.")
    const [find] = await db.select({ postId: promoXFinds.postId }).from(promoXFinds).where(eq(promoXFinds.id, row.findId)).limit(1)
    return await queueXReply(
      userId,
      {
        findId: row.findId,
        accountId: row.accountId,
        text: row.text,
        kind: row.kind === "quote" ? "quote" : "reply",
        ...(find && row.targetId !== find.postId ? { underReplyId: row.targetId } : {}),
        helpOnly: row.helpOnly,
      },
      db,
      now
    )
  } catch (error) {
    // Refused, so it stays on the Failed list to try again later.
    if (row.jobId) await db.update(promoJobs).set({ dismissedAt: null }).where(eq(promoJobs.id, row.jobId))
    throw error
  }
}
