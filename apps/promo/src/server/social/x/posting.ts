import { and, asc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"
import { paceCounts, paceLimit } from "@/lib/social/pace"
import { isAwake, nextWakeAt } from "@/lib/social/waking"
import { holdsLink, X_WARM_UP_DAYS, xLength, xPostLimit, xPostUrl, type XIncoming, type XReplyKind } from "@/lib/social/x/options"
import { xPostingRefusal, type XPostingState } from "@/lib/social/x/wording"

import { refuseXInteraction } from "../apart"
import { accountTimeZone, isYoung, readBehaviour, warmUpEndsAt } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { ownedXFind } from "./finds"
import { promoXDrafts, promoXFinds, promoXMentions, promoXPosts, promoXReplies } from "./schema"
import { readXSettings } from "./searchers"
import { closestXPiece, similarWarning } from "./similar"

/**
 * Whether an X account may post now, and sending a reply, a quote or an
 * answer (parts 21, 26, 27, 28, 34, 38 and 39).
 *
 * Tyler's answers of 21 Oct 2026 decide the checks:
 *
 * - **Warm-up is 7 days.** Counted from when X says the account joined, or
 *   from when Promo first saw it signed in.
 * - **Pace: "100 a day (but I can set it to what I like)".** A young
 *   account, under the young days in Settings → Behaviour, sends at most the
 *   replies a day and an hour under X there (100 and 10 to begin with).
 *   Replies, quotes, answers and posts of its own all count: each is the
 *   account posting on X.
 * - **Never a link in a reply.** Refused before anything is queued.
 * - **Too similar warns only.** The warning is written on the reply; Post
 *   still goes.
 * - **One of your accounts per post.** Two of the person's accounts never
 *   meet under one post.
 *
 * Outside the account's waking hours a reply is not refused: it waits for
 * its morning. Nothing here posts. A person pressing Post is the only way a
 * reply is written, and it can be taken back for ten seconds.
 */

type AccountRow = typeof promoAccounts.$inferSelect

const DAY_MS = 86_400_000

/** Ten seconds to undo, the number Tyler picked for Reddit on 12 Oct 2026. */
const UNDO_SECONDS = 10

/** The X write jobs that count against an account's pace while they wait. */
const PACED_KINDS = ["x_reply", "x_publish"] as const

/** The account's X posts that went out in the last day, and what is waiting to go. */
async function recentPosting(
  userId: string,
  accountId: string,
  db: CustomShellDb,
  now: Date
): Promise<{ posted: Date[]; waiting: number }> {
  const since = new Date(now.getTime() - DAY_MS)
  const replies = await db
    .select({ at: promoXReplies.postedAt })
    .from(promoXReplies)
    .where(
      and(
        eq(promoXReplies.userId, userId),
        eq(promoXReplies.accountId, accountId),
        eq(promoXReplies.status, "posted"),
        gte(promoXReplies.postedAt, since)
      )
    )
  const posts = await db
    .select({ at: promoXPosts.postedAt, pieces: promoXPosts.pieces })
    .from(promoXPosts)
    .where(
      and(
        eq(promoXPosts.userId, userId),
        eq(promoXPosts.accountId, accountId),
        eq(promoXPosts.status, "posted"),
        gte(promoXPosts.postedAt, since)
      )
    )
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, [...PACED_KINDS]),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
  // A thread waiting to go counts each of its posts still to go, beside its one job.
  const waitingPosts = await db
    .select({ pieces: promoXPosts.pieces })
    .from(promoXPosts)
    .where(and(eq(promoXPosts.userId, userId), eq(promoXPosts.accountId, accountId), eq(promoXPosts.status, "waiting")))
  const waitingExtra = waitingPosts.reduce((sum, row) => sum + Math.max(0, row.pieces.filter((piece) => !piece.postId).length - 1), 0)
  // Each post of a thread is a post on X, so a thread of five counts five.
  // A phone's post has no id yet and counts one.
  const posted = [...replies, ...posts.flatMap((row) => Array.from({ length: Math.max(1, row.pieces.filter((piece) => piece.postId).length) }, () => row))]
    .flatMap((row) => (row.at ? [row.at] : []))
    .sort((a, b) => a.getTime() - b.getTime())
  return { posted, waiting: (pending?.n ?? 0) + waitingExtra }
}

