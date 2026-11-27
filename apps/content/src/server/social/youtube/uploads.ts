import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { refuseBrokenAction } from "@/server/phones/action-checks"
import { promoPhones } from "@/server/phones/schema"
import { customShellMedia } from "@/server/schema"
import { archiveFileAt, archivePostWentOut } from "@/server/archive/files"
import { promoArchiveItems } from "@/server/archive/schema"
import { slowReason } from "@/server/bans/rules"
import { refuseImportantFirstYoutube } from "@/server/bans/throwaway-first"
import { brakeWords, halfOf } from "@/lib/bans/options"
import { phoneStepRefusal } from "@/lib/phones/options"
import { handleWords } from "@/lib/social/networks"
import { whenText } from "@/lib/social/wording"
import {
  isShort,
  splitTags,
  uploadWordsProblem,
  youtubeVideoLink,
  type YoutubePostStatus,
} from "@/lib/social/youtube/options"

import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { lockAccountWrites, mediaArgs } from "../phone-apps/posts"
import { promoAccounts, promoJobs } from "../schema"
import { youtubeUpload } from "./calls"
import { promoYoutubePosts, promoYoutubeTemplates } from "./schema"
import { readYoutubeSettings } from "./settings"

/**
 * Uploads to YouTube from a project (YouTube task, parts 3, 4 and 7).
 *
 * Pressing Post writes one row and one `youtube_upload` job. The channel's
 * browser downloads the file and uploads it through YouTube Studio, or its
 * phone puts the file in its gallery and uploads it in the YouTube app, a
 * tall video of three minutes or less through the Shorts screen. It is tried
 * once and never again: a browser or phone that stopped part-way may already
 * have uploaded it, and a second go could upload it twice. A failure leaves
 * its row and its reason.
 *
 * Every upload goes up Public, answers "No, it's not made for kids", and
 * answers YouTube's question about altered or synthetic content with the
 * tick in New post (Tyler, 26 Nov 2026: "A tick on each upload").
 */

type AccountRow = typeof promoAccounts.$inferSelect

/** The file types YouTube takes and Promo sends. */
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska", "video/mpeg"])

/** The thumbnail types YouTube takes. */
const PICTURE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"])

/** One of this person's own files by its address, from the media library or the Archive, or null. */
async function ownFile(
  userId: string,
  url: string,
  db: CustomShellDb
): Promise<{ mimeType: string; name: string; archiveItemId: string | null } | null> {
  const storagePath = url ? await storagePathForUrl(url) : null
  if (!storagePath) return null
  const [library] = await db
    .select({ mimeType: customShellMedia.mimeType, name: customShellMedia.originalName })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
    .limit(1)
  if (library) return { ...library, archiveItemId: null }
  const archived = await archiveFileAt(userId, storagePath, db)
  return archived ? { mimeType: archived.mimeType, name: archived.name, archiveItemId: archived.itemId } : null
}

/**
 * The video to upload, one of this person's own, with whether it goes up as
 * a Short. Only an Archive item says its shape and length, so a video from
 * the media library goes up as a long video.
 */
async function uploadableVideo(
  userId: string,
  url: string,
  db: CustomShellDb
): Promise<{ name: string; archiveItemId: string | null; short: boolean }> {
  const file = await ownFile(userId, url, db)
  if (!file) throw new Refusal("Pick a video from your media library or the archive first.")
  if (!VIDEO_TYPES.has(file.mimeType)) {
    throw new Refusal(`YouTube cannot take that file (${file.mimeType}). Pick an MP4, MOV, WebM, AVI or MKV video.`)
  }
  if (!file.archiveItemId) return { name: file.name, archiveItemId: null, short: false }
  const [item] = await db
    .select({ width: promoArchiveItems.width, height: promoArchiveItems.height, durationMs: promoArchiveItems.durationMs })
    .from(promoArchiveItems)
    .where(eq(promoArchiveItems.id, file.archiveItemId))
    .limit(1)
  return { name: file.name, archiveItemId: file.archiveItemId, short: item ? isShort(item) : false }
}

