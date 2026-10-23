import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { isAwake, zoneClockText } from "@/lib/social/waking"
import {
  MAX_THREAD_PIECES,
  POLL_CHOICE_CHARS,
  POLL_CHOICES,
  POLL_MINUTES,
  xLength,
  xPostLimit,
  xPostUrl,
  type XIncoming,
  type XPoll,
  type XPostPiece,
  type XPostStatus,
} from "@/lib/social/x/options"
import { xMayHaveLanded, xPostingRefusal } from "@/lib/social/x/wording"

import { refuseXInteraction } from "../apart"
import { readBehaviour } from "../behaviour"
import { queueJob } from "../jobs"
import { redditCommentsWorthAnArticle } from "../medium/articles"
import { mediaArgs } from "../phone-apps/posts"
import { promoMediumArticles } from "../medium/schema"
import { ownedProject } from "../projects"
import { promoAccounts, promoJobs } from "../schema"
import { xPublish } from "./calls"
import { projectCommunity } from "./communities"
import { answeredXIds, toAnswerCount } from "./replies"
import { readXPostingState, refuseXOnPhone, xWritingAccount } from "./posting"
import { promoXPosts, promoXReplies } from "./schema"
import { closestXPiece, similarWarning } from "./similar"

/**
 * Posts and threads of the account's own (parts 29 to 35): a draft in
 * Promo, then Post, through the same warm-up, pace and waking checks as a
 * reply. Tyler, 21 Oct 2026: "Any X account" past its warm-up may publish.
 *
 * A thread posts one piece at a time, each under the one before. A failure
 * halfway stops, says which piece, and Try again carries on from there
 * without posting the earlier pieces again, because each piece's id is
 * written down the moment X takes it.
 *
 * Own posts may carry a link; replies never do (Tyler's answer).
 */

type PostRow = typeof promoXPosts.$inferSelect

/** Ten seconds to undo, as for a reply. */
const UNDO_SECONDS = 10

export type XPostInput = {
  accountId: string | null
  pieces: Array<{ text: string; pictureUrl: string }>
  poll: { choices: string[]; minutes: number } | null
  communityId: string
  source: string
  /** The hour a person picked (part 31), or null for as soon as Post is pressed. */
  scheduledFor: Date | null
}

export type XPostView = {
  id: string
  account: { id: string; handle: string } | null
  pieces: XPostPiece[]
  poll: XPoll | null
  communityId: string
  source: string
  status: XPostStatus
  scheduledFor: Date | null
  lastError: string
  url: string
  views: number | null
  likes: number | null
  replyCount: number | null
  reposts: number | null
  stillVisible: boolean | null
  checkedAt: Date | null
  /** The replies under it, each saying whether Promo answered it, null until read. */
  incoming: Array<XIncoming & { answered: boolean }> | null
  toAnswer: number
  deletedAt: Date | null
  createdAt: Date
  postedAt: Date | null
  /** How many pieces are up, for a thread that stopped halfway. */
  piecesUp: number
}

function view(row: PostRow, handle: string | null, answered: Set<string>): XPostView {
  const first = row.pieces[0]?.postId ?? ""
  return {
    id: row.id,
    account: row.accountId && handle !== null ? { id: row.accountId, handle } : null,
    pieces: row.pieces,
    poll: row.poll,
    communityId: row.communityId,
    source: row.source,
    status: row.status,
    scheduledFor: row.scheduledFor,
    lastError: row.lastError,
    url: first ? xPostUrl(first, handle ?? "i") : "",
    views: row.views,
    likes: row.likes,
    replyCount: row.replyCount,
    reposts: row.reposts,
    stillVisible: row.stillVisible,
    checkedAt: row.checkedAt,
    incoming: row.incoming?.map((item) => ({ ...item, answered: answered.has(item.id) })) ?? null,
    toAnswer: toAnswerCount(row.incoming, answered),
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    piecesUp: row.pieces.filter((piece) => piece.postId).length,
  }
}

/** The project's own posts and threads, newest first. */
export async function listXPosts(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<XPostView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ post: promoXPosts, handle: promoAccounts.handle })
    .from(promoXPosts)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoXPosts.accountId))
    .where(and(eq(promoXPosts.userId, userId), eq(promoXPosts.projectId, projectId)))
    .orderBy(desc(promoXPosts.createdAt))
    .limit(200)
  const answered = await answeredXIds(userId, db)
  return rows.map(({ post, handle }) => view(post, handle, answered))
}

