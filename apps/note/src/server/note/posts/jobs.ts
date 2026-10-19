import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, notInArray, or } from "drizzle-orm"

import { isAiLimitError } from "@/server/ai/usage"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  deleteFromR2,
  getFromR2,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { transcribe } from "@/server/note/analysis"
import { downloadVideo } from "@/server/note/download"
import { discardFile, downloadToFile, extractSound, storeFile, type StoredFile } from "@/server/note/files"
import { requireGeminiKey } from "@/server/note/gemini"
import { parseVideoLink } from "@/server/note/links"
import { tellOwner } from "@/server/note/notices"
import { mergePostPlans, summarisePost, type PostPicturePart } from "@/server/note/posts/analysis"
import { allPictures, PICTURES_PER_ANALYSIS, postTitle } from "@/server/note/posts/posts"
import { readXPost } from "@/server/note/posts/reader"
import { getAboutYou } from "@/server/note/posts/settings"
import type { ReadPicture } from "@/server/note/posts/x-page"
import { notePostFolders, notePosts, type NotePostRow } from "@/server/note/schema"
import { SayableError } from "@/server/note/sayable"
import { postUrl } from "@/lib/note/posts/links"
import { POST_SAYS, SIMILAR_POSTS_MAX, type PostPicture } from "@/lib/note/posts/posts"
import { isUnreadableKeyError, MAX_DURATION_SECONDS, NOTE_SAYS } from "@/lib/note/videos"

/**
 * The `note-posts` worker. The status is the job: the screen writes a row and
 * returns, and this finds the row on the shell's fifteen-second loop.
 *
 * One job at a time, claimed in this order: put back anything whose worker
 * went away, then take one post or merged plan queued for the AI, else one
 * pasted post waiting to be read, else one video waiting to download. A claim
 * is a lease of 20 minutes, pushed forward between steps, and every write
 * checks the lease is still this worker's. A write that finds another lease,
 * or no row because the post was deleted, throws its own work away.
 */

const JOB_LEASE_MS = 20 * 60 * 1000
/** The most pictures kept for one post, across its quote and its thread. */
const PICTURES_KEPT_MAX = 24
const PICTURE_BYTES_MAX = 8 * 1024 * 1024
const PICTURE_TIMEOUT_MS = 15_000
const PICTURE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

type Claimed = NotePostRow & { leaseToken: string }

let running: Promise<void> | null = null

/**
 * The worker's tick. It starts at most one job and returns without waiting
 * for it, because a video download can take minutes and the shell's pass waits
 * for every worker on it. The next tick starts nothing while this process
 * still has a job going.
 */
export async function tick(): Promise<void> {
  await releaseAbandoned()
  if (running) return
  running = runNext()
    .catch((error) => {
      console.error("A note-posts job could not start", error)
    })
    .finally(() => {
      running = null
    })
}

export async function runNext(): Promise<void> {
  const queued = await claimQueued()
  if (queued) return queued.kind === "merged" ? runMerge(queued) : runAnalysis(queued)
  const waiting = await claimWaiting()
  if (waiting) return runRead(waiting)
  const video = await claimVideo()
  if (video) return runVideo(video)
}

/**
 * A row left mid-job by a restart has a lease nobody holds any more. A read
 * goes back to waiting, an analysis back to the queue, and a video download
 * back to waiting, so redeploying never strands a post with no status.
 */
export async function releaseAbandoned(): Promise<void> {
  const at = now()
  const expired = or(isNull(notePosts.leaseExpiresAt), lt(notePosts.leaseExpiresAt, at))
  const free = { leaseToken: null, leaseExpiresAt: null, updatedAt: at }
  await db
    .update(notePosts)
    .set({ status: "waiting", ...free })
    .where(and(eq(notePosts.status, "reading"), expired))
  await db
    .update(notePosts)
    .set({ status: "queued", ...free })
    .where(and(eq(notePosts.status, "analysing"), expired))
  await db
    .update(notePosts)
    .set({ videoStatus: "waiting", ...free })
    .where(and(eq(notePosts.videoStatus, "downloading"), notInArray(notePosts.status, ["reading", "analysing"]), expired))
}

