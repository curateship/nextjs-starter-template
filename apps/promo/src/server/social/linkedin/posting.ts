import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"
import { paceCounts, paceLimit } from "@/lib/social/pace"
import { LINKEDIN_COMMENT_CHARS, LINKEDIN_WARM_UP_DAYS, type LinkedinCommentKind, type LinkedinIncoming } from "@/lib/social/linkedin/options"
import { linkedinPostingRefusal, type LinkedinPostingState } from "@/lib/social/linkedin/wording"
import { nextWorkdayAt } from "@/lib/social/linkedin/workday"
import { holdsLink } from "@/lib/social/x/options"

import { refuseLinkedinInteraction } from "../apart"
import { accountTimeZone, isYoung, readBehaviour, warmUpEndsAt } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { similarWarning } from "../x/similar"
import { ownedLinkedinFind } from "./finds"
import { promoLinkedinComments, promoLinkedinDrafts, promoLinkedinFinds, promoLinkedinPages, promoLinkedinPosts } from "./schema"
import { readLinkedinSettings } from "./searchers"
import { closestLinkedinPiece } from "./similar"

/**
 * Whether a LinkedIn account may comment or post now, and sending a comment,
 * a reply under a top comment or an answer (parts 6, 7, 22, 25, 27 and 44).
 *
 * Tyler's answers of 22 Oct 2026 decide the checks:
 *
 * - **Warm-up is 7 days.** Counted from when Promo first saw the account
 *   signed in, since LinkedIn shows nobody when an account joined.
 * - **Pace: "You set it, start at 20".** A young account, under the young
 *   days in Settings → Behaviour, sends at most the comments a day under
 *   LinkedIn there. Comments, replies, answers and posts of its own all
 *   count: each is the account writing on LinkedIn. There is no separate
 *   hourly number; the shared per-hour warning still warns.
 * - **Never a link in a comment.** Refused before anything is queued.
 * - **Too similar warns only.** The warning is written on the comment; Post
 *   still goes.
 * - **One of your accounts per post.** Two of the person's accounts never
 *   meet under one post.
 * - **Workday hours: weekdays, 8am to 6pm.** Outside them a comment is not
 *   refused: it waits for the next workday morning.
 *
 * Nothing here posts. A person pressing Post is the only way a comment is
 * written, and it can be taken back for ten seconds.
 */

type AccountRow = typeof promoAccounts.$inferSelect

const DAY_MS = 86_400_000

/** Ten seconds to undo, the number Tyler picked for Reddit on 12 Oct 2026. */
const UNDO_SECONDS = 10

/** The LinkedIn write jobs that count against an account's pace while they wait. */
const PACED_KINDS = ["linkedin_comment", "linkedin_publish"] as const

