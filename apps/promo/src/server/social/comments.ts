import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { phoneStepRefusal } from "@/lib/phones/options"
import { Refusal } from "@/server/browser/refusal"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MAX_CHECKS_PER_PRESS, MAX_COMMENT_CHARS, NO_PROFILE_MESSAGE } from "@/lib/social/options"

import { refuseInteraction } from "./apart"
import { nextExampleIds } from "./examples"
import { queueJob } from "./jobs"
import { unansweredCounts } from "./replies"
import { pausedBy } from "./pause"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoProjects } from "./schema"

/**
 * The comments the app has sent, and what became of each one.
 *
 * The app sends a comment and then used to forget it. This is the other half:
 * every sent comment with its upvotes, how many replies sit under it, and
 * whether it is still there, so the ranking and the drafts can be judged by
 * what actually happened. Reading a comment again needs the browser, so it is
 * a `comment_check` job, never a request that waits.
 */

export type CommentRow = {
  id: string
  /** Exactly what was sent. */
  text: string
  /** Where it landed on Reddit. */
  commentUrl: string
  postedAt: Date
  postTitle: string
  postUrl: string
  subreddit: string
  /** Null until read, and after a reading while Reddit hides the score. */
  upvotes: number | null
  /** Null until read. Never 0 as a stand-in. */
  replyCount: number | null
  /**
   * Replies directly under it that the app has not answered. Null until a
   * check has read the replies' words.
   */
  toAnswer: number | null
  /** Null until read: not read, still there, and gone are three answers. */
  stillVisible: boolean | null
  /** Whose view said whether it is there. Null until read. */
  checkedAs: "stranger" | "you" | null
  checkedAt: Date | null
  /** A check is waiting or running. */
  checking: boolean
  /** Why the newest check failed, when it did and nothing has read it since. */
  checkError: string | null
  /** True when it was sent with no draft behind it, so the words are the person's. */
  handWritten: boolean
  /** True when a person marked it as not a good example of how they write. */
  notExample: boolean
  /** True when the next draft will carry it as an example. */
  inNextDraft: boolean
  /** The account that sent it, and the project that account is in now. */
  account: { id: string; handle: string }
  project: { id: string; name: string } | null
  /** When the app deleted it from Reddit on a person's press. Null while it is up. */
  deletedAt: Date | null
  /** When the app last edited it, and the words it first went out with. */
  editedAt: Date | null
  originalText: string | null
  /** A delete or an edit is waiting or running. */
  changing: "delete" | "edit" | null
  /** Why the newest delete or edit failed, when it did and nothing has changed it since. */
  changeError: string | null
}

