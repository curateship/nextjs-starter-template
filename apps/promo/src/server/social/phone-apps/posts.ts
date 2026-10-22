import { and, desc, eq, inArray, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { refuseBrokenAction } from "@/server/phones/action-checks"
import { makeMediaLink } from "@/server/phones/media-links"
import { promoPhones } from "@/server/phones/schema"
import { customShellMedia } from "@/server/schema"
import { phoneStepRefusal } from "@/lib/phones/options"
import { handleWords, isPhoneAppNetwork, NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { captionProblem, type PhoneAppMediaKind, type PhoneAppPostStatus } from "@/lib/social/phone-apps"

import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoAppPosts, promoJobs } from "../schema"
import { appPost } from "./calls"

/**
 * Photos and videos posted on Instagram and TikTok from the media library
 * (phone farm file 06, part 34).
 *
 * Pressing Post writes one row and one `app_post` job. The phone downloads
 * the file, puts it in its gallery and posts it through the app's own share
 * screen with the caption typed at a person's pace. It is tried once and
 * never again: a phone that stopped part-way may already have posted, and a
 * second go could post twice. A failure leaves its row, its reason and the
 * phone's step pictures (file 03, part 17).
 */

type AccountRow = typeof promoAccounts.$inferSelect

/** The file types each app takes from the gallery. */
const TAKES: Record<PhoneAppNetwork, Record<PhoneAppMediaKind, ReadonlySet<string>>> = {
  instagram: {
    photo: new Set(["image/jpeg", "image/jpg", "image/png"]),
    video: new Set(["video/mp4", "video/quicktime"]),
  },
  tiktok: {
    photo: new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
    video: new Set(["video/mp4", "video/quicktime", "video/webm"]),
  },
}

/**
 * One of this person's own media library files, by its address, with what
 * kind of post it makes on this network, or a refusal saying why it cannot
 * be posted. Any other address is refused: the phone only ever downloads
 * Promo's own files.
 */
async function postableMedia(
  userId: string,
  network: PhoneAppNetwork,
  url: string,
  db: CustomShellDb = defaultDb
): Promise<{ kind: PhoneAppMediaKind; name: string }> {
  const storagePath = url ? await storagePathForUrl(url) : null
  const [row] = storagePath
    ? await db
        .select({ mimeType: customShellMedia.mimeType, fileType: customShellMedia.fileType, name: customShellMedia.originalName })
        .from(customShellMedia)
        .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
        .limit(1)
    : []
  if (!row) throw new Error("Pick a photo or video from your media library first.")
  const kind: PhoneAppMediaKind | null = row.fileType === "image" ? "photo" : row.fileType === "video" ? "video" : null
  if (!kind || !TAKES[network][kind].has(row.mimeType)) {
    const allowed = network === "instagram" ? "a JPEG or PNG photo, or an MP4 or MOV video" : "a JPEG, PNG or WebP photo, or an MP4, MOV or WebM video"
    throw new Error(`${NETWORK_NAMES[network]} cannot post that file (${row.mimeType}). Pick ${allowed}.`)
  }
  return { kind, name: row.name }
}

/**
 * Refuses an Instagram or TikTok account that cannot take a job on its phone
 * now, with what to do about it. Said when the button is pressed, so nothing
 * is queued only to fail.
 */
export async function refuseAppAccount(
  userId: string,
  account: AccountRow,
  routine: string,
  db: CustomShellDb = defaultDb
): Promise<PhoneAppNetwork> {
  if (!isPhoneAppNetwork(account.platform)) throw new Error("That account is not an Instagram or TikTok account.")
  const network = account.platform
  const name = handleWords(network, account.handle) || `This ${NETWORK_NAMES[network]} account`
  if (account.retiredAt) throw new Error(`${name} is retired. Bring it back on the Accounts dashboard first.`)
  if (account.banScreenAt) {
    throw new Error(`${name} hit a ban screen and was stopped. Let it run again from its settings on the Accounts dashboard once it is sorted.`)
  }
  const paused = await pausedBy(userId, account, db)
  if (paused) {
    throw new Error(
      paused === "account"
        ? `${name} is paused. Resume it on the Accounts dashboard first.`
        : paused === "network"
          ? `${name}'s network is paused on its project. Resume it in the project's left column first.`
          : `${name}'s project is paused. Resume the project first.`
    )
  }
  if (!account.phoneId) throw new Error(`${name} is on no phone. Pick its phone on the Accounts dashboard.`)
  if (!account.handle) {
    throw new Error(
      `${NETWORK_NAMES[network]} has not been read signed in on this account's phone yet. Sign in through the phone's screen on the Phones dashboard, then press Check now on the Accounts dashboard.`
    )
  }
  const [phone] = await db
    .select({ name: promoPhones.name, kind: promoPhones.kind })
    .from(promoPhones)
    .where(eq(promoPhones.id, account.phoneId))
    .limit(1)
  if (!phone) throw new Error("That account's phone is not there any more. Pick where it runs on the Accounts dashboard.")
  const cannot = phoneStepRefusal(routine, phone.name)
  if (cannot) throw new Error(cannot)
  await refuseBrokenAction(userId, routine, phone.kind, db)
  return network
}

/** The account, by id, if it is this person's. */
export async function ownAccount(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<AccountRow> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Error("That account is not there any more.")
  return account
}

/**
 * Holds an account's post and profile writes to one at a time until the
 * transaction ends, so a check for one already on its way and the write after
 * it cannot both pass for two presses at once.
 */
export async function lockAccountWrites(tx: Pick<CustomShellDb, "execute">, accountId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-app-write:${accountId}`}))`)
}