/** The account's LinkedIn comments and posts that went out in the last day, and how many wait to go. */
async function recentPosting(userId: string, accountId: string, db: CustomShellDb, now: Date): Promise<{ posted: Date[]; waiting: number }> {
  const since = new Date(now.getTime() - DAY_MS)
  const comments = await db
    .select({ at: promoLinkedinComments.postedAt })
    .from(promoLinkedinComments)
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        eq(promoLinkedinComments.accountId, accountId),
        eq(promoLinkedinComments.status, "posted"),
        gte(promoLinkedinComments.postedAt, since)
      )
    )
  const posts = await db
    .select({ at: promoLinkedinPosts.postedAt })
    .from(promoLinkedinPosts)
    .where(
      and(
        eq(promoLinkedinPosts.userId, userId),
        eq(promoLinkedinPosts.accountId, accountId),
        eq(promoLinkedinPosts.status, "posted"),
        gte(promoLinkedinPosts.postedAt, since)
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
  const posted = [...comments, ...posts].flatMap((row) => (row.at ? [row.at] : [])).sort((a, b) => a.getTime() - b.getTime())
  return { posted, waiting: pending?.n ?? 0 }
}

export async function readLinkedinPostingState(
  userId: string,
  account: Pick<AccountRow, "id" | "profileId" | "phoneId" | "signedInAt" | "pausedAt" | "projectId" | "platform">,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<LinkedinPostingState> {
  const behaviour = await readBehaviour(userId, db)
  const settings = await readLinkedinSettings(userId, db)
  const timeZone = await accountTimeZone(account, db)
  const ends = warmUpEndsAt(account.signedInAt, LINKEDIN_WARM_UP_DAYS, now)
  const young = isYoung(account.signedInAt, behaviour.youngDays, now)
  const { posted, waiting } = await recentPosting(userId, account.id, db, now)
  const nextWorkAt = nextWorkdayAt(now, timeZone)
  return {
    paused: await pausedBy(userId, account, db),
    timeZone,
    working: nextWorkAt === null,
    nextWorkAt,
    warmUp: { endsAt: ends ?? null, ageUnknown: ends === undefined },
    young,
    ...paceCounts(posted, now),
    warnPerHour: behaviour.warnPerHour,
    perDay: settings.commentsPerDay,
    // No hourly number of its own: the day's number is the hour's too.
    limit: young ? paceLimit({ posted, waiting, now, perHour: settings.commentsPerDay, perDay: settings.commentsPerDay }) : null,
  }
}

/** A LinkedIn account of the person's, still in use, or a refusal saying what is wrong with it. */
export async function linkedinWritingAccount(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<AccountRow> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "linkedin") throw new Refusal("Pick a LinkedIn account first.")
  if (account.retiredAt) throw new Refusal("This account is retired. Bring it back on the Accounts dashboard first.")
  if (!account.profileId && !account.phoneId) {
    throw new Refusal("This LinkedIn account has no browser profile or phone. Pick where it runs on the Accounts dashboard.")
  }
  if (!account.handle) {
    throw new Refusal("Promo has not seen this account signed in to LinkedIn. Sign it in, then press Check now on the Accounts dashboard.")
  }
  if (account.banScreenAt) {
    throw new Refusal(`LinkedIn stopped this account: "${account.blockedReason}". Let it run again from the Accounts dashboard once it is sorted.`)
  }
  return account
}

/**
 * Refuses what the LinkedIn app on a phone does not do. On a phone the app
 * reads who is signed in, comments, posts words with a picture, connects,
 * reads and accepts requests, warms up and answers messages; everything else
 * needs the account on a browser profile.
 */
export function refuseLinkedinOnPhone(account: Pick<AccountRow, "phoneId" | "handle">, what: string): void {
  if (!account.phoneId) return
  throw new Refusal(
    `${account.handle ? handleWords("linkedin", account.handle) : "This account"} runs on a phone, and the LinkedIn app there comments, posts words with a picture, connects and accepts requests only. ${what} needs a LinkedIn account on a browser profile. Nothing was sent.`
  )
}

/**
 * Refuses a company page the account does not run, or any page on a
 * throwaway account. Tyler, 22 Oct 2026: company pages are for important
 * accounts only, since a page is the business's own name (part 38).
 */
export async function refuseLinkedinPage(
  userId: string,
  account: Pick<AccountRow, "id" | "importance" | "movingToPhoneId">,
  pageId: string,
  db: CustomShellDb = defaultDb
): Promise<string> {
  if (!pageId) return ""
  if (account.importance !== "important" && !account.movingToPhoneId) {
    throw new Refusal("Only an important account speaks as a company page. Mark the account important on the Accounts dashboard, or post as the person.")
  }
  const [page] = await db
    .select({ name: promoLinkedinPages.name })
    .from(promoLinkedinPages)
    .where(and(eq(promoLinkedinPages.userId, userId), eq(promoLinkedinPages.accountId, account.id), eq(promoLinkedinPages.pageId, pageId)))
    .limit(1)
  if (!page) throw new Refusal("This account does not run that company page, as far as its last look saw. Press Check now on the Accounts dashboard.")
  return page.name
}

/**
 * Refuses when one of the person's accounts already commented on this post,
 * or has one on its way. Every project counts: two accounts from two
 * projects meeting under one post is the same link. Replies under the post's
 * top comments count as under the post.
 */
export async function refuseSecondAccountOnPost(userId: string, accountId: string, postId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const [other] = await db
    .select({ handle: promoAccounts.handle })
    .from(promoLinkedinComments)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinComments.accountId))
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        eq(promoLinkedinComments.targetId, postId),
        sql`${promoLinkedinComments.accountId} <> ${accountId}`,
        inArray(promoLinkedinComments.status, ["waiting", "posted"]),
        isNull(promoLinkedinComments.deletedAt)
      )
    )
    .limit(1)
  if (other) {
    throw new Refusal(
      `${other.handle ? handleWords("linkedin", other.handle) : "Another of your accounts"} already commented on this post. One of your accounts per post, so they are never seen together. Nothing was sent.`
    )
  }
}