function leaseUntil(at: Date) {
  return new Date(at.getTime() + JOB_LEASE_MS)
}

async function claimWhere(
  where: ReturnType<typeof and>,
  values: Partial<typeof notePosts.$inferInsert>
): Promise<Claimed | null> {
  const [oldest] = await db
    .select({ id: notePosts.id })
    .from(notePosts)
    .where(where)
    .orderBy(asc(notePosts.updatedAt))
    .limit(1)
  if (!oldest) return null
  const leaseToken = uuid()
  const at = now()
  const [claimed] = await db
    .update(notePosts)
    .set({ ...values, leaseToken, leaseExpiresAt: leaseUntil(at), updatedAt: at })
    // Only one tick can win this, so two servers never do the same job twice.
    .where(and(eq(notePosts.id, oldest.id), where))
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

export function claimQueued() {
  return claimWhere(and(eq(notePosts.status, "queued")), { status: "analysing" })
}

export function claimWaiting() {
  return claimWhere(and(eq(notePosts.status, "waiting")), { status: "reading" })
}

/** A video waiting to download: a Try again, or one a restart put back. */
function claimVideo() {
  return claimWhere(
    and(
      eq(notePosts.videoStatus, "waiting"),
      isNull(notePosts.leaseToken),
      inArray(notePosts.status, ["saved", "ready", "failed"])
    ),
    { videoStatus: "downloading" }
  )
}

async function writeHeld(job: Claimed, values: Partial<typeof notePosts.$inferInsert>): Promise<boolean> {
  const written = await db
    .update(notePosts)
    .set({ ...values, updatedAt: now() })
    .where(and(eq(notePosts.id, job.id), eq(notePosts.leaseToken, job.leaseToken)))
    .returning({ id: notePosts.id })
  return written.length > 0
}

function holdOn(job: Claimed, values: Partial<typeof notePosts.$inferInsert> = {}) {
  return writeHeld(job, { ...values, leaseExpiresAt: leaseUntil(now()) })
}

const RELEASE = { leaseToken: null, leaseExpiresAt: null } as const

class LeaseLost extends Error {}

const OWN_SENTENCES: ReadonlySet<string> = new Set([...Object.values(NOTE_SAYS), ...Object.values(POST_SAYS)])

/**
 * The sentence a failure leaves on the card and in the bell. Only words
 * written for the owner get through; anything else, such as a database error
 * with its query in it, stays in the server log.
 */
export function postFailureWords(error: unknown) {
  if (isAiLimitError(error)) return NOTE_SAYS.aiLimitReached
  if (isUnreadableKeyError(error)) return NOTE_SAYS.geminiKeyUnreadable
  if (
    error instanceof SayableError ||
    error instanceof R2StorageNotConfiguredError ||
    (error instanceof Error && OWN_SENTENCES.has(error.message))
  ) {
    return error.message
  }
  return "Something went wrong on the server. Try again."
}

async function failJob(job: Claimed, error: unknown): Promise<void> {
  const reason = postFailureWords(error).slice(0, 500)
  console.error("A saved post failed", job.id, error)
  const failed = await writeHeld(job, { status: "failed", error: reason, ...RELEASE })
  if (!failed) return
  const [row] = await db.select().from(notePosts).where(eq(notePosts.id, job.id))
  await tellOwner({ ownerId: job.ownerId, postId: job.id, message: `Failed: ${postTitle(row ?? job)}`, detail: reason })
}

// ---------------------------------------------------------------------------
// Reading a post

function storedPath(job: { ownerId: string; id: string }, name: string, extension: string) {
  return `note-posts/${job.ownerId}/${job.id}/${name}.${extension}`
}

/**
 * Copies one picture from X into the bucket, so a post deleted on X still
 * shows it. Only X's own picture host is fetched. A picture that will not come
 * is left out rather than failing the post.
 */
async function keepPicture(
  job: Claimed,
  picture: { url: string; width: number | null; height: number | null },
  name: string,
  stored: string[]
): Promise<PostPicture | null> {
  try {
    const url = new URL(picture.url)
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com") return null
    const answer = await fetch(url, { signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS) })
    if (!answer.ok || new URL(answer.url).hostname !== "pbs.twimg.com") return null
    const type = (answer.headers.get("content-type") ?? "").split(";")[0].trim()
    const extension = PICTURE_TYPES[type]
    if (!extension || Number(answer.headers.get("content-length") ?? 0) > PICTURE_BYTES_MAX) return null
    const bytes = new Uint8Array(await answer.arrayBuffer())
    if (!bytes.byteLength || bytes.byteLength > PICTURE_BYTES_MAX) return null
    const storagePath = storedPath(job, name, extension)
    await uploadToR2(storagePath, bytes, type)
    stored.push(storagePath)
    return { path: storagePath, width: picture.width, height: picture.height }
  } catch (error) {
    console.error("A post's picture was not kept", job.id, name, error)
    return null
  }
}