/** The thumbnail, a JPEG or PNG of this person's own, or "" for none. */
async function thumbnailFile(userId: string, url: string, db: CustomShellDb): Promise<string> {
  const trimmed = url.trim()
  if (!trimmed) return ""
  const file = await ownFile(userId, trimmed, db)
  if (!file) throw new Refusal("The thumbnail is not in your media library or the archive. Pick it again.")
  if (!PICTURE_TYPES.has(file.mimeType)) throw new Refusal(`YouTube takes a JPEG or PNG thumbnail. That one is ${file.mimeType}.`)
  return trimmed
}

/**
 * Refuses a YouTube channel that cannot take an upload now, with what to do
 * about it. Said when Post is pressed, so nothing is queued only to fail.
 */
export async function refuseYoutubeChannel(userId: string, account: AccountRow, db: CustomShellDb = defaultDb): Promise<void> {
  if (account.platform !== "youtube") throw new Refusal("That account is not a YouTube channel.")
  const name = handleWords("youtube", account.handle) || "This YouTube channel"
  if (account.retiredAt) throw new Refusal(`${name} is retired. Bring it back on the Accounts dashboard first.`)
  if (account.banScreenAt) {
    throw new Refusal(`${name} hit a ban screen and was stopped. Let it run again from its settings on the Accounts dashboard once it is sorted.`)
  }
  const paused = await pausedBy(userId, account, db)
  if (paused) {
    throw new Refusal(
      paused === "account"
        ? `${name} is paused. Resume it on the Accounts dashboard first.`
        : paused === "brake"
          ? brakeWords("youtube")
          : paused === "network"
            ? `${name}'s network is paused on its project. Resume it in the project's left column first.`
            : `${name}'s project is paused. Resume the project first.`
    )
  }
  if (!account.phoneId && !account.profileId) {
    throw new Refusal(`${name} has no browser profile or phone. Pick where it runs on the Accounts dashboard.`)
  }
  if (!account.handle) {
    throw new Refusal(
      account.phoneId
        ? "YouTube has not been read signed in on this channel's phone yet. Sign in through the phone's screen on its rack's page, then press Check now on the Accounts dashboard."
        : "YouTube has not been read signed in in this channel's browser yet. Sign in in the browser window in the Anti Detect dashboard's Profiles, then press Check now on the Accounts dashboard."
    )
  }
  if (!account.phoneId) return
  const [phone] = await db
    .select({ name: promoPhones.name, kind: promoPhones.kind })
    .from(promoPhones)
    .where(eq(promoPhones.id, account.phoneId))
    .limit(1)
  if (!phone) throw new Refusal("That channel's phone is not there any more. Pick where it runs on the Accounts dashboard.")
  // The YouTube app's steps were written for Android, as Threads' and the Story's were.
  if (phone.kind === "iphone") throw new Refusal("YouTube is not done on an iPhone yet. Upload from a channel on an Android phone or in a browser.")
  const cannot = phoneStepRefusal("youtube/upload", phone.name)
  if (cannot) throw new Refusal(cannot)
  await refuseBrokenAction(userId, "youtube/upload", phone.kind, db)
}

/**
 * Refuses an upload past the channel's number for the day (Settings →
 * Behaviour, 3 to begin with), counting what went up in the last 24 hours and
 * what is on its way. At half pace after a ban nearby, half that number.
 */