/** When an X account's age counts from: when X says it joined, else when Promo first saw it signed in. */
export function xAccountBorn(account: Pick<AccountRow, "xJoinedAt" | "signedInAt">): Date | null {
  return account.xJoinedAt ?? account.signedInAt
}

export async function readXPostingState(
  userId: string,
  account: Pick<AccountRow, "id" | "profileId" | "phoneId" | "xJoinedAt" | "signedInAt" | "pausedAt" | "projectId" | "platform">,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XPostingState> {
  const behaviour = await readBehaviour(userId, db)
  const settings = await readXSettings(userId, db)
  const timeZone = await accountTimeZone(account, db)
  const born = xAccountBorn(account)
  const ends = warmUpEndsAt(born, X_WARM_UP_DAYS, now)
  const young = isYoung(born, behaviour.youngDays, now)
  const { posted, waiting } = await recentPosting(userId, account.id, db, now)
  return {
    paused: await pausedBy(userId, account, db),
    timeZone,
    awake: isAwake(now, timeZone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute),
    nextWakeAt: nextWakeAt(now, timeZone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute),
    warmUp: { endsAt: ends ?? null, ageUnknown: ends === undefined },
    young,
    ...paceCounts(posted, now),
    warnPerHour: behaviour.warnPerHour,
    perHour: settings.repliesPerHour,
    perDay: settings.repliesPerDay,
    limit: young
      ? paceLimit({ posted, waiting, now, perHour: settings.repliesPerHour, perDay: settings.repliesPerDay })
      : null,
  }
}

/** An X account of the person's, still in use, or a refusal saying what is wrong with it. */
export async function xWritingAccount(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<AccountRow> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "x") throw new Refusal("Pick an X account first.")
  if (account.retiredAt) throw new Refusal("This account is retired. Bring it back on the Accounts dashboard first.")
  if (!account.profileId && !account.phoneId) {
    throw new Refusal("This X account has no browser profile or phone. Pick where it runs on the Accounts dashboard.")
  }
  if (!account.handle) {
    throw new Refusal("Promo has not seen this account signed in to X. Sign it in, then press Check now on the Accounts dashboard.")
  }
  if (account.banScreenAt) {
    throw new Refusal(`This account hit a lock screen and was stopped: "${account.blockedReason}". Let it run again from the Accounts dashboard once it is sorted.`)
  }
  return account
}

/**
 * Refuses what the X app on a phone does not do. On a phone the app reads
 * who is signed in, replies, quotes, posts one piece at a time with a
 * picture, follows and warms up; a community, a poll, an edit, a delete, a
 * list and the browser's message reading need the account on a browser
 * profile.
 */
export function refuseXOnPhone(account: Pick<AccountRow, "phoneId" | "handle">, what: string): void {
  if (!account.phoneId) return
  throw new Refusal(
    `${account.handle ? handleWords("x", account.handle) : "This account"} runs on a phone, and the X app there replies, quotes, posts and follows only. ${what} needs an X account on a browser profile. Nothing was sent.`
  )
}

/**
 * Refuses when one of the person's accounts already replied to or quoted
 * this post, or has one on its way. Every project counts: two accounts from
 * two projects meeting under one post is the same link. Replies under the
 * post's top replies count as under the post.
 */
export async function refuseSecondAccountOnPost(
  userId: string,
  accountId: string,
  postId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [other] = await db
    .select({ handle: promoAccounts.handle })
    .from(promoXReplies)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoXReplies.accountId))
    .leftJoin(promoXFinds, eq(promoXFinds.id, promoXReplies.findId))
    .where(
      and(
        eq(promoXReplies.userId, userId),
        or(eq(promoXReplies.targetId, postId), eq(promoXFinds.postId, postId)),
        sql`${promoXReplies.accountId} <> ${accountId}`,
        inArray(promoXReplies.status, ["waiting", "posted"]),
        isNull(promoXReplies.deletedAt)
      )
    )
    .limit(1)
  if (other) {
    throw new Refusal(
      `${other.handle ? handleWords("x", other.handle) : "Another of your accounts"} already replied to this post. One of your accounts per post, so they are never seen together. Nothing was sent.`
    )
  }
}