/** Every comment that landed, newest first, with its last reading. */
export async function listSentComments(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<CommentRow[]> {
  const rows = await db
    .select({
      id: promoComments.id,
      text: promoComments.text,
      commentUrl: promoComments.commentUrl,
      postedAt: promoComments.postedAt,
      draftId: promoComments.draftId,
      notExample: promoComments.notExample,
      upvotes: promoComments.upvotes,
      replyCount: promoComments.replyCount,
      stillVisible: promoComments.stillVisible,
      checkedAs: promoComments.checkedAs,
      checkedAt: promoComments.checkedAt,
      incomingReplies: promoComments.incomingReplies,
      postTitle: promoFinds.title,
      permalink: promoFinds.permalink,
      subreddit: promoFinds.subreddit,
      accountId: promoComments.accountId,
      handle: promoAccounts.handle,
      projectId: promoProjects.id,
      projectName: promoProjects.name,
      deletedAt: promoComments.deletedAt,
      editedAt: promoComments.editedAt,
      originalText: promoComments.originalText,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .leftJoin(promoProjects, eq(promoProjects.id, promoAccounts.projectId))
    // An answer to a reply is shown under the reply it answers, in its
    // comment's Replies window, not as a row of its own.
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.parentId)
      )
    )
    .orderBy(desc(promoComments.postedAt))

  const [examples, checks, unanswered, changes] = await Promise.all([
    nextExampleIds(userId, db),
    latestChecks(userId, db),
    unansweredCounts(userId, rows, db),
    latestChanges(userId, db),
  ])

  return rows.map((row) => {
    const check = checks.get(row.id)
    const checking = check?.status === "queued" || check?.status === "running"
    // A failure older than the last good reading is history, not news.
    const failedSinceReading =
      check?.status === "failed" &&
      Boolean(check.lastError) &&
      (!row.checkedAt || (check.finishedAt !== null && check.finishedAt > row.checkedAt))
    return {
      id: row.id,
      text: row.text,
      commentUrl: row.commentUrl,
      postedAt: row.postedAt,
      postTitle: row.postTitle,
      postUrl: `https://www.reddit.com${row.permalink}`,
      subreddit: row.subreddit,
      upvotes: row.upvotes,
      replyCount: row.replyCount,
      toAnswer: unanswered.get(row.id) ?? null,
      stillVisible: row.stillVisible,
      checkedAs: row.checkedAs,
      checkedAt: row.checkedAt,
      checking,
      checkError: failedSinceReading ? check.lastError : null,
      handWritten: row.draftId === null,
      notExample: row.notExample,
      inNextDraft: examples.has(row.id),
      account: { id: row.accountId, handle: row.handle },
      project: row.projectId && row.projectName !== null ? { id: row.projectId, name: row.projectName } : null,
      deletedAt: row.deletedAt,
      editedAt: row.editedAt,
      originalText: row.originalText,
      ...changeState(changes.get(row.id), row),
    }
  })
}

type ChangeJob = { kind: string; status: string; lastError: string; finishedAt: Date | null }

/** Whether a delete or an edit is on its way, or why the newest one failed. */
function changeState(
  job: ChangeJob | undefined,
  row: { deletedAt: Date | null; editedAt: Date | null }
): { changing: "delete" | "edit" | null; changeError: string | null } {
  if (!job) return { changing: null, changeError: null }
  const kind = job.kind === "delete_comment" ? "delete" : "edit"
  if (job.status === "queued" || job.status === "running") return { changing: kind, changeError: null }
  const changedSince = [row.deletedAt, row.editedAt].some(
    (at) => at && job.finishedAt && at > job.finishedAt
  )
  return {
    changing: null,
    changeError: job.status === "failed" && job.lastError && !changedSince ? job.lastError : null,
  }
}

/** The newest delete or edit job for each comment that has one. */
async function latestChanges(userId: string, db: CustomShellDb): Promise<Map<string, ChangeJob>> {
  const commentId = sql<string>`${promoJobs.payload}->>'commentId'`
  const rows = await db
    .selectDistinctOn([commentId], {
      commentId,
      kind: promoJobs.kind,
      status: promoJobs.status,
      lastError: promoJobs.lastError,
      finishedAt: promoJobs.finishedAt,
    })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), inArray(promoJobs.kind, ["delete_comment", "edit_comment"])))
    .orderBy(commentId, desc(promoJobs.createdAt))
  return new Map(rows.filter((row) => row.commentId).map((row) => [row.commentId, row]))
}

/**
 * Queues a delete or an edit of one sent comment, from the account that sent
 * it, because a person pressed Delete or Save changes. Refused for a comment
 * that never landed, is already deleted, or has a change on its way, and for
 * an account that is retired, paused or has no browser profile.
 */