export async function refuseYoutubeUploadNow(userId: string, account: AccountRow, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const { uploadsPerDay } = await readYoutubeSettings(userId, db)
  const slow = await slowReason(userId, account, db, now)
  const allowed = slow ? halfOf(uploadsPerDay) : uploadsPerDay
  const since = new Date(now.getTime() - 86_400_000)
  // An upload counts once it is up, or while its job is still queued or running;
  // one whose job failed or was dropped is not on its way.
  const rows = await db
    .select({ postedAt: promoYoutubePosts.postedAt, createdAt: promoYoutubePosts.createdAt, status: promoYoutubePosts.status })
    .from(promoYoutubePosts)
    .leftJoin(promoJobs, eq(promoJobs.id, promoYoutubePosts.jobId))
    .where(
      and(
        eq(promoYoutubePosts.accountId, account.id),
        or(
          and(eq(promoYoutubePosts.status, "waiting"), inArray(promoJobs.status, ["queued", "running"])),
          and(eq(promoYoutubePosts.status, "posted"), gte(promoYoutubePosts.postedAt, since))
        )
      )
    )
  if (rows.length < allowed) return
  const name = handleWords("youtube", account.handle) || "This channel"
  const posted = rows.flatMap((row) => (row.status === "posted" && row.postedAt ? [row.postedAt] : [])).sort((a, b) => a.getTime() - b.getTime())
  const lead = slow ? `${slow}: ` : ""
  const many = `${allowed} ${allowed === 1 ? "video" : "videos"} a day`
  if (posted.length >= allowed && posted[0]) {
    const next = new Date(posted[0].getTime() + 86_400_000)
    throw new Refusal(`${lead}${name} may upload ${many}, and has. The next is allowed ${whenText(next, now)}.`)
  }
  throw new Refusal(`${lead}${name} may upload ${many}, and that many are up or on their way.`)
}

/** The account, by id, if it is this person's. */
async function ownChannel(userId: string, accountId: string, db: CustomShellDb): Promise<AccountRow> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Refusal("That channel is not there any more.")
  return account
}

export type YoutubeUploadInput = {
  accountId: string
  mediaUrl: string
  title: string
  description: string
  /** The tags box as typed: commas between them. */
  tags: string
  thumbnailUrl: string
  aiMade: boolean
  templateId: string | null
  /** What the AI wrote before any edit, kept beside what went out. */
  draftTitle: string
  draftDescription: string
}

/**
 * Sends one video to the channel's browser or phone to upload, because a
 * person pressed Post. The same file and title already on its way from the
 * same channel is refused, so a second press never uploads twice.
 */
export async function queueYoutubeUpload(
  userId: string,
  input: YoutubeUploadInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ id: string }> {
  const account = await ownChannel(userId, input.accountId, db)
  await refuseYoutubeChannel(userId, account, db)
  const title = input.title.replace(/\s+/g, " ").trim()
  const description = input.description.replace(/\r\n/g, "\n").trim()
  const tags = splitTags(input.tags)
  const problem = uploadWordsProblem({ title, description, tags })
  if (problem) throw new Refusal(problem)
  const video = await uploadableVideo(userId, input.mediaUrl.trim(), db)
  // A Short takes no thumbnail of its own, so none is sent for one.
  const thumbnailUrl = video.short ? "" : await thumbnailFile(userId, input.thumbnailUrl, db)
  if (input.templateId) {
    const [template] = await db
      .select({ id: promoYoutubeTemplates.id })
      .from(promoYoutubeTemplates)
      .where(and(eq(promoYoutubeTemplates.id, input.templateId), eq(promoYoutubeTemplates.userId, userId)))
      .limit(1)
    if (!template) throw new Refusal("That description template is not there any more. Pick another, or none.")
  }
  // A throwaway goes first with a kind of upload new to an important channel (Bans task, part 22).
  await refuseImportantFirstYoutube(account, video.short, db, now)

  const id = uuid()
  const jobId = uuid()
  const mediaUrl = input.mediaUrl.trim()
  await db.transaction(async (tx) => {
    // Checked and written under a lock on the account, so two presses at
    // once cannot both pass. An upload whose job failed is not on its way, so
    // the same video may go up again.
    await lockAccountWrites(tx, account.id)
    // The day's number is read under the lock too, so two presses at once cannot both take the last place.
    await refuseYoutubeUploadNow(userId, account, tx, now)
    const [twin] = await tx
      .select({ id: promoYoutubePosts.id })
      .from(promoYoutubePosts)
      .innerJoin(promoJobs, eq(promoJobs.id, promoYoutubePosts.jobId))
      .where(
        and(
          eq(promoYoutubePosts.accountId, account.id),
          eq(promoYoutubePosts.status, "waiting"),
          eq(promoYoutubePosts.mediaUrl, mediaUrl),
          eq(promoYoutubePosts.title, title),
          inArray(promoJobs.status, ["queued", "running"])
        )
      )
      .limit(1)
    if (twin) throw new Refusal("That video is already on its way from this channel, so it was not sent twice.")
    await tx.insert(promoYoutubePosts).values({
      id,
      userId,
      accountId: account.id,
      projectId: account.projectId,
      mediaUrl,
      mediaName: video.name.slice(0, 255),
      archiveItemId: video.archiveItemId,
      isShort: video.short,
      title,
      description,
      tags,
      draftTitle: input.draftTitle.trim().slice(0, 100),
      draftDescription: input.draftDescription.trim().slice(0, 10_000),
      templateId: input.templateId,
      thumbnailUrl,
      aiMade: input.aiMade,
      jobId,
      createdAt: now,
    })
    await queueJob(userId, "youtube_upload", { accountId: account.id, postId: id }, tx, null, jobId)
  })
  return { id }
}