async function ownedPost(userId: string, postRowId: string, db: CustomShellDb): Promise<PostRow> {
  const [row] = await db
    .select()
    .from(promoXPosts)
    .where(and(eq(promoXPosts.id, postRowId), eq(promoXPosts.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That post is not saved any more.")
  return row
}

/** Checks an account belongs to the project and is an X account, for a draft that names one. */
async function projectXAccount(userId: string, projectId: string, accountId: string, db: CustomShellDb): Promise<void> {
  const [account] = await db
    .select({ platform: promoAccounts.platform, projectId: promoAccounts.projectId })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "x") throw new Refusal("Pick an X account first.")
  if (account.projectId !== projectId) throw new Refusal("That account is not in this project.")
}

/** The pieces as stored: trimmed, at most ten, a picture only as an https address. */
function cleanPieces(pieces: XPostInput["pieces"]): XPostPiece[] {
  if (pieces.length > MAX_THREAD_PIECES) throw new Refusal(`A thread here holds at most ${MAX_THREAD_PIECES} posts.`)
  return pieces.map((piece) => {
    const pictureUrl = piece.pictureUrl.trim()
    if (pictureUrl && !/^https:\/\//.test(pictureUrl)) throw new Refusal("Pick the picture from the media library.")
    return { text: piece.text.trim(), pictureUrl: pictureUrl.slice(0, 2_048), postId: "" }
  })
}

/** The picture types X takes on a post. */
const X_PICTURE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"])

/**
 * Refuses a picture that is not one of this person's own media library
 * images. The browser and the phone only ever download Promo's own files, so
 * no address a person typed is fetched from the server or a phone.
 */
async function refuseStrangePictures(userId: string, pieces: Array<{ pictureUrl: string }>, db: CustomShellDb): Promise<void> {
  for (const piece of pieces) {
    if (!piece.pictureUrl) continue
    const storagePath = await storagePathForUrl(piece.pictureUrl)
    const [file] = storagePath
      ? await db
          .select({ mimeType: customShellMedia.mimeType })
          .from(customShellMedia)
          .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
          .limit(1)
      : []
    if (!file) throw new Refusal("Pick the picture from your media library.")
    if (!X_PICTURE_TYPES.has(file.mimeType)) throw new Refusal(`X can't post that file (${file.mimeType}). Pick a JPEG, PNG, WebP or GIF picture.`)
  }
}

/** Refuses a poll X would not take: two to four choices of at most 25 characters, open 5 minutes to 7 days. */
function cleanPoll(poll: XPostInput["poll"]): XPoll | null {
  if (!poll) return null
  const choices = poll.choices.map((choice) => choice.trim()).filter(Boolean)
  if (choices.length < POLL_CHOICES.min || choices.length > POLL_CHOICES.max) {
    throw new Refusal(`A poll has ${POLL_CHOICES.min} to ${POLL_CHOICES.max} choices.`)
  }
  if (choices.some((choice) => choice.length > POLL_CHOICE_CHARS)) {
    throw new Refusal(`Each poll choice is at most ${POLL_CHOICE_CHARS} characters.`)
  }
  const minutes = Math.round(poll.minutes)
  if (!Number.isFinite(minutes) || minutes < POLL_MINUTES.min || minutes > POLL_MINUTES.max) {
    throw new Refusal("A poll stays open from 5 minutes to 7 days.")
  }
  return { choices, minutes, votes: null }
}

/** Saves a new draft post, or changes one that has not gone out. Returns its id. */
export async function saveXPost(
  userId: string,
  projectId: string,
  postRowId: string | null,
  input: XPostInput,
  db: CustomShellDb = defaultDb
): Promise<string> {
  await ownedProject(userId, projectId, db)
  if (input.accountId) await projectXAccount(userId, projectId, input.accountId, db)
  if (input.communityId && !(await projectCommunity(userId, projectId, input.communityId, db))) {
    throw new Refusal("Add that community on the Communities tab first.")
  }
  const pieces = cleanPieces(input.pieces)
  await refuseStrangePictures(userId, pieces, db)
  const values = {
    accountId: input.accountId,
    pieces,
    poll: cleanPoll(input.poll),
    communityId: input.communityId,
    source: input.source.slice(0, 80),
    scheduledFor: input.scheduledFor,
    updatedAt: new Date(),
  }
  if (!postRowId) {
    const id = uuid()
    await db.insert(promoXPosts).values({ id, userId, projectId, ...values })
    return id
  }
  const row = await ownedPost(userId, postRowId, db)
  if (row.projectId !== projectId) throw new Error("That post is in another project.")
  if (row.status !== "draft" && row.status !== "failed") throw new Refusal("That post has gone to X or is on its way, so it can't be changed here.")
  if (row.status === "failed" && row.pieces.some((piece) => piece.postId)) {
    throw new Refusal("Part of this thread is on X already. Try again carries on from where it stopped; it can't be changed.")
  }
  // Written only while it is still a draft or a failure, so a save that
  // lands after Post was pressed never changes words that were checked.
  const saved = await db
    .update(promoXPosts)
    .set(values)
    .where(and(eq(promoXPosts.id, row.id), inArray(promoXPosts.status, ["draft", "failed"])))
    .returning({ id: promoXPosts.id })
  if (!saved.length) throw new Refusal("That post has gone to X or is on its way, so it can't be changed here.")
  return row.id
}

/** Deletes a draft that never went to X. */
export async function deleteXDraftPost(userId: string, postRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status === "waiting" || row.status === "posted" || row.pieces.some((piece) => piece.postId)) {
    throw new Refusal("This post went to X. Delete it from X with Delete on the Posts tab.")
  }
  await db.delete(promoXPosts).where(eq(promoXPosts.id, row.id))
}

export type QueuedXPost = { jobId: string; runAfter: Date | null; undoUntil: Date | null; similarTo: string }

/**
 * Queues a post or thread a person pressed Post for, or refuses it with why
 * (parts 29 to 35). A picked hour must be inside the account's waking hours
 * (part 31); with no hour it goes at once, or at its morning. Try again on a
 * thread that stopped halfway goes the same way and posts only the pieces
 * still missing.
 */
export async function queueXPublish(
  userId: string,
  postRowId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedXPost> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status === "waiting") throw new Refusal("This post is already on its way.")
  if (row.status === "posted") throw new Refusal("This post is on X already.")
  if (!row.accountId) throw new Refusal("Pick the account it goes out as first.")
  const account = await xWritingAccount(userId, row.accountId, db)
  if (account.projectId !== row.projectId) throw new Refusal("That account is not in this post's project any more.")
  if (!row.pieces.length || row.pieces.some((piece) => !piece.text)) throw new Refusal("Write every post of the thread first, or take the empty one out.")
  const limit = xPostLimit(account.xPaid)
  const tooLong = row.pieces.findIndex((piece) => xLength(piece.text) > limit)
  if (tooLong >= 0) {
    throw new Refusal(
      `Post ${tooLong + 1} is ${xLength(row.pieces[tooLong]?.text ?? "")} characters. ${account.xPaid ? "Posts from here stop" : "X lets a free account post"} at ${limit}.`
    )
  }
  if (row.communityId) {
    refuseXOnPhone(account, "Posting into a community")
    if (!(await projectCommunity(userId, row.projectId, row.communityId, db))) throw new Refusal("That community is not on the Communities tab any more.")
  }
  if (row.poll) refuseXOnPhone(account, "A poll")
  await refuseStrangePictures(userId, row.pieces, db)
  // The X app looks nowhere before it types, so a phone's failure that may
  // have landed is never sent again from here (nothing is tried twice).
  if (row.status === "failed" && account.phoneId && xMayHaveLanded(row.lastError)) {
    throw new Refusal(
      "This went from a phone and may already be on X. Look at the account's page on X first. If it isn't there, delete this draft and write it again."
    )
  }
  // The X app does not show where a post landed, so a thread's next piece
  // would have nothing to go under.
  if (row.pieces.length > 1) refuseXOnPhone(account, "A thread")
  await refuseXInteraction(userId, account, { words: row.pieces.map((piece) => piece.text) }, db)

  const state = await readXPostingState(userId, account, db, now)
  const refusal = xPostingRefusal(state, now, state.timeZone)
  if (refusal) throw new Refusal(refusal)
  let runAfter: Date | null = state.nextWakeAt
  // A failed post is tried again now, whatever hour it was set for.
  if (row.scheduledFor && row.status !== "failed") {
    if (row.scheduledFor.getTime() <= now.getTime()) throw new Refusal("That time has passed. Pick a later one, or clear it to post now.")
    const behaviour = await readBehaviour(userId, db)
    if (!isAwake(row.scheduledFor, state.timeZone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute)) {
      throw new Refusal(
        `${zoneClockText(row.scheduledFor, state.timeZone)} is outside the account's waking hours, so it would never post then. Pick a time inside them.`
      )
    }
    runAfter = row.scheduledFor
  }
  const close = await closestXPiece(userId, account.id, row.pieces.map((piece) => piece.text).join("\n"), db)
  const similarTo = close ? similarWarning(close) : ""
  const undoUntil = runAfter ? null : new Date(now.getTime() + UNDO_SECONDS * 1000)
  const jobId = uuid()
  // Under the account's lock, the one replies take, so a post and a reply
  // pressed together can't both pass a pace with one place left.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-x-write:${account.id}`}))`)
    const paced = await readXPostingState(userId, account, tx, now)
    const late = xPostingRefusal(paced, now, paced.timeZone)
    if (late) throw new Refusal(late)
    // Moved to waiting only from where it was, so two presses at once queue one job.
    const moved = await tx
      .update(promoXPosts)
      .set({ status: "waiting", jobId, lastError: "", updatedAt: now })
      .where(and(eq(promoXPosts.id, row.id), eq(promoXPosts.status, row.status)))
      .returning({ id: promoXPosts.id })
    if (!moved.length) throw new Refusal("This post is already on its way.")
    await queueJob(userId, "x_publish", { postRowId: row.id, accountId: account.id }, tx, runAfter ?? undoUntil, jobId)
  })
  return { jobId, runAfter, undoUntil, similarTo }
}