export async function queueCommentChange(
  userId: string,
  commentId: string,
  change: { kind: "delete" } | { kind: "edit"; text: string },
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [row] = await db
    .select({ comment: promoComments, account: promoAccounts })
    .from(promoComments)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That comment is no longer saved.")
  const { comment, account } = row
  if (comment.status !== "posted" || !comment.commentUrl.startsWith("https://www.reddit.com/")) {
    throw new Refusal("That comment never landed on Reddit, so there is nothing to change.")
  }
  if (comment.deletedAt) throw new Refusal("That comment is already deleted from Reddit.")
  const pending = (await latestChanges(userId, db)).get(commentId)?.status
  if (pending === "queued" || pending === "running") {
    throw new Refusal("A change to that comment is already on its way.")
  }
  const handle = account.handle ? `u/${account.handle}` : "The account that sent it"
  if (account.retiredAt) {
    throw new Refusal(`${handle} is retired, so it no longer changes anything on Reddit. Bring it back on the Accounts dashboard first.`)
  }
  if (!account.profileId && !account.phoneId) throw new Refusal(NO_PROFILE_MESSAGE)
  const onPhone = account.phoneId
    ? phoneStepRefusal(change.kind === "delete" ? "reddit/delete_comment" : "reddit/edit_comment", account.handle ? `u/${account.handle}'s phone` : "This account's phone")
    : null
  if (onPhone) throw new Refusal(onPhone)
  const paused = await pausedBy(userId, account, db)
  if (paused) {
    throw new Refusal(
      paused === "account"
        ? `${handle} is paused. Resume it on the Accounts dashboard first.`
        : `${handle}'s project is paused. Resume the project first.`
    )
  }

  if (change.kind === "delete") {
    await queueJob(userId, "delete_comment", { commentId, accountId: account.id }, db)
    return
  }
  const text = change.text.trim()
  if (!text) throw new Refusal("There is nothing to change it to.")
  if (text.length > MAX_COMMENT_CHARS) {
    throw new Refusal(`That is ${text.length} characters, and a comment stops at ${MAX_COMMENT_CHARS}.`)
  }
  if (text === comment.text) throw new Refusal("Those are the words it already has.")
  await refuseInteraction(userId, account, { words: [text] }, db)
  await queueJob(userId, "edit_comment", { commentId, accountId: account.id, text }, db)
}

/** The newest check job for each comment that has one. */
async function latestChecks(
  userId: string,
  db: CustomShellDb
): Promise<
  Map<string, { status: string; lastError: string; finishedAt: Date | null }>
> {
  // One row per comment, its newest, rather than every check ever run: the
  // screen asks every two seconds while a check is going.
  const commentId = sql<string>`${promoJobs.payload}->>'commentId'`
  const rows = await db
    .selectDistinctOn([commentId], {
      commentId,
      status: promoJobs.status,
      lastError: promoJobs.lastError,
      finishedAt: promoJobs.finishedAt,
    })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "comment_check")))
    .orderBy(commentId, desc(promoJobs.createdAt))

  return new Map(rows.filter((row) => row.commentId).map((row) => [row.commentId, row]))
}

/**
 * Queues a fresh reading of each of these comments, as one request. A comment
 * that is not this person's, never landed, or is already being read is left
 * out and reported as skipped.
 */
export async function queueCommentChecks(
  userId: string,
  commentIds: string[],
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  const wanted = [...new Set(commentIds)].slice(0, MAX_CHECKS_PER_PRESS)
  if (!wanted.length) return { completed: [], skipped: commentIds }

  const [rows, checks] = await Promise.all([
    db
      .select({
        id: promoComments.id,
        accountId: promoComments.accountId,
        commentUrl: promoComments.commentUrl,
        deletedAt: promoComments.deletedAt,
      })
      .from(promoComments)
      .where(
        and(
          eq(promoComments.userId, userId),
          inArray(promoComments.id, wanted),
          eq(promoComments.status, "posted")
        )
      ),
    latestChecks(userId, db),
  ])

  const completed: string[] = []
  for (const row of rows) {
    if (!row.commentUrl || row.deletedAt) continue
    const check = checks.get(row.id)
    if (check?.status === "queued" || check?.status === "running") continue
    // Read in the reader browser, signed in to nobody, which is how a
    // stranger sees it. The account it came from stays in the payload.
    await queueJob(userId, "comment_check", { commentId: row.id, accountId: row.accountId }, db)
    completed.push(row.id)
  }
  return { completed, skipped: commentIds.filter((id) => !completed.includes(id)) }
}