/** Runs a `youtube_upload` job in the channel's browser or on its phone, and records how it went. */
export async function runYoutubeUpload(
  userId: string,
  account: AccountRow,
  target: CommandTarget,
  payload: Record<string, unknown>,
  jobId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (account.platform !== "youtube") throw new Refusal("Only a YouTube channel uploads from here.")
  const postId = String(payload.postId ?? "")
  const [post] = postId
    ? await db
        .select()
        .from(promoYoutubePosts)
        .where(and(eq(promoYoutubePosts.id, postId), eq(promoYoutubePosts.userId, userId), eq(promoYoutubePosts.accountId, account.id)))
        .limit(1)
    : []
  if (!post) throw new Refusal("That upload was called off before it started. Nothing was sent.")
  if (post.status !== "waiting" || post.jobId !== jobId) throw new Refusal("That upload is not waiting for this job any more. Nothing was sent.")
  let answer: Awaited<ReturnType<typeof youtubeUpload>>
  try {
    answer = await youtubeUpload(target, {
      ...(await mediaArgs(userId, account.phoneId, post.mediaUrl, db, now)),
      short: post.isShort,
      title: post.title,
      description: post.description,
      tags: post.tags,
      thumbnailUrl: post.thumbnailUrl,
      aiMade: post.aiMade,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoYoutubePosts)
      .set({ status: "failed", lastError: message.slice(0, 2_000) })
      .where(eq(promoYoutubePosts.id, post.id))
    throw error
  }
  const link = youtubeVideoLink(answer.postUrl)
  const thumbnailNote =
    post.thumbnailUrl && answer.thumbnailSet === false
      ? answer.thumbnailNote.trim().slice(0, 500) ||
        "YouTube did not take the thumbnail. A channel must be verified with a phone number before it can set its own."
      : ""
  // Marked posted first, so nothing that follows can turn a finished upload into a failed one.
  await db
    .update(promoYoutubePosts)
    .set({ status: "posted", postUrl: link, postedAt: now, lastError: "", thumbnailNote })
    .where(eq(promoYoutubePosts.id, post.id))
  await db.update(promoAccounts).set({ lastPostedAt: now, updatedAt: now }).where(eq(promoAccounts.id, account.id))
  // Its own errors are caught and logged inside: the upload is up whatever Video says.
  await archivePostWentOut(userId, post.archiveItemId, "youtube", link, { db, now })
}

export type YoutubePostRow = {
  id: string
  account: { id: string; handle: string }
  mediaUrl: string
  mediaName: string
  isShort: boolean
  title: string
  description: string
  tags: string[]
  thumbnailUrl: string
  thumbnailNote: string
  aiMade: boolean
  /** An upload whose job failed or was dropped by a ban screen reads as failed, with why. */
  status: YoutubePostStatus
  postUrl: string
  lastError: string
  /** True while its job is still waiting, so it can be called off. */
  cancellable: boolean
  views: number | null
  likes: number | null
  comments: number | null
  numbersReadAt: Date | null
  createdAt: Date
  postedAt: Date | null
}

/** One project's uploads, newest first. */
export async function listYoutubePosts(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<YoutubePostRow[]> {
  const rows = await db
    .select({ post: promoYoutubePosts, handle: promoAccounts.handle, jobStatus: promoJobs.status, jobError: promoJobs.lastError })
    .from(promoYoutubePosts)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoYoutubePosts.accountId))
    .leftJoin(promoJobs, eq(promoJobs.id, promoYoutubePosts.jobId))
    .where(and(eq(promoYoutubePosts.userId, userId), eq(promoYoutubePosts.projectId, projectId)))
    .orderBy(desc(promoYoutubePosts.createdAt))
    .limit(500)
  return rows.map(({ post, handle, jobStatus, jobError }) => {
    const lost = post.status === "waiting" && (jobStatus === "failed" || jobStatus === null)
    return {
      id: post.id,
      account: { id: post.accountId, handle },
      mediaUrl: post.mediaUrl,
      mediaName: post.mediaName,
      isShort: post.isShort,
      title: post.title,
      description: post.description,
      tags: post.tags,
      thumbnailUrl: post.thumbnailUrl,
      thumbnailNote: post.thumbnailNote,
      aiMade: post.aiMade,
      status: lost ? "failed" : post.status,
      postUrl: post.postUrl,
      lastError: lost ? jobError || "The upload did not finish. Look at the channel on YouTube before uploading again." : post.lastError,
      cancellable: post.status === "waiting" && jobStatus === "queued",
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      numbersReadAt: post.numbersReadAt,
      createdAt: post.createdAt,
      postedAt: post.postedAt,
    }
  })
}

