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
import { brakeWords, halfOf } from "@/lib/bans/options"
import { paceLimit } from "@/lib/social/pace"
import { whenText } from "@/lib/social/wording"
import { slowReason } from "@/server/bans/rules"
import { refuseImportantFirstKind } from "@/server/bans/throwaway-first"
import { phoneStepRefusal } from "@/lib/phones/options"
import { handleWords, isPhoneAppNetwork, NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { CAROUSEL_SLIDES, captionProblem, type PhoneAppMediaKind, type PhoneAppPostStatus } from "@/lib/social/phone-apps"

import { archiveFileAt, archivePostWentOut } from "@/server/archive/files"

import { queueJob } from "../jobs"
import { readBehaviour } from "../behaviour"
import { pausedBy } from "../pause"
import { promoAccounts, promoAppPosts, promoJobs } from "../schema"
import { appCarousel, appPost } from "./calls"

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

/** One file's kind: a carousel is several photos. */
type OneFileKind = Exclude<PhoneAppMediaKind, "carousel">

/** The file types each app takes from the gallery. */
const TAKES: Record<PhoneAppNetwork, Record<OneFileKind, ReadonlySet<string>>> = {
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
): Promise<{ kind: OneFileKind; name: string; archiveItemId: string | null }> {
  const row = await ownFile(userId, url, db)
  if (!row) throw new Error("Pick a photo or video from your media library or the archive first.")
  const kind: OneFileKind | null = row.fileType === "image" ? "photo" : row.fileType === "video" ? "video" : null
  if (!kind || !TAKES[network][kind].has(row.mimeType)) {
    const allowed = network === "instagram" ? "a JPEG or PNG photo, or an MP4 or MOV video" : "a JPEG, PNG or WebP photo, or an MP4, MOV or WebM video"
    throw new Error(`${NETWORK_NAMES[network]} cannot post that file (${row.mimeType}). Pick ${allowed}.`)
  }
  return { kind, name: row.name, archiveItemId: row.archiveItemId }
}

/** One of this person's own files by its address, from the media library or the Archive, or null. */
async function ownFile(
  userId: string,
  url: string,
  db: CustomShellDb
): Promise<{ mimeType: string; fileType: string; name: string; archiveItemId: string | null } | null> {
  const storagePath = url ? await storagePathForUrl(url) : null
  if (!storagePath) return null
  const [library] = await db
    .select({ mimeType: customShellMedia.mimeType, fileType: customShellMedia.fileType, name: customShellMedia.originalName })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
    .limit(1)
  if (library) return { ...library, archiveItemId: null }
  // A file from the Archive is this person's own too (part 34).
  const archived = await archiveFileAt(userId, storagePath, db)
  return archived ? { mimeType: archived.mimeType, fileType: archived.mimeType.split("/")[0], name: archived.name, archiveItemId: archived.itemId } : null
}

/**
 * A carousel's pictures (part 40), each one of this person's own files that
 * passes the same check as a single photo, in the order given. Instagram
 * takes JPEG and PNG, TikTok WebP too; a video anywhere in it is refused,
 * since a carousel from the phones is photos only. Its archive item is the
 * first picture's, when that came from the Archive.
 */
async function postableCarousel(
  userId: string,
  network: PhoneAppNetwork,
  urls: string[],
  db: CustomShellDb = defaultDb
): Promise<{ name: string; archiveItemId: string | null }> {
  if (urls.length < CAROUSEL_SLIDES.min || urls.length > CAROUSEL_SLIDES.max) {
    throw new Refusal(`A carousel holds ${CAROUSEL_SLIDES.min} to ${CAROUSEL_SLIDES.max} pictures. This one has ${urls.length}.`)
  }
  let first: { name: string; archiveItemId: string | null } | null = null
  for (const [index, url] of urls.entries()) {
    const which = `Picture ${index + 1} of the carousel`
    const file = await ownFile(userId, url, db)
    if (!file) throw new Refusal(`${which} is not in your media library or the archive.`)
    if (file.fileType === "video") throw new Refusal(`${which} is a video. A carousel from the phones holds pictures only.`)
    if (file.fileType !== "image" || !TAKES[network].photo.has(file.mimeType)) {
      const allowed = network === "instagram" ? "JPEG or PNG" : "JPEG, PNG or WebP"
      throw new Refusal(`${which} is ${file.mimeType}, which ${NETWORK_NAMES[network]} cannot post. A carousel takes ${allowed} pictures.`)
    }
    first ??= { name: file.name, archiveItemId: file.archiveItemId }
  }
  return first!
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
        : paused === "brake"
          ? brakeWords(network)
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

/**
 * When a new Instagram or TikTok account's warm-up ends (Bans task, part 19):
 * the days in Settings → Behaviour, counted from when it was added to Promo.
 * Null when it is over or switched off.
 */
export function appWarmUpEndsAt(account: Pick<AccountRow, "createdAt">, days: number, now: Date = new Date()): Date | null {
  if (!days) return null
  const ends = new Date(account.createdAt.getTime() + days * 86_400_000)
  return ends > now ? ends : null
}

/**
 * Refuses Post while the account warms up, with the day it ends (part 19),
 * and past half its limits while it goes at half pace (parts 20, 23 and 24):
 * half of the hourly and daily numbers in Settings → Behaviour, counting the
 * posts that reached the app and the ones on their way.
 */
export async function refuseAppPostNow(userId: string, account: AccountRow, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const behaviour = await readBehaviour(userId, db)
  const name = handleWords(account.platform, account.handle) || "This account"
  const warming = appWarmUpEndsAt(account, behaviour.appWarmUpDays, now)
  if (warming) {
    throw new Error(`${name} is warming up, so it only scrolls and likes for now. It may post from ${warming.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}.`)
  }
  const slow = await slowReason(userId, account, db, now)
  if (!slow) return
  const since = new Date(now.getTime() - 86_400_000)
  const rows = await db
    .select({ postedAt: promoAppPosts.postedAt, status: promoAppPosts.status })
    .from(promoAppPosts)
    .where(and(eq(promoAppPosts.accountId, account.id), sql`coalesce(${promoAppPosts.postedAt}, ${promoAppPosts.createdAt}) >= ${since.toISOString()}::timestamptz`))
  const posted = rows.flatMap((row) => (row.postedAt ? [row.postedAt] : []))
  const waiting = rows.filter((row) => row.status === "waiting").length
  const perHour = halfOf(behaviour.youngPerHour)
  const perDay = halfOf(behaviour.youngPerDay)
  const limit = paceLimit({ posted, waiting, now, perHour, perDay })
  if (!limit || (limit.nextAllowedAt && limit.nextAllowedAt <= now)) return
  const allowed = limit.limit === "hour" ? perHour : perDay
  const span = limit.limit === "hour" ? "an hour" : "a day"
  throw new Error(
    limit.nextAllowedAt
      ? `${slow}: ${name} may post ${allowed} ${allowed === 1 ? "time" : "times"} ${span}, and has. The next is allowed ${whenText(limit.nextAllowedAt, now)}.`
      : `${slow}: ${name} may post ${allowed} ${allowed === 1 ? "time" : "times"} ${span}, and that many are sent or on their way.`
  )
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

/** The rack's routine for a post: one file, or several pictures in one post (part 40). */
export function appPostRoutine(platform: string, kind: PhoneAppMediaKind): string {
  return kind === "carousel" ? `${platform}/post_carousel` : `${platform}/post`
}

/**
 * Sends one photo or video to the account's phone to post, because a person
 * pressed Post. `draftCaption` is what the AI wrote before any edit, kept so
 * what was asked for and what went out can be compared. The same file and
 * caption already on its way from the same account is refused, so a second
 * press never posts twice.
 *
 * `mediaUrls`, when given, makes it a carousel (Video's task promo/01, part
 * 40): 2 to 20 pictures in order, one Instagram post or one TikTok photo
 * post, through its own routine, so a carousel step the self-test found
 * broken stops carousels only. `mediaUrl` is then the first picture.
 */
export async function queueAppPost(
  userId: string,
  input: { accountId: string; mediaUrl: string; mediaUrls?: string[]; caption: string; draftCaption: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ id: string }> {
  const mediaUrls = input.mediaUrls?.length ? input.mediaUrls : []
  const carousel = mediaUrls.length > 0
  const mediaUrl = carousel ? mediaUrls[0] : input.mediaUrl
  const account = await ownAccount(userId, input.accountId, db)
  const network = await refuseAppAccount(userId, account, appPostRoutine(account.platform, carousel ? "carousel" : "photo"), db)
  await refuseAppPostNow(userId, account, db, now)
  const caption = input.caption.trim()
  const problem = captionProblem(network, caption)
  if (problem) throw new Error(problem)
  const media: { kind: PhoneAppMediaKind; name: string; archiveItemId: string | null } = carousel
    ? { kind: "carousel", ...(await postableCarousel(userId, network, mediaUrls, db)) }
    : await postableMedia(userId, network, mediaUrl, db)
  // A throwaway goes first with a kind of post new to an important account (Bans task, part 22).
  // A carousel is its own kind: an important account's first one waits for a throwaway's.
  await refuseImportantFirstKind(account, network, media.kind, db, now)

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
          eq(promoAppPosts.mediaUrl, mediaUrl),
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
      mediaUrl,
      mediaUrls,
      mediaKind: media.kind,
      mediaName: media.name.slice(0, 255),
      caption,
      draftCaption: input.draftCaption.trim().slice(0, 10_000),
      jobId,
      createdAt: now,
      archiveItemId: media.archiveItemId,
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
    const answer =
      post.mediaKind === "carousel"
        ? await appCarousel(target, account.platform, { ...(await carouselArgs(userId, account.phoneId, post.mediaUrls, db, now)), caption: post.caption })
        : await appPost(target, account.platform, {
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
    await archivePostWentOut(userId, post.archiveItemId, account.platform, postLink(account.platform, answer.postUrl), { db, now })
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
export async function mediaArgs(
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
  const [library] = storagePath
    ? await db
        .select({ mimeType: customShellMedia.mimeType })
        .from(customShellMedia)
        .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
        .limit(1)
    : []
  const file = library ?? (storagePath ? await archiveFileAt(userId, storagePath, db) : null)
  if (!storagePath || !file) throw new Refusal("That file is not in your media library or the archive any more, so nothing was posted.")
  return { mediaUrl: await makeMediaLink(userId, { storagePath, mimeType: file.mimeType }, db, now), mediaFromSafari: true }
}

/**
 * A carousel's pictures as the phone takes them, in order: each one's own
 * address on an Android, or each one's one-time Safari link on an iPhone,
 * made the way `mediaArgs` makes one. Every link is made when the job starts,
 * and each lasts ten minutes, so a long carousel on an iPhone must save all
 * its pictures inside that time.
 */
export async function carouselArgs(
  userId: string,
  phoneId: string | null,
  mediaUrls: string[],
  db: CustomShellDb,
  now: Date
): Promise<{ mediaUrls: string[]; mediaFromSafari?: true }> {
  if (mediaUrls.length < CAROUSEL_SLIDES.min) throw new Refusal("That carousel has lost its pictures, so nothing was posted.")
  const each = []
  for (const url of mediaUrls) each.push(await mediaArgs(userId, phoneId, url, db, now))
  const safari = each.some((one) => one.mediaFromSafari)
  return { mediaUrls: each.map((one) => one.mediaUrl), ...(safari ? { mediaFromSafari: true as const } : {}) }
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
