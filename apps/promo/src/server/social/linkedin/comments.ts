import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { LINKEDIN_POST_CHARS, linkedinPostUrl, type LinkedinCommentKind, type LinkedinIncoming } from "@/lib/social/linkedin/options"
import { linkedinMayHaveLanded, linkedinPostingRefusal } from "@/lib/social/linkedin/wording"

import { refuseLinkedinInteraction } from "../apart"
import { queueJob, TryAgainLater } from "../jobs"
import { noticeRung, ringBell } from "../notices"
import { promoAccounts, promoJobs } from "../schema"
import { titleWords } from "../title-words"
import { similarWarning } from "../x/similar"
import { linkedinCheck, linkedinComment, linkedinDelete, linkedinEdit, linkedinFindOwn, type LinkedinIncomingRead } from "./calls"
import { markPostCommented } from "./finds"
import { connectsFor } from "./people"
import {
  findPostId,
  linkedinWritingAccount,
  queueLinkedinAnswer,
  queueLinkedinComment,
  readLinkedinPostingState,
  refuseCommentWords,
  refuseLinkedinOnPhone,
  type QueuedLinkedinComment,
} from "./posting"
import { promoLinkedinComments, promoLinkedinFinds, promoLinkedinPosts } from "./schema"
import type { LinkedinReader } from "./search"
import { spendLinkedinViews } from "./searchers"
import { closestLinkedinPiece } from "./similar"

/**
 * The comments, replies and answers that went out on LinkedIn, or tried to
 * (parts 23, 24, 26, 43, 44 and 45): sending one from the account's browser
 * or phone, the Comments tab, reading each one again once a day through a
 * search account, the replies people wrote back, editing and deleting, and
 * the Failed list with Try again.
 */

type CommentRow = typeof promoLinkedinComments.$inferSelect

/** A sent comment or post is read again once this long after its last reading. */
const CHECK_EVERY_MS = 24 * 3_600_000

/** One pass of the ticker asks for at most this many checks for a person. */
const CHECKS_PER_PASS = 20

function iso(seconds: number | null): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

/** The replies under ours as the app stores them, our own account's left out. */
export function linkedinIncomingFrom(reads: LinkedinIncomingRead[], ownSlug: string): LinkedinIncoming[] {
  return reads
    .filter((item) => !ownSlug || item.slug.toLowerCase() !== ownSlug.toLowerCase())
    .map((item) => ({
      id: item.id,
      name: item.name,
      headline: item.headline,
      slug: item.slug,
      text: item.text,
      reactions: item.reactions,
      postedAt: iso(item.postedSeconds),
    }))
}

/** True when LinkedIn's id is the shape the app keeps: digits. */
function cleanId(value: string, max: number): string {
  return /^\d{3,40}$/.test(value) ? value.slice(0, max) : ""
}

/**
 * Sends one waiting comment, reply or answer from its account's browser or
 * phone. A comment on a post reacts to it a few seconds first, as a person
 * would (part 26). The row says what happened either way, and a failure is
 * thrown on so the job fails and the bell rings. Never tried twice: the job
 * is a write.
 */