/** Refuses words that can't go out as a comment: empty, too long, or holding a link. */
export function refuseCommentWords(text: string, what = "comment"): string {
  const words = text.trim()
  if (!words) throw new Refusal(`Write the ${what} first.`)
  if (words.length > LINKEDIN_COMMENT_CHARS) {
    throw new Refusal(`The ${what} is ${words.length} characters. LinkedIn takes ${LINKEDIN_COMMENT_CHARS}.`)
  }
  // Tyler, 22 Oct 2026: never a link in a comment.
  if (holdsLink(words)) throw new Refusal(`A ${what} never carries a link. Take the link out first.`)
  return words
}

export type QueuedLinkedinComment = {
  commentRowId: string
  jobId: string
  runAfter: Date | null
  undoUntil: Date | null
  /** The too-similar warning, or "". It never stopped Post. */
  similarTo: string
}

type WritingRow = {
  kind: LinkedinCommentKind
  targetId: string
  parentCommentId: string
  targetUrl: string
  targetName: string
  targetSlug: string
  targetText: string
  /** Who wrote the post, which the important-and-throwaway rule guards. */
  postAuthor: string
  text: string
  helpOnly: boolean
  asPageId: string
  findId: string | null
  draftId: string | null
  parentId: string | null
  replyTo: LinkedinIncoming | null
  sentBy?: string | null
}

/** The checks every comment, reply and answer share, then the row and the job. */
async function queueLinkedinWriting(userId: string, account: AccountRow, row: WritingRow, db: CustomShellDb, now: Date): Promise<QueuedLinkedinComment> {
  const text = refuseCommentWords(row.text, row.kind === "answer" ? "answer" : row.kind === "reply" ? "reply" : "comment")
  await refuseLinkedinInteraction(userId, account, { postAuthor: row.postAuthor, words: [text] }, db)
  if (row.targetSlug && row.targetSlug !== row.postAuthor) await refuseLinkedinInteraction(userId, account, { postAuthor: row.targetSlug, words: [] }, db)
  if (row.asPageId) refuseLinkedinOnPhone(account, "Commenting as a company page")
  await refuseLinkedinPage(userId, account, row.asPageId, db)
  const close = await closestLinkedinPiece(userId, account.id, text, db)
  const similarTo = close ? similarWarning(close) : ""
  // Checked and written under locks on the post and the account, so two
  // presses at once, from one account or two, cannot both pass the checks.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-linkedin-post:${userId}:${row.targetId}`}))`)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-linkedin-write:${account.id}`}))`)
    const [onItsWay] = await tx
      .select({ id: promoLinkedinComments.id })
      .from(promoLinkedinComments)
      .where(
        and(
          eq(promoLinkedinComments.userId, userId),
          eq(promoLinkedinComments.accountId, account.id),
          eq(promoLinkedinComments.targetId, row.targetId),
          eq(promoLinkedinComments.parentCommentId, row.parentCommentId),
          eq(promoLinkedinComments.status, "waiting")
        )
      )
      .limit(1)
    if (onItsWay) throw new Refusal("A comment here is already on its way. Take it back first to send a different one.")

    const state = await readLinkedinPostingState(userId, account, tx, now)
    const refusal = linkedinPostingRefusal(state, now, state.timeZone)
    if (refusal) throw new Refusal(refusal)
    if (row.kind !== "answer") await refuseSecondAccountOnPost(userId, account.id, row.targetId, tx)

    // A draft named by the browser counts only when it is the person's own.
    const [draft] = row.draftId
      ? await tx
          .select({ id: promoLinkedinDrafts.id })
          .from(promoLinkedinDrafts)
          .where(and(eq(promoLinkedinDrafts.id, row.draftId), eq(promoLinkedinDrafts.userId, userId)))
          .limit(1)
      : []
    const draftId = draft?.id ?? null

    const id = uuid()
    const jobId = uuid()
    const runAfter = state.nextWorkAt
    const undoUntil = runAfter ? null : new Date(now.getTime() + UNDO_SECONDS * 1000)
    await tx.insert(promoLinkedinComments).values({
      id,
      userId,
      accountId: account.id,
      projectId: account.projectId,
      kind: row.kind,
      findId: row.findId,
      draftId,
      parentId: row.parentId,
      targetId: row.targetId.slice(0, 25),
      parentCommentId: row.parentCommentId.slice(0, 40),
      targetUrl: row.targetUrl.slice(0, 400),
      targetName: row.targetName.slice(0, 200),
      targetSlug: row.targetSlug.slice(0, 100),
      targetText: row.targetText.slice(0, 4_000),
      replyTo: row.replyTo,
      text,
      helpOnly: row.helpOnly,
      asPageId: row.asPageId,
      similarTo,
      status: "waiting",
      jobId,
      sentBy: row.sentBy ?? null,
      createdAt: now,
    })
    await queueJob(userId, "linkedin_comment", { commentRowId: id, accountId: account.id }, tx, runAfter ?? undoUntil, jobId)
    if (draftId) await tx.update(promoLinkedinDrafts).set({ status: "sent" }).where(eq(promoLinkedinDrafts.id, draftId))
    return { commentRowId: id, jobId, runAfter, undoUntil, similarTo }
  })
}