/** Refuses words that can't go out as a reply: empty, too long for the account, or holding a link. */
export function refuseReplyWords(text: string, paid: boolean, what = "reply"): string {
  const words = text.trim()
  if (!words) throw new Refusal(`Write the ${what} first.`)
  const limit = xPostLimit(paid)
  const length = xLength(words)
  if (length > limit) {
    throw new Refusal(
      paid
        ? `The ${what} is ${length} characters. Posts from here stop at ${limit}.`
        : `The ${what} is ${length} characters. X lets a free account post ${limit}. Shorten it, or mark the account as paid on the Accounts dashboard.`
    )
  }
  // Tyler, 21 Oct 2026: "Never in replies". Own posts may carry one.
  if (holdsLink(words)) throw new Refusal(`A ${what} never carries a link. Take the link out first.`)
  return words
}

export type QueuedXReply = {
  replyId: string
  jobId: string
  runAfter: Date | null
  undoUntil: Date | null
  /** The too-similar warning, or "" (part 28). It never stopped Post. */
  similarTo: string
}

type WritingRow = {
  kind: XReplyKind
  targetId: string
  targetUrl: string
  targetHandle: string
  targetText: string
  /** The post the one-account-per-post check guards: the find's post, or the answered post. */
  guardPostId: string
  /** Who wrote the post a top reply sits under, when answering a top reply. */
  threadAuthor?: string
  text: string
  helpOnly: boolean
  findId: string | null
  draftId: string | null
  parentId: string | null
  replyTo: XIncoming | null
  sentBy?: string | null
}

/** The checks every reply, quote and answer share, then the row and the job. */
async function queueXWriting(
  userId: string,
  account: AccountRow,
  row: WritingRow,
  db: CustomShellDb,
  now: Date
): Promise<QueuedXReply> {
  const text = refuseReplyWords(row.text, account.xPaid, row.kind === "quote" ? "quote" : row.kind === "answer" ? "answer" : "reply")
  await refuseXInteraction(userId, account, { postAuthor: row.targetHandle, words: [text] }, db)
  // Under a top reply, the thread is still the post's author's.
  if (row.threadAuthor && row.threadAuthor !== row.targetHandle) {
    await refuseXInteraction(userId, account, { postAuthor: row.threadAuthor, words: [] }, db)
  }
  const close = await closestXPiece(userId, account.id, text, db)
  const similarTo = close ? similarWarning(close) : ""
  // Checked and written under locks on the post and the account, so two
  // presses at once, from one account or two, cannot both pass the checks.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-x-post:${userId}:${row.guardPostId}`}))`)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-x-write:${account.id}`}))`)
    const [onItsWay] = await tx
      .select({ id: promoXReplies.id })
      .from(promoXReplies)
      .where(
        and(
          eq(promoXReplies.userId, userId),
          eq(promoXReplies.accountId, account.id),
          eq(promoXReplies.targetId, row.targetId),
          eq(promoXReplies.status, "waiting")
        )
      )
      .limit(1)
    if (onItsWay) throw new Refusal("A reply here is already on its way. Take it back first to send a different one.")

    const state = await readXPostingState(userId, account, tx, now)
    const refusal = xPostingRefusal(state, now, state.timeZone)
    if (refusal) throw new Refusal(refusal)
    if (row.kind !== "answer") await refuseSecondAccountOnPost(userId, account.id, row.guardPostId, tx)

    // A draft named by the browser counts only when it is the person's own.
    const [draft] = row.draftId
      ? await tx
          .select({ id: promoXDrafts.id })
          .from(promoXDrafts)
          .where(and(eq(promoXDrafts.id, row.draftId), eq(promoXDrafts.userId, userId)))
          .limit(1)
      : []
    const draftId = draft?.id ?? null

    const id = uuid()
    const jobId = uuid()
    const runAfter = state.nextWakeAt
    const undoUntil = runAfter ? null : new Date(now.getTime() + UNDO_SECONDS * 1000)
    await tx.insert(promoXReplies).values({
      id,
      userId,
      accountId: account.id,
      projectId: account.projectId,
      kind: row.kind,
      findId: row.findId,
      draftId,
      parentId: row.parentId,
      targetId: row.targetId.slice(0, 25),
      targetUrl: row.targetUrl.slice(0, 300),
      targetHandle: row.targetHandle.slice(0, 20),
      targetText: row.targetText.slice(0, 4_000),
      replyTo: row.replyTo,
      text,
      helpOnly: row.helpOnly,
      similarTo,
      status: "waiting",
      jobId,
      sentBy: row.sentBy ?? null,
      createdAt: now,
    })
    await queueJob(userId, "x_reply", { replyId: id, accountId: account.id }, tx, runAfter ?? undoUntil, jobId)
    if (draftId) await tx.update(promoXDrafts).set({ status: "sent" }).where(eq(promoXDrafts.id, draftId))
    return { replyId: id, jobId, runAfter, undoUntil, similarTo }
  })
}