export async function runLinkedinComment(
  userId: string,
  commentRowId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoLinkedinComments)
    .where(and(eq(promoLinkedinComments.id, commentRowId), eq(promoLinkedinComments.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That comment was taken back before it went.")
  if (row.status !== "waiting") throw new Refusal("That comment has been dealt with already.")
  // Only the send itself can fail the row. Once LinkedIn has it, nothing
  // after may mark it failed, or Try again would send it a second time.
  let sent: { commentId: string; url: string }
  try {
    sent = await linkedinComment(target, {
      postId: row.targetId,
      parentCommentId: row.parentCommentId,
      text: row.text,
      react: row.kind === "comment",
      asPageId: row.asPageId,
      since: Math.floor(row.createdAt.getTime() / 1000),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(promoLinkedinComments).set({ status: "failed", lastError: message.slice(0, 2_000) }).where(eq(promoLinkedinComments.id, row.id))
    throw error
  }
  const commentId = cleanId(sent.commentId, 40)
  await db
    .update(promoLinkedinComments)
    .set({
      status: "posted",
      commentId,
      commentUrl: commentId ? (/^https:\/\/(www\.)?linkedin\.com\//.test(sent.url) ? sent.url.slice(0, 400) : row.targetUrl) : "",
      postedAt: now,
      lastError: "",
    })
    .where(eq(promoLinkedinComments.id, row.id))
  await db.update(promoAccounts).set({ lastPostedAt: now }).where(eq(promoAccounts.id, row.accountId))
  const postId = await findPostId(row.findId, db)
  if (postId) await markPostCommented(userId, postId, db)
  // The LinkedIn app on a phone does not always show where a comment landed,
  // so a search account looks it up a minute later.
  if (!commentId) {
    try {
      await queueJob(userId, "linkedin_check", { commentRowId: row.id }, db, new Date(now.getTime() + 60_000))
    } catch (error) {
      console.warn(`LinkedIn comment ${row.id} went out, but where it landed can't be looked up: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export type LinkedinCommentView = {
  id: string
  kind: LinkedinCommentKind
  account: { id: string; handle: string; onPhone: boolean } | null
  targetId: string
  targetUrl: string
  targetName: string
  targetSlug: string
  targetText: string
  text: string
  helpOnly: boolean
  notExample: boolean
  asPageId: string
  similarTo: string
  status: CommentRow["status"]
  commentUrl: string
  lastError: string
  /** Null until read; "not read yet" is never shown as 0 or "gone". */
  reactions: number | null
  replyCount: number | null
  stillVisible: boolean | null
  checkedAt: Date | null
  /** The replies under ours, each saying whether Promo answered it, null until a check has read them. */
  incoming: Array<LinkedinIncoming & { answered: boolean }> | null
  toAnswer: number
  /** For an answer: what it answered. */
  replyTo: LinkedinIncoming | null
  editedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  postedAt: Date | null
  /** True when the failed one may be on LinkedIn anyway, because the browser stopped after Post. */
  mayHaveLanded: boolean
  /** A connection request to the post's writer is sent or on its way (part 39). */
  connect: "waiting" | "sent" | "failed" | null
}

/** The ids of comments Promo already answered or is answering. */
export async function answeredLinkedinIds(userId: string, db: CustomShellDb): Promise<Set<string>> {
  const rows = await db
    .select({ parentCommentId: promoLinkedinComments.parentCommentId })
    .from(promoLinkedinComments)
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        eq(promoLinkedinComments.kind, "answer"),
        inArray(promoLinkedinComments.status, ["waiting", "posted"])
      )
    )
  return new Set(rows.map((row) => row.parentCommentId))
}

/** How many replies under a row nobody has answered. */
export function linkedinToAnswer(incoming: LinkedinIncoming[] | null, answered: Set<string>): number {
  return (incoming ?? []).filter((item) => !answered.has(item.id)).length
}

function view(
  row: CommentRow,
  account: { handle: string; onPhone: boolean } | null,
  answered: Set<string>,
  connect: LinkedinCommentView["connect"]
): LinkedinCommentView {
  return {
    id: row.id,
    kind: row.kind,
    account: account === null ? null : { id: row.accountId, handle: account.handle, onPhone: account.onPhone },
    targetId: row.targetId,
    targetUrl: row.targetUrl,
    targetName: row.targetName,
    targetSlug: row.targetSlug,
    targetText: row.targetText,
    text: row.text,
    helpOnly: row.helpOnly,
    notExample: row.notExample,
    asPageId: row.asPageId,
    similarTo: row.similarTo,
    status: row.status,
    commentUrl: row.commentUrl,
    lastError: row.lastError,
    reactions: row.reactions,
    replyCount: row.replyCount,
    stillVisible: row.stillVisible,
    checkedAt: row.checkedAt,
    incoming: row.incoming?.map((item) => ({ ...item, answered: answered.has(item.id) })) ?? null,
    toAnswer: linkedinToAnswer(row.incoming, answered),
    replyTo: row.replyTo,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    mayHaveLanded: row.status === "failed" && linkedinMayHaveLanded(row.lastError),
    connect,
  }
}

/**
 * The Comments tab: every comment, reply and answer this project's accounts
 * sent, newest first (`sent`), or the ones that did not go out and nobody has
 * dealt with yet (`failed`).
 */
export async function listLinkedinComments(
  userId: string,
  projectId: string,
  list: "sent" | "failed",
  db: CustomShellDb = defaultDb,
  /** Only what was sent under this one post, for the post's own column. */
  targetId?: string
): Promise<LinkedinCommentView[]> {
  const rows = await db
    .select({ row: promoLinkedinComments, handle: promoAccounts.handle, phoneId: promoAccounts.phoneId, dismissedAt: promoJobs.dismissedAt })
    .from(promoLinkedinComments)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinComments.accountId))
    .leftJoin(promoJobs, eq(promoJobs.id, promoLinkedinComments.jobId))
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        eq(promoLinkedinComments.projectId, projectId),
        targetId ? eq(promoLinkedinComments.targetId, targetId) : undefined,
        list === "failed" ? eq(promoLinkedinComments.status, "failed") : ne(promoLinkedinComments.status, "failed")
      )
    )
    .orderBy(desc(promoLinkedinComments.createdAt))
    .limit(300)
  const answered = await answeredLinkedinIds(userId, db)
  const connects = await connectsFor(
    userId,
    rows.map((item) => item.row.id),
    db
  )
  return rows
    .filter((item) => list !== "failed" || !item.dismissedAt)
    .map((item) =>
      view(item.row, item.handle === null ? null : { handle: item.handle, onPhone: Boolean(item.phoneId) }, answered, connects.get(item.row.id) ?? null)
    )
}

/** A comment of the person's, or a refusal. */
export async function ownedLinkedinComment(userId: string, commentRowId: string, db: CustomShellDb): Promise<CommentRow> {
  const [row] = await db
    .select()
    .from(promoLinkedinComments)
    .where(and(eq(promoLinkedinComments.id, commentRowId), eq(promoLinkedinComments.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That comment is not one Promo sent.")
  return row
}

/** Keeps a sent comment out of the AI's examples of the account's voice, or lets it back in (part 24). */
export async function setLinkedinNotExample(userId: string, commentRowId: string, notExample: boolean, db: CustomShellDb = defaultDb): Promise<void> {
  await ownedLinkedinComment(userId, commentRowId, db)
  await db.update(promoLinkedinComments).set({ notExample }).where(eq(promoLinkedinComments.id, commentRowId))
}

export type PastLinkedinComment = { id: string; targetText: string; text: string; reactions: number | null; commentUrl: string; postedAt: Date | null }

/**
 * What you said before on posts like this one (part 23): up to three of the
 * same account's comments that landed and are still up, under the same
 * keyword first, then by how many words their post shares with this one.
 * The same rule as the other networks' past answers.
 */
export async function pastLinkedinComments(
  userId: string,
  find: { postId: string; keywordId: string | null; text: string },
  accountId: string | null,
  db: CustomShellDb = defaultDb
): Promise<PastLinkedinComment[]> {
  const rows = await db
    .select({
      id: promoLinkedinComments.id,
      targetText: promoLinkedinComments.targetText,
      text: promoLinkedinComments.text,
      reactions: promoLinkedinComments.reactions,
      commentUrl: promoLinkedinComments.commentUrl,
      postedAt: promoLinkedinComments.postedAt,
      keywordId: promoLinkedinFinds.keywordId,
    })
    .from(promoLinkedinComments)
    .leftJoin(promoLinkedinFinds, eq(promoLinkedinFinds.id, promoLinkedinComments.findId))
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        accountId ? eq(promoLinkedinComments.accountId, accountId) : undefined,
        eq(promoLinkedinComments.status, "posted"),
        ne(promoLinkedinComments.kind, "answer"),
        isNull(promoLinkedinComments.deletedAt),
        ne(promoLinkedinComments.targetId, find.postId)
      )
    )
    .orderBy(desc(promoLinkedinComments.postedAt))
    .limit(300)
  const wanted = titleWords(find.text)
  return rows
    .map((row) => {
      const shared = [...titleWords(row.targetText)].filter((word) => wanted.has(word)).length
      return { row, score: (find.keywordId && row.keywordId === find.keywordId ? 100 : 0) + shared }
    })
    // A comment under another keyword sharing one word is a coincidence.
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ row }) => ({ id: row.id, targetText: row.targetText, text: row.text, reactions: row.reactions, commentUrl: row.commentUrl, postedAt: row.postedAt }))
}

/**
 * Asks for a fresh reading of sent comments and posts: the ones named, or,
 * from the ticker, those whose last reading is a day old. Read through a
 * search account, so the check is how a stranger sees them.
 */
export async function queueLinkedinChecks(
  userId: string,
  named: { commentRowIds?: string[]; postRowIds?: string[] } | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const stale = new Date(now.getTime() - CHECK_EVERY_MS)
  const comments =
    named && !named.commentRowIds?.length
      ? []
      : await db
          .select({ id: promoLinkedinComments.id })
          .from(promoLinkedinComments)
          .where(
            and(
              eq(promoLinkedinComments.userId, userId),
              eq(promoLinkedinComments.status, "posted"),
              isNull(promoLinkedinComments.deletedAt),
              named?.commentRowIds
                ? inArray(promoLinkedinComments.id, named.commentRowIds)
                : or(isNull(promoLinkedinComments.checkedAt), lt(promoLinkedinComments.checkedAt, stale))
            )
          )
          .limit(named ? 50 : CHECKS_PER_PASS)
  const posts =
    named && !named.postRowIds?.length
      ? []
      : await db
          .select({ id: promoLinkedinPosts.id })
          .from(promoLinkedinPosts)
          .where(
            and(
              eq(promoLinkedinPosts.userId, userId),
              eq(promoLinkedinPosts.status, "posted"),
              isNull(promoLinkedinPosts.deletedAt),
              named?.postRowIds
                ? inArray(promoLinkedinPosts.id, named.postRowIds)
                : or(isNull(promoLinkedinPosts.checkedAt), lt(promoLinkedinPosts.checkedAt, stale))
            )
          )
          .limit(named ? 50 : CHECKS_PER_PASS)
  const waiting = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "linkedin_check"), inArray(promoJobs.status, ["queued", "running"])))
  const already = new Set(waiting.map((job) => String(job.payload?.commentRowId ?? job.payload?.postRowId ?? "")))
  let queued = 0
  for (const row of comments) {
    if (already.has(row.id)) continue
    await queueJob(userId, "linkedin_check", { commentRowId: row.id }, db)
    queued += 1
  }
  for (const row of posts) {
    if (already.has(row.id)) continue
    await queueJob(userId, "linkedin_check", { postRowId: row.id }, db)
    queued += 1
  }
  return queued
}

/** The address a comment's notices open: the Comments tab of its project with it open. */
export function linkedinRowHref(projectId: string | null, rowId: string, tab: "comments" | "posts" = "comments"): string {
  return projectId ? `/admin/projects/${encodeURIComponent(projectId)}?network=linkedin&tab=${tab}&open=${encodeURIComponent(rowId)}` : "/admin/projects"
}

/** Rings the bell once per new reply under one of ours (part 43). */
async function ringNewReplies(userId: string, incoming: LinkedinIncoming[], before: Set<string>, href: string, db: CustomShellDb, now: Date): Promise<void> {
  for (const item of incoming) {
    // The person's id is in the notice's target, because LinkedIn's ids are the same for everyone.
    const target = `${userId}:${item.id}`
    if (before.has(item.id) || (await noticeRung("linkedin_reply", target, db))) continue
    await ringBell(
      userId,
      { kind: "linkedin_reply", targetId: target, message: `${NOTICE_HEADINGS.linkedin_reply} from ${item.name || "someone"}`, detail: item.text.slice(0, 300), href },
      db,
      now
    )
  }
}

/** Not found yet is tried again a little later; the day's check is written, so the ticker does not ask every pass. */
function notFoundYet(): never {
  throw new TryAgainLater("It does not show on LinkedIn yet.", 5 * 60_000)
}

/**
 * Writes one fresh reading of a comment or a post of ours (part 43). A new
 * reply under it rings the bell once, as does one of ours that has gone. A
 * comment or post a phone sent with no id is looked up first.
 */
export async function recordLinkedinCheck(
  userId: string,
  payload: Record<string, unknown>,
  reader: LinkedinReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const commentRowId = typeof payload.commentRowId === "string" ? payload.commentRowId : ""
  const postRowId = typeof payload.postRowId === "string" ? payload.postRowId : ""
  if (commentRowId) {
    const row = await ownedLinkedinComment(userId, commentRowId, db)
    const [account] = await db.select({ handle: promoAccounts.handle }).from(promoAccounts).where(eq(promoAccounts.id, row.accountId)).limit(1)
    const slug = account?.handle ?? ""
    if (!row.commentId) {
      const look = await linkedinFindOwn(reader.target, { slug, postId: row.targetId, text: row.text })
      await spendLinkedinViews(reader.searcher.id, look, db, now)
      const found = cleanId(look.found ?? "", 40)
      if (!found) {
        await db.update(promoLinkedinComments).set({ checkedAt: now }).where(eq(promoLinkedinComments.id, row.id))
        notFoundYet()
      }
      await db.update(promoLinkedinComments).set({ commentId: found, commentUrl: row.targetUrl }).where(eq(promoLinkedinComments.id, row.id))
      return
    }
    const read = await linkedinCheck(reader.target, { postId: row.targetId, commentId: row.commentId, slug })
    await spendLinkedinViews(reader.searcher.id, read, db, now)
    const incoming = linkedinIncomingFrom(read.incoming, slug)
    const before = new Set((row.incoming ?? []).map((item) => item.id))
    // A look that could not tell keeps what the last one said.
    const visible = read.found ? (read.visible ?? row.stillVisible) : false
    await db
      .update(promoLinkedinComments)
      .set({
        // A number LinkedIn did not show this time keeps the last one read, never 0.
        reactions: read.reactions ?? row.reactions,
        replyCount: read.comments ?? row.replyCount,
        stillVisible: visible,
        checkedAt: now,
        ...(read.found ? { incoming } : {}),
      })
      .where(eq(promoLinkedinComments.id, row.id))
    const href = linkedinRowHref(row.projectId, row.id)
    if (row.stillVisible !== false && visible === false && !row.deletedAt) {
      await ringBell(
        userId,
        {
          kind: "linkedin_gone",
          targetId: row.id,
          message: `${NOTICE_HEADINGS.linkedin_gone} your comment to ${row.targetName || "a post"}`,
          detail: read.found
            ? "It no longer shows under the post for a stranger. The writer or LinkedIn hid it, or it was deleted."
            : "The post it was under is gone, or only the writer's connections can see it now.",
          href,
        },
        db,
        now
      )
    }
    await ringNewReplies(userId, incoming, before, href, db, now)
    return
  }
  if (!postRowId) throw new Error("That check names no comment or post.")
  const [found] = await db
    .select({ post: promoLinkedinPosts, handle: promoAccounts.handle })
    .from(promoLinkedinPosts)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinPosts.accountId))
    .where(and(eq(promoLinkedinPosts.id, postRowId), eq(promoLinkedinPosts.userId, userId)))
    .limit(1)
  if (!found || found.post.status !== "posted") throw new Refusal("That post never landed, so there is nothing to read.")
  const post = found.post
  const slug = found.handle ?? ""
  if (!post.postId) {
    // A phone does not say where a post landed, so it is looked up by its words.
    const look = await linkedinFindOwn(reader.target, { slug, postId: "", text: post.text })
    await spendLinkedinViews(reader.searcher.id, look, db, now)
    const postId = cleanId(look.found ?? "", 25)
    if (!postId) {
      await db.update(promoLinkedinPosts).set({ checkedAt: now }).where(eq(promoLinkedinPosts.id, post.id))
      notFoundYet()
    }
    await db.update(promoLinkedinPosts).set({ postId, postUrl: linkedinPostUrl(postId), updatedAt: now }).where(eq(promoLinkedinPosts.id, post.id))
    return
  }
  const read = await linkedinCheck(reader.target, { postId: post.postId, commentId: "", slug })
  await spendLinkedinViews(reader.searcher.id, read, db, now)
  // The account's own first comment is not somebody to answer.
  const incoming = linkedinIncomingFrom(read.incoming, slug).filter((item) => item.id !== post.firstCommentId)
  const before = new Set((post.incoming ?? []).map((item) => item.id))
  const visible = read.found ? (read.visible ?? post.stillVisible) : false
  await db
    .update(promoLinkedinPosts)
    .set({
      reactions: read.reactions ?? post.reactions,
      commentCount: read.comments ?? post.commentCount,
      reposts: read.reposts ?? post.reposts,
      stillVisible: visible,
      checkedAt: now,
      ...(read.found ? { incoming } : {}),
      ...(post.poll && read.pollVotes ? { poll: { ...post.poll, votes: read.pollVotes } } : {}),
    })
    .where(eq(promoLinkedinPosts.id, post.id))
  const href = linkedinRowHref(post.projectId, post.id, "posts")
  if (post.stillVisible !== false && visible === false && !post.deletedAt) {
    await ringBell(
      userId,
      {
        kind: "linkedin_gone",
        targetId: post.id,
        message: `${NOTICE_HEADINGS.linkedin_gone} your post "${(post.title || post.text).slice(0, 60)}"`,
        detail: "It no longer shows on LinkedIn. LinkedIn removed it, or it was deleted.",
        href,
      },
      db,
      now
    )
  }
  await ringNewReplies(userId, incoming, before, href, db, now)
}

/**
 * Queues an edit or a delete of a sent comment or post (part 45), from the
 * account that wrote it. LinkedIn lets a comment or a post be edited at any
 * time. An edit goes through the same checks as a new comment, its new words
 * included; a delete is refused only by a pause. Both wait for the account's
 * workday, as every visit to LinkedIn does.
 */
export async function queueLinkedinChange(
  userId: string,
  input: { commentRowId?: string; postRowId?: string; action: "edit" | "delete"; text?: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ jobId: string; similarTo: string }> {
  const kind = input.action === "edit" ? "linkedin_edit" : "linkedin_delete"
  let accountId: string
  let what = "comment"
  if (input.commentRowId) {
    const row = await ownedLinkedinComment(userId, input.commentRowId, db)
    if (row.status !== "posted" || !row.commentId) throw new Refusal("Only a comment that landed can be changed.")
    if (row.deletedAt) throw new Refusal("That comment is deleted already.")
    if (input.action === "edit" && (input.text ?? "").trim() === row.text) throw new Refusal("Those are the words it has already.")
    accountId = row.accountId
  } else if (input.postRowId) {
    const [post] = await db
      .select()
      .from(promoLinkedinPosts)
      .where(and(eq(promoLinkedinPosts.id, input.postRowId), eq(promoLinkedinPosts.userId, userId)))
      .limit(1)
    if (!post || post.status !== "posted" || !post.accountId || !post.postId) throw new Refusal("Only a post that went out can be changed on LinkedIn.")
    if (post.deletedAt) throw new Refusal("That post is deleted already.")
    if (input.action === "edit" && post.kind === "newsletter") throw new Refusal("A newsletter issue is edited on LinkedIn itself, not from here.")
    if (input.action === "edit" && (input.text ?? "").trim() === post.text) throw new Refusal("Those are the words it has already.")
    accountId = post.accountId
    what = "post"
  } else {
    throw new Error("Name the comment or the post to change.")
  }
  const owner = await linkedinWritingAccount(userId, accountId, db)
  refuseLinkedinOnPhone(owner, input.action === "edit" ? "Editing on LinkedIn" : "Deleting on LinkedIn")
  let similarTo = ""
  if (input.action === "edit") {
    const text = what === "comment" ? refuseCommentWords(input.text ?? "") : (input.text ?? "").trim()
    if (!text) throw new Refusal("Write the new words first.")
    if (what === "post" && text.length > LINKEDIN_POST_CHARS) throw new Refusal(`That is ${text.length} characters. LinkedIn takes ${LINKEDIN_POST_CHARS}.`)
    await refuseLinkedinInteraction(userId, owner, { words: [text] }, db)
    const close = await closestLinkedinPiece(userId, accountId, text, db)
    similarTo = close ? similarWarning(close) : ""
  }
  const state = await readLinkedinPostingState(userId, owner, db, now)
  // A delete takes something down, so only a pause holds it; the warm-up and
  // the pace are about putting things up, and must never trap a bad comment.
  const refusal = input.action === "edit" || state.paused ? linkedinPostingRefusal(state, now, state.timeZone) : null
  if (refusal) throw new Refusal(refusal)
  const [busy] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, ["linkedin_edit", "linkedin_delete"]),
        inArray(promoJobs.status, ["queued", "running"]),
        input.commentRowId ? sql`${promoJobs.payload}->>'commentRowId' = ${input.commentRowId}` : sql`${promoJobs.payload}->>'postRowId' = ${input.postRowId ?? ""}`
      )
    )
    .limit(1)
  if (busy) throw new Refusal("A change to that one is already on its way.")
  const jobId = await queueJob(
    userId,
    kind,
    {
      accountId,
      ...(input.commentRowId ? { commentRowId: input.commentRowId } : { postRowId: input.postRowId }),
      ...(input.action === "edit" ? { text: (input.text ?? "").trim() } : {}),
    },
    db,
    state.nextWorkAt
  )
  return { jobId, similarTo }
}

/** Runs an edit or a delete in the account's browser and writes down what it found afterwards. */
export async function runLinkedinChange(
  userId: string,
  kind: "linkedin_edit" | "linkedin_delete",
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const commentRowId = typeof payload.commentRowId === "string" ? payload.commentRowId : ""
  const postRowId = typeof payload.postRowId === "string" ? payload.postRowId : ""
  const text = typeof payload.text === "string" ? payload.text : ""
  if (commentRowId) {
    const row = await ownedLinkedinComment(userId, commentRowId, db)
    if (kind === "linkedin_delete") {
      const { done } = await linkedinDelete(target, { postId: row.targetId, commentId: row.commentId })
      if (!done) throw new Error("Delete was pressed but the comment still shows on LinkedIn. Look at it there.")
      await db.update(promoLinkedinComments).set({ deletedAt: now, stillVisible: false }).where(eq(promoLinkedinComments.id, row.id))
    } else {
      const { done } = await linkedinEdit(target, { postId: row.targetId, commentId: row.commentId, text })
      if (!done) throw new Error("Save was pressed but LinkedIn still shows the old words. Look at it there.")
      await db
        .update(promoLinkedinComments)
        .set({ text, editedAt: now, originalText: row.originalText ?? row.text })
        .where(eq(promoLinkedinComments.id, row.id))
    }
    return
  }
  if (!postRowId) throw new Error("That change names no comment or post.")
  const [post] = await db
    .select()
    .from(promoLinkedinPosts)
    .where(and(eq(promoLinkedinPosts.id, postRowId), eq(promoLinkedinPosts.userId, userId)))
    .limit(1)
  if (!post) throw new Error("That post is not one Promo posted.")
  if (kind === "linkedin_delete") {
    const { done } = await linkedinDelete(target, { postId: post.postId, commentId: "" })
    if (!done) throw new Error("Delete was pressed but the post still shows on LinkedIn. Look at it there.")
    await db.update(promoLinkedinPosts).set({ deletedAt: now, stillVisible: false, updatedAt: now }).where(eq(promoLinkedinPosts.id, post.id))
  } else {
    const { done } = await linkedinEdit(target, { postId: post.postId, commentId: "", text })
    if (!done) throw new Error("Save was pressed but LinkedIn still shows the old words. Look at it there.")
    await db.update(promoLinkedinPosts).set({ text, editedAt: now, updatedAt: now }).where(eq(promoLinkedinPosts.id, post.id))
  }
}

/** Takes a failed comment off the Failed list without sending it again. The record stays. */
export async function dismissFailedLinkedinComment(userId: string, commentRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const row = await ownedLinkedinComment(userId, commentRowId, db)
  if (row.status !== "failed" || !row.jobId) throw new Error("That comment did not fail.")
  await db.update(promoJobs).set({ dismissedAt: new Date() }).where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId)))
}

/**
 * Try again on a failed comment (part 43): the same words, from the same
 * account, through every check a first press goes through. The first try's
 * record stays, off the Failed list. A first try that landed after all is
 * not sent twice: the browser looks for it under the post before typing,
 * back to the first try's time, and reports it as sent when it is there
 * (`comment` in `docker/browser/routines/linkedin.py`).
 */
export async function retryFailedLinkedinComment(
  userId: string,
  commentRowId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedLinkedinComment> {
  const row = await ownedLinkedinComment(userId, commentRowId, db)
  if (row.status !== "failed") throw new Error("That comment did not fail.")
  // The LinkedIn app looks nowhere before it types, so a phone's failure that
  // may have landed is never sent again from here (nothing is tried twice).
  const [sender] = await db.select({ phoneId: promoAccounts.phoneId }).from(promoAccounts).where(eq(promoAccounts.id, row.accountId)).limit(1)
  if (sender?.phoneId && linkedinMayHaveLanded(row.lastError)) {
    throw new Refusal("This went from a phone and may already be on LinkedIn. Look under the post first. If it isn't there, Dismiss this one and write it again.")
  }
  // Taken off the Failed list first, and only once, so a second press or a
  // stale tab cannot send the same words again after the first try lands.
  if (row.jobId) {
    const taken = await db
      .update(promoJobs)
      .set({ dismissedAt: now })
      .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), isNull(promoJobs.dismissedAt)))
      .returning({ id: promoJobs.id })
    if (!taken.length) throw new Refusal("That comment was already tried again or dismissed.")
  }
  try {
    if (row.kind === "answer") {
      if (!row.replyTo) throw new Error("That answer no longer says what it answered.")
      if (row.parentId) return await queueLinkedinAnswer(userId, { under: { commentRowId: row.parentId }, incomingId: row.replyTo.id, text: row.text }, db, now)
      const [post] = await db
        .select({ id: promoLinkedinPosts.id })
        .from(promoLinkedinPosts)
        .where(and(eq(promoLinkedinPosts.userId, userId), eq(promoLinkedinPosts.postId, row.targetId)))
        .limit(1)
      if (!post) throw new Refusal("What this answered is not saved any more, so it can't be sent from here again.")
      return await queueLinkedinAnswer(userId, { under: { postRowId: post.id }, incomingId: row.replyTo.id, text: row.text }, db, now)
    }
    if (!row.findId) throw new Refusal("The post this was for has been tidied away, so it can't be sent from here again.")
    return await queueLinkedinComment(
      userId,
      {
        findId: row.findId,
        accountId: row.accountId,
        text: row.text,
        ...(row.parentCommentId ? { underCommentId: row.parentCommentId } : {}),
        helpOnly: row.helpOnly,
        asPageId: row.asPageId,
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