/**
 * Sends one photo or video to the account's phone to post, because a person
 * pressed Post. `draftCaption` is what the AI wrote before any edit, kept so
 * what was asked for and what went out can be compared. The same file and
 * caption already on its way from the same account is refused, so a second
 * press never posts twice.
 */
export async function queueAppPost(
  userId: string,
  input: { accountId: string; mediaUrl: string; caption: string; draftCaption: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ id: string }> {
  const account = await ownAccount(userId, input.accountId, db)
  const network = await refuseAppAccount(userId, account, `${account.platform}/post`, db)
  const caption = input.caption.trim()
  const problem = captionProblem(network, caption)
  if (problem) throw new Error(problem)
  const media = await postableMedia(userId, network, input.mediaUrl, db)

  // Checked and written under a lock on the account, so two presses at once
  // cannot both pass the check. A post whose job failed or was dropped is not
  // on its way, so the same file and caption may be posted again.
  const id = uuid()
  const jobId = uuid()
  await db.transaction(async (tx) => {
    await lockAccountWrites(tx, account.id)
    const [twin] = await tx
      .select({ id: promoAppPosts.id })
      .from(promoAppPosts)
      .innerJoin(promoJobs, eq(promoJobs.id, promoAppPosts.jobId))
      .where(
        and(
          eq(promoAppPosts.accountId, account.id),
          eq(promoAppPosts.status, "waiting"),
          eq(promoAppPosts.mediaUrl, input.mediaUrl),
          eq(promoAppPosts.caption, caption),
          inArray(promoJobs.status, ["queued", "running"])
        )
      )
      .limit(1)
    if (twin) throw new Error("That post is already on its way from this account, so it was not sent twice.")
    await tx.insert(promoAppPosts).values({
      id,
      userId,
      accountId: account.id,
      projectId: account.projectId,
      platform: network,
      mediaUrl: input.mediaUrl,
      mediaKind: media.kind,
      mediaName: media.name.slice(0, 255),
      caption,
      draftCaption: input.draftCaption.trim().slice(0, 10_000),
      jobId,
      createdAt: now,
    })
    await queueJob(userId, "app_post", { accountId: account.id, postId: id }, tx, null, jobId)
  })
  return { id }
}

/** Runs an `app_post` job on the account's phone, and records how it went. */
export async function runAppPost(
  userId: string,
  account: AccountRow,
  target: CommandTarget,
  payload: Record<string, unknown>,
  jobId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!isPhoneAppNetwork(account.platform)) throw new Refusal("Only an Instagram or TikTok account posts from here.")
  const postId = String(payload.postId ?? "")
  const [post] = postId
    ? await db
        .select()
        .from(promoAppPosts)
        .where(and(eq(promoAppPosts.id, postId), eq(promoAppPosts.userId, userId), eq(promoAppPosts.accountId, account.id)))
        .limit(1)
    : []
  if (!post) throw new Refusal("That post was cancelled before the phone got to it. Nothing was sent.")
  if (post.status !== "waiting" || post.jobId !== jobId) {
    throw new Refusal("That post is not waiting for this job any more. Nothing was sent.")
  }
  try {
    const answer = await appPost(target, account.platform, {
      ...(await mediaArgs(userId, account.phoneId, post.mediaUrl, db, now)),
      mediaKind: post.mediaKind,
      caption: post.caption,
    })
    await db
      .update(promoAppPosts)
      .set({ status: "posted", postUrl: postLink(account.platform, answer.postUrl), postedAt: now, lastError: "" })
      .where(eq(promoAppPosts.id, post.id))
    await db
      .update(promoAccounts)
      .set({ lastPostedAt: now, updatedAt: now })
      .where(eq(promoAccounts.id, account.id))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoAppPosts)
      .set({ status: "failed", lastError: message.slice(0, 2_000) })
      .where(eq(promoAppPosts.id, post.id))
    throw error
  }
}