/**
 * Queues a reply or a quote of a found post, or a reply under one of its top
 * replies (part 26), that a person pressed Post for, or refuses it with why.
 * The account must be one of the post's project's X accounts.
 */
export async function queueXReply(
  userId: string,
  input: {
    findId: string
    accountId: string
    text: string
    kind?: "reply" | "quote"
    /** A top reply to answer instead of the post. Not with a quote. */
    underReplyId?: string
    helpOnly?: boolean
    draftId?: string | null
    sentBy?: string | null
  },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedXReply> {
  const find = await ownedXFind(userId, input.findId, db)
  if (!find) throw new Error("That X post is no longer saved.")
  const account = await xWritingAccount(userId, input.accountId, db)
  if (account.projectId !== find.projectId) {
    throw new Refusal("That account is not in this post's project, so it does not reply here.")
  }
  const kind = input.kind ?? "reply"
  if (kind === "reply" && !find.repliesOpen) {
    throw new Refusal("The poster limited who can reply to this post, so it can't be answered. Quote it instead, or skip it.")
  }
  let target = { id: find.postId, url: find.url, handle: find.authorHandle, text: find.text }
  if (input.underReplyId) {
    if (kind === "quote") throw new Refusal("A quote is of the post itself, not of one of its replies.")
    const top = (find.topReplies ?? []).find((reply) => reply.id === input.underReplyId)
    if (!top) throw new Refusal("That reply is not one of the post's top replies as Promo read them. Read the post again.")
    target = { id: top.id, url: xPostUrl(top.id, top.handle), handle: top.handle, text: top.text }
  }
  return queueXWriting(
    userId,
    account,
    {
      kind,
      targetId: target.id,
      targetUrl: target.url,
      targetHandle: target.handle,
      targetText: target.text,
      guardPostId: find.postId,
      threadAuthor: find.authorHandle,
      text: input.text,
      helpOnly: Boolean(input.helpOnly),
      findId: find.id,
      draftId: input.draftId ?? null,
      parentId: null,
      replyTo: null,
      sentBy: input.sentBy,
    },
    db,
    now
  )
}

/** Where an answer goes: under one of our replies, under one of our own posts, or to a post that named the account. */
export type AnswerUnder = { replyId: string } | { postRowId: string } | { mentionId: string }

/**
 * Queues an answer to somebody who replied under one of the account's own
 * replies or posts (part 38), or who named the account (part 39). It goes
 * out from the account they answered or named, under their post.
 */
export async function queueXAnswer(
  userId: string,
  input: { under: AnswerUnder; incomingId?: string; text: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedXReply> {
  let accountId: string
  let parentId: string | null = null
  let reply: XIncoming | undefined
  if ("replyId" in input.under) {
    const [parent] = await db
      .select()
      .from(promoXReplies)
      .where(and(eq(promoXReplies.id, input.under.replyId), eq(promoXReplies.userId, userId)))
      .limit(1)
    if (!parent || parent.status !== "posted") throw new Error("That reply is not one Promo sent.")
    accountId = parent.accountId
    parentId = parent.id
    reply = (parent.incoming ?? []).find((item) => item.id === input.incomingId)
  } else if ("postRowId" in input.under) {
    const [post] = await db
      .select()
      .from(promoXPosts)
      .where(and(eq(promoXPosts.id, input.under.postRowId), eq(promoXPosts.userId, userId)))
      .limit(1)
    if (!post || post.status !== "posted" || !post.accountId) throw new Error("That post is not one Promo posted.")
    accountId = post.accountId
    reply = (post.incoming ?? []).find((item) => item.id === input.incomingId)
  } else {
    const [mention] = await db
      .select()
      .from(promoXMentions)
      .where(and(eq(promoXMentions.id, input.under.mentionId), eq(promoXMentions.userId, userId)))
      .limit(1)
    if (!mention) throw new Error("That mention is not saved any more.")
    accountId = mention.accountId
    reply = {
      id: mention.postId,
      handle: mention.handle,
      name: mention.name,
      text: mention.text,
      likes: mention.likes,
      postedAt: mention.postedAt?.toISOString() ?? null,
      mention: true,
    }
  }
  if (!reply) throw new Error("That reply is not there any more. Check again to read the newest ones.")
  const [answered] = await db
    .select({ id: promoXReplies.id })
    .from(promoXReplies)
    .where(
      and(
        eq(promoXReplies.userId, userId),
        eq(promoXReplies.kind, "answer"),
        eq(promoXReplies.targetId, reply.id),
        inArray(promoXReplies.status, ["waiting", "posted"])
      )
    )
    .limit(1)
  if (answered) throw new Refusal("That one has an answer already, or one on its way.")
  const account = await xWritingAccount(userId, accountId, db)
  return queueXWriting(
    userId,
    account,
    {
      kind: "answer",
      targetId: reply.id,
      targetUrl: xPostUrl(reply.id, reply.handle),
      targetHandle: reply.handle,
      targetText: reply.text,
      guardPostId: reply.id,
      text: input.text,
      helpOnly: false,
      findId: null,
      draftId: null,
      parentId,
      replyTo: reply,
    },
    db,
    now
  )
}

/**
 * Takes back a reply still waiting: in its ten seconds, or held for the
 * account's morning. One that has started cannot be taken back: it may
 * already be on X.
 */
export async function cancelXReply(userId: string, replyId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const [row] = await db
    .select({ jobId: promoXReplies.jobId, status: promoXReplies.status, draftId: promoXReplies.draftId })
    .from(promoXReplies)
    .where(and(eq(promoXReplies.id, replyId), eq(promoXReplies.userId, userId)))
    .limit(1)
  if (!row || row.status !== "waiting" || !row.jobId) throw new Error("That reply is no longer waiting.")
  const removed = await db
    .delete(promoJobs)
    .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), eq(promoJobs.status, "queued")))
    .returning({ id: promoJobs.id })
  if (!removed.length) throw new Error("That reply is no longer waiting. It may have started going to X.")
  await db.delete(promoXReplies).where(eq(promoXReplies.id, replyId))
  // Taken back, its draft is a draft again.
  if (row.draftId) await db.update(promoXDrafts).set({ status: "draft" }).where(eq(promoXDrafts.id, row.draftId))
}

/** The replies an account has waiting for its morning, for the line under Post. */
export async function xHeldForMorning(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Array<{ replyId: string; runAfter: Date }>> {
  const rows = await db
    .select({ payload: promoJobs.payload, runAfter: promoJobs.runAfter })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "x_reply"),
        eq(promoJobs.status, "queued"),
        gt(promoJobs.runAfter, now),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .orderBy(asc(promoJobs.runAfter))
  return rows.flatMap((row) =>
    typeof row.payload.replyId === "string" && row.runAfter ? [{ replyId: row.payload.replyId, runAfter: row.runAfter }] : []
  )
}