/** Takes back a post still waiting: in its ten seconds, or before its hour. */
export async function cancelXPublish(userId: string, postRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status !== "waiting" || !row.jobId) throw new Error("That post is no longer waiting.")
  const removed = await db
    .delete(promoJobs)
    .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), eq(promoJobs.status, "queued")))
    .returning({ id: promoJobs.id })
  if (!removed.length) throw new Error("That post is no longer waiting. It may have started going to X.")
  const back = row.pieces.some((piece) => piece.postId) ? "failed" : "draft"
  await db.update(promoXPosts).set({ status: back, jobId: null, updatedAt: new Date() }).where(eq(promoXPosts.id, row.id))
}

/**
 * Posts the pieces still missing, one at a time, each under the one before,
 * from the account's browser or phone. Each piece's id is written the moment
 * X takes it, so a failure halfway leaves the earlier pieces recorded and
 * Try again carries on from the next one.
 *
 * On a phone a post is one piece, and the X app does not show where it
 * landed: it is marked posted with no id, and a search account looks it up a
 * minute later. An iPhone gets its picture through a one-time link, as
 * Instagram's posts do.
 */
export async function runXPublish(
  userId: string,
  postRowId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  jobId: string | null = null
): Promise<void> {
  const row = await ownedPost(userId, postRowId, db)
  if (row.status !== "waiting") throw new Refusal("That post has been dealt with already.")
  // Each piece's id is always saved, so nothing that landed is posted again,
  // but only a row still waiting is marked posted: a job the queue gave up on
  // never flips a failed post back.
  const stillOurs = and(eq(promoXPosts.id, row.id), eq(promoXPosts.status, "waiting"))
  const [account] = row.accountId
    ? await db.select({ phoneId: promoAccounts.phoneId }).from(promoAccounts).where(eq(promoAccounts.id, row.accountId)).limit(1)
    : []
  const onPhone = Boolean(account?.phoneId)
  const pieces = row.pieces.map((piece) => ({ ...piece }))
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]
    if (!piece || piece.postId) continue
    const before = index > 0 ? (pieces[index - 1]?.postId ?? "") : ""
    if (index > 0 && !before) throw new Error(`Post ${index} of the thread has no id, so post ${index + 1} has nothing to go under.`)
    try {
      const picture =
        piece.pictureUrl && onPhone ? (await mediaArgs(userId, account?.phoneId ?? null, piece.pictureUrl, db, now)).mediaUrl : piece.pictureUrl
      const sent = await xPublish(target, {
        text: piece.text,
        pictureUrl: picture,
        replyToId: before,
        communityId: index === 0 ? row.communityId : "",
        poll: index === 0 && row.poll ? { choices: row.poll.choices, minutes: row.poll.minutes } : null,
        // A first post tried before, maybe hours ago, is looked for back to its first try.
        ...(index === 0 ? { since: Math.floor(row.createdAt.getTime() / 1000) } : {}),
      })
      if (/^\d{5,25}$/.test(sent.postId)) piece.postId = sent.postId
      else if (!onPhone) throw new Error("X took the post but did not say where it landed. Look at the account's page before trying again.")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const where = pieces.length > 1 ? `Stopped at post ${index + 1} of ${pieces.length}. ` : ""
      await db
        .update(promoXPosts)
        .set({ pieces, status: "failed", lastError: `${where}${message}`.slice(0, 2_000), updatedAt: new Date() })
        .where(eq(promoXPosts.id, row.id))
      throw error
    }
    const [saved] = await db
      .update(promoXPosts)
      .set({ pieces, updatedAt: new Date() })
      .where(eq(promoXPosts.id, row.id))
      .returning({ status: promoXPosts.status })
    if (saved?.status !== "waiting") throw new Refusal(`The post stopped waiting while post ${index + 1} of ${pieces.length} went out. Look at the account's page on X before trying again.`)
    // A thread of ten long posts can take longer to type than the queue waits
    // for a visit, so each piece that lands tells the queue the job is alive.
    if (jobId) await db.update(promoJobs).set({ claimedAt: new Date() }).where(and(eq(promoJobs.id, jobId), eq(promoJobs.status, "running")))
  }
  const [posted] = await db
    .update(promoXPosts)
    .set({ status: "posted", postedAt: now, lastError: "", updatedAt: now })
    .where(stillOurs)
    .returning({ id: promoXPosts.id })
  if (!posted) return
  if (row.accountId) await db.update(promoAccounts).set({ lastPostedAt: now }).where(eq(promoAccounts.id, row.accountId))
  if (!pieces[0]?.postId) {
    try {
      await queueJob(userId, "x_check", { postRowId: row.id }, db, new Date(now.getTime() + 60_000))
    } catch (error) {
      console.warn(`X post ${row.id} went out, but its address can't be looked up: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export type XPostSource = {
  /** `medium:<article id>` or `reddit:<comment id>`. */
  source: string
  label: string
  text: string
  /** The Medium article's own address, which the thread ends with (part 32), or "". */
  endLink: string
}

/**
 * What a post or thread can start from: the project's published Medium
 * articles (part 32) and its best Reddit comments still up (part 29).
 */
export async function xPostSources(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<XPostSource[]> {
  await ownedProject(userId, projectId, db)
  const articles = await db
    .select({ id: promoMediumArticles.id, title: promoMediumArticles.title, body: promoMediumArticles.body, url: promoMediumArticles.url })
    .from(promoMediumArticles)
    .where(
      and(
        eq(promoMediumArticles.userId, userId),
        eq(promoMediumArticles.projectId, projectId),
        eq(promoMediumArticles.status, "published"),
        isNull(promoMediumArticles.deletedAt),
        ne(promoMediumArticles.url, "")
      )
    )
    .orderBy(desc(promoMediumArticles.publishedAt))
    .limit(10)
  const comments = await redditCommentsWorthAnArticle(userId, projectId, db)
  return [
    ...articles.map((article) => ({
      source: `medium:${article.id}`,
      label: `Medium article: ${article.title}`,
      text: `${article.title}\n\n${article.body}`,
      endLink: article.url,
    })),
    ...comments.map((comment) => ({
      source: `reddit:${comment.id}`,
      label: `Reddit comment${comment.upvotes === null ? "" : `, ${comment.upvotes} upvotes`}: ${comment.postTitle}`,
      text: comment.text,
      endLink: "",
    })),
  ]
}

/** The project's quote posts, for the Posts tab beside the posts of its own (part 34). */
export async function listXQuotes(userId: string, projectId: string, db: CustomShellDb = defaultDb) {
  return db
    .select({
      id: promoXReplies.id,
      handle: promoAccounts.handle,
      text: promoXReplies.text,
      targetHandle: promoXReplies.targetHandle,
      targetUrl: promoXReplies.targetUrl,
      postUrl: promoXReplies.postUrl,
      status: promoXReplies.status,
      views: promoXReplies.views,
      likes: promoXReplies.likes,
      stillVisible: promoXReplies.stillVisible,
      deletedAt: promoXReplies.deletedAt,
      createdAt: promoXReplies.createdAt,
      postedAt: promoXReplies.postedAt,
    })
    .from(promoXReplies)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoXReplies.accountId))
    .leftJoin(promoJobs, eq(promoJobs.id, promoXReplies.jobId))
    .where(
      and(
        eq(promoXReplies.userId, userId),
        eq(promoXReplies.projectId, projectId),
        eq(promoXReplies.kind, "quote"),
        // A failed quote that was dismissed is off the Failed list, so it is off this one too.
        sql`not (${promoXReplies.status} = 'failed' and ${promoJobs.dismissedAt} is not null)`
      )
    )
    .orderBy(desc(promoXReplies.createdAt))
    .limit(100)
}