/**
 * Where the phone gets the file from. An Android downloads the media library
 * file over USB from the rack. An iPhone cannot take a file that way, so it
 * gets a one-time link, good for ten minutes and one download, which the
 * rack opens in Safari on the phone and saves to Photos (part 55 of the phone
 * farm). The link rides under the same `mediaUrl` key, with `mediaFromSafari`
 * telling the rack which way to go.
 */
async function mediaArgs(
  userId: string,
  phoneId: string | null,
  mediaUrl: string,
  db: CustomShellDb,
  now: Date
): Promise<{ mediaUrl: string; mediaFromSafari?: true }> {
  const [phone] = phoneId
    ? await db.select({ kind: promoPhones.kind }).from(promoPhones).where(eq(promoPhones.id, phoneId)).limit(1)
    : []
  if (phone?.kind !== "iphone") return { mediaUrl }
  const storagePath = await storagePathForUrl(mediaUrl)
  const [file] = storagePath
    ? await db
        .select({ mimeType: customShellMedia.mimeType })
        .from(customShellMedia)
        .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
        .limit(1)
    : []
  if (!storagePath || !file) throw new Refusal("That file is not in your media library any more, so nothing was posted.")
  return { mediaUrl: await makeMediaLink(userId, { storagePath, mimeType: file.mimeType }, db, now), mediaFromSafari: true }
}

/**
 * The post's link as the phone read it, kept only when it is the network's own
 * https address, since the Posts tab opens it. Anything else is "", a post
 * without a link.
 */
export function postLink(network: PhoneAppNetwork, url: string): string {
  const shapes: Record<PhoneAppNetwork, RegExp> = {
    instagram: /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?(\?[^\s"<>]*)?$/,
    tiktok: /^https:\/\/((www|vm|vt)\.)?tiktok\.com\/[^\s"<>]+$/,
  }
  const link = url.trim()
  return link.length <= 600 && shapes[network].test(link) ? link : ""
}

export type AppPostRow = {
  id: string
  account: { id: string; handle: string }
  mediaUrl: string
  mediaKind: PhoneAppMediaKind
  mediaName: string
  caption: string
  /** A post whose job failed or was dropped by a ban screen reads as failed, with why. */
  status: PhoneAppPostStatus
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

/** One project's posts on one network, newest first. */
export async function listAppPosts(
  userId: string,
  projectId: string,
  network: PhoneAppNetwork,
  db: CustomShellDb = defaultDb
): Promise<AppPostRow[]> {
  const rows = await db
    .select({ post: promoAppPosts, handle: promoAccounts.handle, jobStatus: promoJobs.status, jobError: promoJobs.lastError })
    .from(promoAppPosts)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoAppPosts.accountId))
    .leftJoin(promoJobs, eq(promoJobs.id, promoAppPosts.jobId))
    .where(
      and(
        eq(promoAppPosts.userId, userId),
        eq(promoAppPosts.projectId, projectId),
        eq(promoAppPosts.platform, network)
      )
    )
    .orderBy(desc(promoAppPosts.createdAt))
    .limit(500)
  return rows.map(({ post, handle, jobStatus, jobError }) => {
    const lost = post.status === "waiting" && (jobStatus === "failed" || jobStatus === null)
    return {
      id: post.id,
      account: { id: post.accountId, handle },
      mediaUrl: post.mediaUrl,
      mediaKind: post.mediaKind,
      mediaName: post.mediaName,
      caption: post.caption,
      status: lost ? "failed" : post.status,
      postUrl: post.postUrl,
      lastError: lost ? jobError || "The phone did not post it. Check the app before posting again." : post.lastError,
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
 * Calls off posts the phone has not started on: each one's job is taken off
 * the queue and the post deleted. One the phone has started, or that is no
 * longer waiting, is left. Answers which were called off and which were not.
 */
export async function cancelAppPosts(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  if (!ids.length) return { completed: [], skipped: [] }
  const posts = await db
    .select({ id: promoAppPosts.id, jobId: promoAppPosts.jobId })
    .from(promoAppPosts)
    .where(and(eq(promoAppPosts.userId, userId), inArray(promoAppPosts.id, ids), eq(promoAppPosts.status, "waiting")))
  const jobIds = posts.flatMap((post) => (post.jobId ? [post.jobId] : []))
  const dropped = jobIds.length
    ? await db
        .delete(promoJobs)
        .where(and(inArray(promoJobs.id, jobIds), eq(promoJobs.status, "queued")))
        .returning({ id: promoJobs.id })
    : []
  const droppedJobs = new Set(dropped.map((job) => job.id))
  const completed = posts.filter((post) => post.jobId && droppedJobs.has(post.jobId)).map((post) => post.id)
  if (completed.length) await db.delete(promoAppPosts).where(inArray(promoAppPosts.id, completed))
  return { completed, skipped: ids.filter((id) => !completed.includes(id)) }
}