/**
 * Queues a comment on a found post, or a reply under one of its top comments
 * (part 25), that a person pressed Post for, or refuses it with why. The
 * account must be one of the post's project's LinkedIn accounts, and a post
 * from an account's own feed is only for that account (part 13).
 */
export async function queueLinkedinComment(
  userId: string,
  input: {
    findId: string
    accountId: string
    text: string
    /** A top comment to answer instead of the post. */
    underCommentId?: string
    helpOnly?: boolean
    asPageId?: string
    draftId?: string | null
    sentBy?: string | null
  },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedLinkedinComment> {
  const find = await ownedLinkedinFind(userId, input.findId, db)
  if (!find) throw new Error("That LinkedIn post is no longer saved.")
  const account = await linkedinWritingAccount(userId, input.accountId, db)
  if (account.projectId !== find.projectId) throw new Refusal("That account is not in this post's project, so it does not comment here.")
  if (find.feedAccountId && find.feedAccountId !== account.id) {
    throw new Refusal("This post came from another account's own feed, so only that account comments on it.")
  }
  if (!find.canComment) throw new Refusal("The writer turned comments off or limited them to connections, so it can't be answered. Skip it.")
  let target = { commentId: "", name: find.authorName, slug: find.authorSlug, text: find.text }
  if (input.underCommentId) {
    const top = (find.topComments ?? []).find((comment) => comment.id === input.underCommentId)
    if (!top) throw new Refusal("That comment is not one of the post's top comments as Promo read them. Read the post again.")
    target = { commentId: top.id, name: top.name, slug: top.slug, text: top.text }
  }
  return queueLinkedinWriting(
    userId,
    account,
    {
      kind: target.commentId ? "reply" : "comment",
      targetId: find.postId,
      parentCommentId: target.commentId,
      targetUrl: find.url,
      targetName: target.name,
      targetSlug: target.slug,
      targetText: target.text,
      postAuthor: find.authorKind === "person" ? find.authorSlug : "",
      text: input.text,
      helpOnly: Boolean(input.helpOnly),
      asPageId: input.asPageId ?? "",
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

/** Where an answer goes: under one of our comments, or under one of our own posts. */
export type LinkedinAnswerUnder = { commentRowId: string } | { postRowId: string }

/**
 * Queues an answer to somebody who replied under one of the account's
 * comments or commented on one of its posts (part 44). It goes out from the
 * account they answered, under their comment.
 */
export async function queueLinkedinAnswer(
  userId: string,
  input: { under: LinkedinAnswerUnder; incomingId: string; text: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedLinkedinComment> {
  let accountId: string
  let parentId: string | null = null
  let postId: string
  let postUrl: string
  let incoming: LinkedinIncoming | undefined
  let asPageId = ""
  if ("commentRowId" in input.under) {
    const [parent] = await db
      .select()
      .from(promoLinkedinComments)
      .where(and(eq(promoLinkedinComments.id, input.under.commentRowId), eq(promoLinkedinComments.userId, userId)))
      .limit(1)
    if (!parent || parent.status !== "posted") throw new Error("That comment is not one Promo sent.")
    accountId = parent.accountId
    parentId = parent.id
    postId = parent.targetId
    postUrl = parent.targetUrl
    asPageId = parent.asPageId
    incoming = (parent.incoming ?? []).find((item) => item.id === input.incomingId)
  } else {
    const [post] = await db
      .select()
      .from(promoLinkedinPosts)
      .where(and(eq(promoLinkedinPosts.id, input.under.postRowId), eq(promoLinkedinPosts.userId, userId)))
      .limit(1)
    if (!post || post.status !== "posted" || !post.accountId || !post.postId) throw new Error("That post is not one Promo posted.")
    accountId = post.accountId
    postId = post.postId
    postUrl = post.postUrl
    asPageId = post.asPageId
    incoming = (post.incoming ?? []).find((item) => item.id === input.incomingId)
  }
  if (!incoming) throw new Error("That reply is not there any more. Check again to read the newest ones.")
  const [answered] = await db
    .select({ id: promoLinkedinComments.id })
    .from(promoLinkedinComments)
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        eq(promoLinkedinComments.kind, "answer"),
        eq(promoLinkedinComments.parentCommentId, incoming.id),
        inArray(promoLinkedinComments.status, ["waiting", "posted"])
      )
    )
    .limit(1)
  if (answered) throw new Refusal("That one has an answer already, or one on its way.")
  const account = await linkedinWritingAccount(userId, accountId, db)
  return queueLinkedinWriting(
    userId,
    account,
    {
      kind: "answer",
      targetId: postId,
      parentCommentId: incoming.id,
      targetUrl: postUrl,
      targetName: incoming.name,
      targetSlug: incoming.slug,
      targetText: incoming.text,
      postAuthor: incoming.slug,
      text: input.text,
      helpOnly: false,
      asPageId,
      findId: null,
      draftId: null,
      parentId,
      replyTo: { ...incoming },
    },
    db,
    now
  )
}

/**
 * Takes back a comment still waiting: in its ten seconds, or held for the
 * next workday. One that has started cannot be taken back: it may already be
 * on LinkedIn.
 */
export async function cancelLinkedinComment(userId: string, commentRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const [row] = await db
    .select({ jobId: promoLinkedinComments.jobId, status: promoLinkedinComments.status, draftId: promoLinkedinComments.draftId })
    .from(promoLinkedinComments)
    .where(and(eq(promoLinkedinComments.id, commentRowId), eq(promoLinkedinComments.userId, userId)))
    .limit(1)
  if (!row || row.status !== "waiting" || !row.jobId) throw new Error("That comment is no longer waiting.")
  const removed = await db
    .delete(promoJobs)
    .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), eq(promoJobs.status, "queued")))
    .returning({ id: promoJobs.id })
  if (!removed.length) throw new Error("That comment is no longer waiting. It may have started going to LinkedIn.")
  await db.delete(promoLinkedinComments).where(eq(promoLinkedinComments.id, commentRowId))
  // Taken back, its draft is a draft again.
  if (row.draftId) await db.update(promoLinkedinDrafts).set({ status: "draft" }).where(eq(promoLinkedinDrafts.id, row.draftId))
}

/**
 * The comments an account has waiting for its next workday, for the line
 * under Post. One inside its ten seconds to take back is not waiting for the
 * workday, so it is left out.
 */
export async function linkedinHeldForWorkday(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Array<{ commentRowId: string; runAfter: Date }>> {
  const rows = await db
    .select({ payload: promoJobs.payload, runAfter: promoJobs.runAfter })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "linkedin_comment"),
        eq(promoJobs.status, "queued"),
        gt(promoJobs.runAfter, new Date(now.getTime() + UNDO_SECONDS * 1000)),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .orderBy(asc(promoJobs.runAfter))
  return rows.flatMap((row) =>
    typeof row.payload.commentRowId === "string" && row.runAfter ? [{ commentRowId: row.payload.commentRowId, runAfter: row.runAfter }] : []
  )
}

/** The find a comment was for, when it still exists, for marking its post commented. */
export async function findPostId(findId: string | null, db: CustomShellDb = defaultDb): Promise<string | null> {
  if (!findId) return null
  const [find] = await db.select({ postId: promoLinkedinFinds.postId }).from(promoLinkedinFinds).where(eq(promoLinkedinFinds.id, findId)).limit(1)
  return find?.postId ?? null
}