async function keepPictures(job: Claimed, pictures: ReadPicture[], prefix: string, budget: { left: number }, stored: string[]) {
  const kept: PostPicture[] = []
  for (const [index, picture] of pictures.entries()) {
    if (budget.left <= 0) break
    budget.left -= 1
    const done = await keepPicture(job, picture, `${prefix}${index + 1}`, stored)
    if (done) kept.push(done)
  }
  return kept
}

async function dropStored(paths: string[]) {
  for (const storagePath of paths) await deleteFromR2(storagePath).catch(() => undefined)
}

/**
 * Reads the post's page from X, keeps its pictures, and saves the words. A
 * post with a video then downloads it under the same lease, so the video's
 * card says "Saving the video" while the words are already there to read.
 */
async function runRead(job: Claimed): Promise<void> {
  const stored: string[] = []
  let downloadNext = false
  try {
    if (!job.postId) throw new SayableError(POST_SAYS.notALink)
    const post = await readXPost(job.postId)
    const budget = { left: PICTURES_KEPT_MAX }
    const pictures = await keepPictures(job, post.pictures, "p", budget, stored)
    const quoted = post.quoted
      ? {
          postId: post.quoted.postId,
          url: post.quoted.url,
          authorName: post.quoted.authorName,
          authorHandle: post.quoted.authorHandle,
          text: post.quoted.text,
          postedAt: post.quoted.postedAt?.toISOString() ?? null,
          pictures: await keepPictures(job, post.quoted.pictures, "q", budget, stored),
        }
      : null
    const thread = []
    for (const [index, each] of post.thread.entries()) {
      thread.push({
        postId: each.postId,
        text: each.text,
        pictures: await keepPictures(job, each.pictures, `t${index + 1}-`, budget, stored),
      })
    }
    const author = post.authorPictureUrl
      ? await keepPicture(job, { url: post.authorPictureUrl, width: null, height: null }, "author", stored)
      : null
    const cover = post.video?.coverUrl
      ? await keepPicture(job, { url: post.video.coverUrl, width: null, height: null }, "cover", stored)
      : null

    const tooLong = post.video?.seconds != null && post.video.seconds > MAX_DURATION_SECONDS
    const videoStatus = !post.video ? "none" : tooLong ? "too_long" : "downloading"
    // A video to download keeps the lease, pushed forward; anything else lets it go.
    const words = {
      status: "saved",
      error: null,
      url: postUrl(post.authorHandle, job.postId),
      authorName: post.authorName,
      authorHandle: post.authorHandle,
      authorPicturePath: author?.path ?? null,
      postedAt: post.postedAt,
      text: post.text,
      pictures,
      quoted,
      thread,
      threadStatus: post.threadStatus,
      articleUrl: post.articleUrl,
      likesWhenSaved: post.likes,
      repostsWhenSaved: post.reposts,
      videoStatus,
      videoError: tooLong ? NOTE_SAYS.tooLong : null,
      videoSourceUrl: post.video?.url ?? null,
      videoSeconds: post.video?.seconds ?? null,
      videoCoverPath: cover?.path ?? null,
    } satisfies Partial<typeof notePosts.$inferInsert>
    const saved =
      videoStatus === "downloading" ? await holdOn(job, words) : await writeHeld(job, { ...words, ...RELEASE })
    if (!saved) {
      // Deleted while reading, or taken over: what was kept belongs to nothing.
      await dropStored(stored)
      return
    }
    downloadNext = videoStatus === "downloading"
  } catch (error) {
    await dropStored(stored)
    await failJob(job, error)
    return
  }
  // Outside the try above: the post is saved by now, so nothing the video does
  // may throw its pictures away or mark the words as failed.
  if (downloadNext) await runVideo(job)
}