/**
 * Calls off uploads that have not started: each one's job is taken off the
 * queue and the row deleted. One that has started, or is no longer waiting,
 * is left. Answers which were called off and which were not.
 */
export async function cancelYoutubePosts(userId: string, ids: string[], db: CustomShellDb = defaultDb): Promise<{ completed: string[]; skipped: string[] }> {
  if (!ids.length) return { completed: [], skipped: [] }
  const posts = await db
    .select({ id: promoYoutubePosts.id, jobId: promoYoutubePosts.jobId })
    .from(promoYoutubePosts)
    .where(and(eq(promoYoutubePosts.userId, userId), inArray(promoYoutubePosts.id, ids), eq(promoYoutubePosts.status, "waiting")))
  const jobIds = posts.flatMap((post) => (post.jobId ? [post.jobId] : []))
  const dropped = jobIds.length
    ? await db
        .delete(promoJobs)
        .where(and(inArray(promoJobs.id, jobIds), eq(promoJobs.status, "queued")))
        .returning({ id: promoJobs.id })
    : []
  const droppedJobs = new Set(dropped.map((job) => job.id))
  const completed = posts.filter((post) => post.jobId && droppedJobs.has(post.jobId)).map((post) => post.id)
  if (completed.length) await db.delete(promoYoutubePosts).where(inArray(promoYoutubePosts.id, completed))
  return { completed, skipped: ids.filter((id) => !completed.includes(id)) }
}

/**
 * Uploads that need you on the project's YouTube row: failed ones, and ones
 * whose job failed or was dropped by a ban screen.
 */
export async function youtubeNeedsYou(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoYoutubePosts)
    .leftJoin(promoJobs, eq(promoJobs.id, promoYoutubePosts.jobId))
    .where(
      and(
        eq(promoYoutubePosts.userId, userId),
        eq(promoYoutubePosts.projectId, projectId),
        or(
          eq(promoYoutubePosts.status, "failed"),
          and(eq(promoYoutubePosts.status, "waiting"), or(sql`${promoJobs.id} IS NULL`, eq(promoJobs.status, "failed")))
        )
      )
    )
  return row?.count ?? 0
}