// ---------------------------------------------------------------------------
// The post's video

/**
 * Downloads the post's video with the same downloader Videos uses, into the
 * person's media library. A failure says why on the post and in the bell; the
 * words stay, and the post can still be analysed without the video. The video
 * belongs to the post and does not appear in Videos (Tyler, 19 Oct 2026:
 * "Analyse covers both").
 */
async function runVideo(job: Claimed): Promise<void> {
  let file: StoredFile | null = null
  let dir: string | null = null
  // The claimed row may be from before X was read, so the name is read again.
  let title = postTitle(job)
  try {
    const [row] = await db.select().from(notePosts).where(eq(notePosts.id, job.id))
    if (row) title = postTitle(row)
    if (!row?.videoSourceUrl) throw new SayableError(POST_SAYS.noVideo)
    const downloaded = await downloadVideo(parseVideoLink(row.videoSourceUrl))
    dir = downloaded.dir
    // A download can take fifteen minutes, so the lease is pushed forward
    // before the upload, as the Videos worker does. A lost lease means the
    // post was deleted or taken over, and the file is dropped unstored.
    if (!(await holdOn(job))) return
    file = await storeFile({
      ownerId: job.ownerId,
      filePath: downloaded.filePath,
      mimeType: downloaded.mimeType,
      kind: downloaded.kind,
      name: `${title} video`,
    })
    const saved = await writeHeld(job, {
      videoStatus: "saved",
      videoError: null,
      videoMediaId: file.id,
      videoSeconds: row.videoSeconds ?? downloaded.durationSeconds,
      ...RELEASE,
    })
    if (!saved) await discardFile(file)
  } catch (error) {
    if (file) await discardFile(file)
    const reason = postFailureWords(error).slice(0, 500)
    console.error("A saved post's video failed", job.id, error)
    const failed = await writeHeld(job, { videoStatus: "failed", videoError: reason, ...RELEASE })
    if (failed) {
      await tellOwner({
        ownerId: job.ownerId,
        postId: job.id,
        message: `The video couldn't be saved: ${title}`,
        detail: reason,
      })
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Analysing

async function readStoredPicture(picture: PostPicture): Promise<PostPicturePart | null> {
  try {
    const object = await getFromR2(picture.path)
    const bytes = await object.Body?.transformToByteArray()
    if (!bytes?.byteLength) return null
    const extension = picture.path.split(".").pop() ?? "jpg"
    const mimeType = Object.entries(PICTURE_TYPES).find(([, ext]) => ext === extension)?.[0] ?? "image/jpeg"
    return { mimeType, data: bytes }
  } catch (error) {
    console.error("A stored picture could not be read for the AI", picture.path, error)
    return null
  }
}

/**
 * Writes down what the video says, when it has not been already, then reads
 * the post with everything that goes with it and writes the summary, plan,
 * tags, folder and similar post. Analyse again replaces all of it, the ticks
 * and edits included (Tyler, 19 Oct 2026: "Replace all, warn first").
 */
export async function runAnalysis(job: Claimed): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "note-post-"))
  try {
    const apiKey = await requireGeminiKey()
    let row = job as NotePostRow

    if (row.videoStatus === "saved" && row.videoMediaId && row.transcript === null) {
      const [media] = await db
        .select({ storagePath: customShellMedia.storagePath })
        .from(customShellMedia)
        .where(eq(customShellMedia.id, row.videoMediaId))
      if (media) {
        const sourcePath = path.join(dir, "source")
        const soundPath = path.join(dir, "sound.mp3")
        await downloadToFile(media.storagePath, sourcePath)
        const readSeconds = await extractSound(sourcePath, soundPath)
        await rm(sourcePath, { force: true })
        const seconds = row.videoSeconds ?? readSeconds
        const transcript = await transcribe({
          ownerId: row.ownerId,
          about: { notePostId: row.id },
          apiKey,
          sound: new Uint8Array(await readFile(soundPath)),
          durationMs: seconds ? seconds * 1000 : null,
        })
        if (!(await holdOn(job, { transcript: transcript.lines }))) throw new LeaseLost()
        row = { ...row, transcript: transcript.lines }
      }
    }

    const pictures = (
      await Promise.all(allPictures(row).slice(0, PICTURES_PER_ANALYSIS).map(readStoredPicture))
    ).filter((part): part is PostPicturePart => part !== null)
    const [aboutYou, folders, others] = await Promise.all([
      getAboutYou(),
      db
        .select({ id: notePostFolders.id, name: notePostFolders.name })
        .from(notePostFolders)
        .where(eq(notePostFolders.ownerId, row.ownerId))
        .orderBy(asc(notePostFolders.position)),
      db
        .select()
        .from(notePosts)
        .where(
          and(
            eq(notePosts.ownerId, row.ownerId),
            eq(notePosts.kind, "post"),
            isNotNull(notePosts.summary),
            ne(notePosts.id, row.id)
          )
        )
        .orderBy(desc(notePosts.createdAt))
        .limit(SIMILAR_POSTS_MAX),
    ])

    const answer = await summarisePost({
      row,
      apiKey,
      aboutYou,
      folders,
      others: others.map((other) => ({
        id: other.id,
        title: postTitle(other),
        savedAt: other.createdAt,
        firstSummaryLine: other.summary?.[0] ?? null,
        tags: other.tags ?? [],
      })),
      pictures,
    })
    const ready = await writeHeld(job, {
      status: "ready",
      summary: answer.summary,
      actionPlan: answer.actionPlan,
      tags: answer.tags,
      suggestedFolderId: answer.folderId && answer.folderId !== row.folderId ? answer.folderId : null,
      similarPostId: answer.similarPostId,
      analysedAt: now(),
      error: null,
      ...RELEASE,
    })
    if (!ready) return
    await tellOwner({ ownerId: row.ownerId, postId: row.id, message: `Analysed: ${postTitle(row)}` })
  } catch (error) {
    if (error instanceof LeaseLost) return
    await failJob(job, error)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** One plan from the picked posts' plans. A post deleted since is left out. */
async function runMerge(job: Claimed): Promise<void> {
  try {
    const apiKey = await requireGeminiKey()
    const ids = job.sourcePostIds ?? []
    const rows = ids.length
      ? await db
          .select()
          .from(notePosts)
          .where(and(eq(notePosts.ownerId, job.ownerId), inArray(notePosts.id, ids)))
      : []
    const sources = ids
      .map((id) => rows.find((row) => row.id === id))
      .filter((row): row is NotePostRow => Boolean(row?.actionPlan?.length))
    if (sources.length < 2) throw new SayableError("Fewer than two of these posts still have a plan.")
    const plan = await mergePostPlans({
      ownerId: job.ownerId,
      mergedId: job.id,
      apiKey,
      aboutYou: await getAboutYou(),
      posts: sources.map((row) => ({
        title: postTitle(row),
        summary: row.summary ?? [],
        plan: row.actionPlan ?? [],
      })),
    })
    const ready = await writeHeld(job, { status: "ready", actionPlan: plan, analysedAt: now(), error: null, ...RELEASE })
    if (!ready) return
    await tellOwner({ ownerId: job.ownerId, postId: job.id, message: `Plan ready: ${postTitle(job)}` })
  } catch (error) {
    await failJob(job, error)
  }
}
