import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { and, asc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { isAiLimitError } from "@/server/ai/usage"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { deleteFromR2, getFromR2, R2StorageNotConfiguredError, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { summarise, transcribe } from "@/server/note/analysis"
import { downloadVideo } from "@/server/note/download"
import { discardFile, downloadToFile, extractSound, lookAtFile, storeFile, type StoredFile } from "@/server/note/files"
import { requireGeminiKey } from "@/server/note/gemini"
import { allPictures, PICTURES_PER_ANALYSIS } from "@/server/note/library/cards"
import { purgeOldTrash } from "@/server/note/library/notes"
import { mergePlans, summarisePost, type PostPicturePart } from "@/server/note/library/post-analysis"
import { readThreadsPost } from "@/server/note/library/threads-reader"
import { readXPost } from "@/server/note/library/x-reader"
import type { ReadPicture } from "@/server/note/library/x-page"
import { parseVideoLink } from "@/server/note/links"
import { tellOwner } from "@/server/note/notices"
import { noteNotes, type NoteRow } from "@/server/note/schema"
import { SayableError } from "@/server/note/sayable"
import { getAboutYou } from "@/server/note/settings"
import { isUniqueViolation } from "@/server/note/unique-violation"
import {
  cleanAuthorName,
  isPostSource,
  isUnreadableKeyError,
  LIBRARY_SAYS,
  MAX_DURATION_SECONDS,
  noteTitle,
  TAGS_PER_NOTE,
  type PostPicture,
} from "@/lib/note/library/notes"

/**
 * The `note-imports` worker. The statuses are the jobs: the screen writes a
 * row and returns, and this finds the row on the shell's fifteen-second loop.
 * It took over from the Videos and Posts workers on 20 Oct 2026.
 *
 * One job at a time, claimed in this order: put back anything whose worker
 * went away, then take one note queued for the AI, else one link waiting to
 * be imported, else one X post's video waiting to download. A claim is a
 * lease of 20 minutes, pushed forward between steps, and every write checks
 * the lease is still this worker's. A write that finds another lease, or no
 * row because the note was deleted, throws its own work away. Each tick also
 * clears a batch of Trash that is over 30 days old.
 */

/**
 * How long one claim lasts before another tick may take it over. It has to
 * outlast the slowest honest step: a 15-minute download, or Gemini listening
 * to thirty minutes of sound. A lease that runs out mid-job is not a harmless
 * retry, because the analysis would be paid for twice.
 */
const JOB_LEASE_MS = 20 * 60 * 1000
/** The most pictures kept for one X post, across its quote and its thread. */
const PICTURES_KEPT_MAX = 24
const PICTURE_BYTES_MAX = 8 * 1024 * 1024
const PICTURE_TIMEOUT_MS = 15_000
const PICTURE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}
/** What the title says until the worker has read the real one. */
const IMPORTING_TITLE = "Importing…"

type Claimed = NoteRow & { leaseToken: string }
/** What one write may set, a column's SQL included. */
type Changes = PgUpdateSetSource<typeof noteNotes>

/** The job this process is running, if any. One at a time per process. */
let running: Promise<void> | null = null

/**
 * The worker's tick. It starts at most one job and returns without waiting
 * for it to end, because a download can take fifteen minutes and the shell's
 * pass waits for every worker on it. The next tick starts nothing while this
 * process still has a job going.
 */
export async function tick(): Promise<void> {
  await releaseAbandoned()
  await purgeOldTrash().catch((error) => console.error("Old Trash was not cleared", error))
  if (running) return
  running = runNext()
    .catch((error) => {
      console.error("A note-imports job could not start", error)
    })
    .finally(() => {
      running = null
    })
}

/** Claims the next job and runs it to the end. */
export async function runNext(): Promise<void> {
  const queued = await claimQueued()
  if (queued) return queued.mergedFrom ? runMerge(queued) : runAnalysis(queued)
  const waiting = await claimWaiting()
  if (waiting) return isPostSource(waiting.source) ? runReadPost(waiting) : runDownload(waiting)
  const video = await claimPostVideo()
  if (video) return runPostVideo(video)
}

/**
 * A row left mid-job by a restart has a lease nobody holds any more. An
 * import goes back to waiting, an analysis back to the queue, and an X post's
 * video back to waiting, so redeploying never strands a note.
 */
async function releaseAbandoned(): Promise<void> {
  const at = now()
  const expired = or(isNull(noteNotes.leaseExpiresAt), lt(noteNotes.leaseExpiresAt, at))
  const free = { leaseToken: null, leaseExpiresAt: null, updatedAt: at }
  await db
    .update(noteNotes)
    .set({ importStatus: "waiting", ...free })
    .where(and(inArray(noteNotes.importStatus, ["reading", "downloading"]), expired))
  await db
    .update(noteNotes)
    .set({ analyseStatus: "queued", ...free })
    .where(and(inArray(noteNotes.analyseStatus, ["transcribing", "summarising"]), expired))
  await db
    .update(noteNotes)
    .set({ videoStatus: "waiting", ...free })
    .where(
      and(
        eq(noteNotes.videoStatus, "downloading"),
        eq(noteNotes.importStatus, "saved"),
        or(isNull(noteNotes.analyseStatus), notInArray(noteNotes.analyseStatus, ["transcribing", "summarising"])),
        expired
      )
    )
}

function leaseUntil(at: Date) {
  return new Date(at.getTime() + JOB_LEASE_MS)
}

/** The oldest row matching `where`, taken by one tick and no other. */
async function claimWhere(where: SQL | undefined, values: Changes): Promise<Claimed | null> {
  const [oldest] = await db
    .select({ id: noteNotes.id })
    .from(noteNotes)
    .where(where)
    .orderBy(asc(noteNotes.updatedAt))
    .limit(1)
  if (!oldest) return null
  const leaseToken = uuid()
  const at = now()
  const [claimed] = await db
    .update(noteNotes)
    .set({ ...values, leaseToken, leaseExpiresAt: leaseUntil(at), updatedAt: at })
    // Only one tick can win this, so two servers never do the same job twice.
    .where(and(eq(noteNotes.id, oldest.id), where))
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

function claimQueued() {
  return claimWhere(and(eq(noteNotes.analyseStatus, "queued"), isNull(noteNotes.deletedAt)), {
    analyseStatus: "transcribing",
  })
}

async function claimWaiting() {
  const waiting = and(eq(noteNotes.importStatus, "waiting"), isNull(noteNotes.deletedAt))
  const claimed = await claimWhere(waiting, { importStatus: "downloading" })
  // An X or Threads post is read, not downloaded, and its card says so.
  if (claimed && isPostSource(claimed.source)) {
    await db
      .update(noteNotes)
      .set({ importStatus: "reading" })
      .where(and(eq(noteNotes.id, claimed.id), eq(noteNotes.leaseToken, claimed.leaseToken)))
    return { ...claimed, importStatus: "reading" as const }
  }
  return claimed
}

/** An X post's video waiting to download: a Try again, or one a restart put back. */
function claimPostVideo() {
  return claimWhere(
    and(
      eq(noteNotes.videoStatus, "waiting"),
      eq(noteNotes.importStatus, "saved"),
      isNull(noteNotes.leaseToken),
      isNull(noteNotes.deletedAt)
    ),
    { videoStatus: "downloading" }
  )
}

/**
 * One write, only while the lease is still this worker's. False means the
 * note was deleted or its import removed, and the caller drops what it was doing.
 */
async function writeHeld(job: Claimed, values: Changes): Promise<boolean> {
  const written = await db
    .update(noteNotes)
    .set({ ...values, updatedAt: now() })
    .where(and(eq(noteNotes.id, job.id), eq(noteNotes.leaseToken, job.leaseToken)))
    .returning({ id: noteNotes.id })
  return written.length > 0
}

/** Pushes the lease forward between steps, so a slow job keeps its place. */
function holdOn(job: Claimed, values: Changes = {}) {
  return writeHeld(job, { ...values, leaseExpiresAt: leaseUntil(now()) })
}

const RELEASE = { leaseToken: null, leaseExpiresAt: null } as const

/** Thrown when the lease was lost, to stop a job without calling it a failure. */
class LeaseLost extends Error {}

const OWN_SENTENCES: ReadonlySet<string> = new Set(Object.values(LIBRARY_SAYS))

/**
 * The sentence a failure leaves on the card and in the bell. Only words
 * written for the owner get through: the app's own sentences, a step's
 * `SayableError`, and the shell's "storage is not set up". Anything else,
 * such as a database error with its query in it, stays in the server log.
 */
export function failureWords(error: unknown) {
  if (isAiLimitError(error)) return LIBRARY_SAYS.aiLimitReached
  if (isUnreadableKeyError(error)) return LIBRARY_SAYS.geminiKeyUnreadable
  if (
    error instanceof SayableError ||
    error instanceof R2StorageNotConfiguredError ||
    (error instanceof Error && OWN_SENTENCES.has(error.message))
  ) {
    return error.message
  }
  return "Something went wrong on the server. Try again."
}

async function titleOf(id: string, fallback: string) {
  const [row] = await db.select({ title: noteNotes.title }).from(noteNotes).where(eq(noteNotes.id, id))
  return row ? noteTitle(row.title) : fallback
}

/** A failed import keeps its reason on the note, up to 500 characters, and says so in the bell. */
async function failImport(job: Claimed, error: unknown, values: Changes = {}) {
  const reason = failureWords(error).slice(0, 500)
  console.error("An import failed", job.id, error)
  const failed = await writeHeld(job, { ...values, importStatus: "failed", importError: reason, ...RELEASE })
  if (!failed) return
  await tellOwner({
    ownerId: job.ownerId,
    noteId: job.id,
    message: `Import failed: ${await titleOf(job.id, job.sourceUrl ?? "a link")}`,
    detail: reason,
  })
}

async function failAnalysis(job: Claimed, error: unknown) {
  const reason = failureWords(error).slice(0, 500)
  console.error("An analysis failed", job.id, error)
  const failed = await writeHeld(job, { analyseStatus: "failed", analyseError: reason, ...RELEASE })
  if (!failed) return
  await tellOwner({
    ownerId: job.ownerId,
    noteId: job.id,
    message: `Analysis failed: ${await titleOf(job.id, "a note")}`,
    detail: reason,
  })
}

/**
 * The author the worker read, cleaned the way an edited one is, but only
 * while the note has none: one typed while it imported is the person's and stays.
 */
function keepAuthor(name: string | null) {
  return sql`coalesce(${noteNotes.authorName}, ${cleanAuthorName(name ?? "") || null})`
}

/**
 * The title the worker read, but only while the note still says
 * "Importing…": a title typed in the meantime is the person's and stays.
 */
function readTitle(title: string | null) {
  const clean = (title ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
  return sql`case when ${noteNotes.title} = ${IMPORTING_TITLE} then ${clean} else ${noteNotes.title} end`
}

// ---------------------------------------------------------------------------
// A video link

/**
 * yt-dlp fetches the file into a folder of its own, the file goes up to the
 * bucket in pieces, ffmpeg takes a cover from a second in, and the note gets
 * the title, the channel as its author, the length and the date. A failure
 * leaves the reason on the Video card, and a file already stored for it is
 * deleted, so Try again starts clean.
 */
async function runDownload(job: Claimed): Promise<void> {
  let stored: StoredFile | null = null
  let dir: string | null = null
  let readyTitle = "your video"
  try {
    if (!job.sourceUrl) throw new SayableError(LIBRARY_SAYS.notALink)
    const downloaded = await downloadVideo(parseVideoLink(job.sourceUrl))
    dir = downloaded.dir

    // A shortened TikTok link only says which video it is now. When that
    // video is already in this library, this note says so and stops; the one
    // saved earlier is what stays, and nothing typed here is lost.
    const named = downloaded.source === "generic" ? null : downloaded.platformVideoId
    const platformId = job.platformId ?? named
    try {
      if (!(await holdOn(job, { platformId }))) return
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      throw new SayableError(LIBRARY_SAYS.alreadyHere)
    }

    stored = await storeFile({
      ownerId: job.ownerId,
      filePath: downloaded.filePath,
      mimeType: downloaded.mimeType,
      kind: downloaded.kind,
      name: downloaded.title ?? "Imported video",
    })
    const look = await lookAtFile({
      ownerId: job.ownerId,
      noteId: job.id,
      filePath: downloaded.filePath,
      kind: downloaded.kind,
    })
    const durationSeconds = downloaded.durationSeconds ?? look.durationSeconds
    if (durationSeconds !== null && durationSeconds > MAX_DURATION_SECONDS) {
      if (look.coverStoragePath) await deleteFromR2(look.coverStoragePath).catch(() => undefined)
      throw new SayableError(LIBRARY_SAYS.tooLong)
    }

    const saved = await writeHeld(job, {
      importStatus: "saved",
      importError: null,
      title: readTitle(downloaded.title),
      mediaKind: downloaded.kind,
      videoMediaId: stored.id,
      coverPath: look.coverStoragePath,
      authorName: keepAuthor(downloaded.channelName),
      durationSeconds,
      postedAt: downloaded.postedAt,
      ...RELEASE,
    })
    if (!saved) {
      // Deleted while downloading, or its import removed. The file and the
      // cover belong to nothing now.
      await discardFile(stored)
      if (look.coverStoragePath) await deleteFromR2(look.coverStoragePath).catch(() => undefined)
      return
    }
    readyTitle = downloaded.title ?? "your video"
  } catch (error) {
    if (stored) await discardFile(stored)
    await failImport(job, error, { videoMediaId: null, coverPath: null })
    return
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
  // Outside the try: the note is saved by now, so the notice can never take
  // its file away with it.
  await tellOwner({
    ownerId: job.ownerId,
    noteId: job.id,
    message: `Ready to analyse: ${await titleOf(job.id, readyTitle)}`,
  })
}

// ---------------------------------------------------------------------------
// An X post

function storedPath(job: { ownerId: string; id: string }, name: string, extension: string) {
  return `note-imports/${job.ownerId}/${job.id}/${name}.${extension}`
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
    // No redirects at all, so the answer can only ever come from X's picture host.
    const answer = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS) })
    if (!answer.ok) return null
    const type = (answer.headers.get("content-type") ?? "").split(";")[0].trim()
    const extension = PICTURE_TYPES[type]
    if (!extension || Number(answer.headers.get("content-length") ?? 0) > PICTURE_BYTES_MAX) return null
    const bytes = await readBytesCapped(answer, PICTURE_BYTES_MAX)
    if (!bytes?.byteLength) return null
    const storagePath = storedPath(job, name, extension)
    await uploadToR2(storagePath, bytes, type)
    stored.push(storagePath)
    return { path: storagePath, width: picture.width, height: picture.height }
  } catch (error) {
    console.error("A post's picture was not kept", job.id, name, error)
    return null
  }
}

/**
 * The answer's bytes, or null once it passes `limit`, so an answer with no
 * size header (or a wrong one) is never read into memory whole.
 */
async function readBytesCapped(answer: Response, limit: number): Promise<Uint8Array | null> {
  const reader = answer.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return new Uint8Array(Buffer.concat(chunks))
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

/** The post's first line, as a title, or the author's handle when it has no words. */
function postTitle(text: string, handle: string | null) {
  const line = text.split("\n").find((part) => part.trim())?.replace(/\s+/g, " ").trim() ?? ""
  if (!line) return handle ? `@${handle}` : "Post"
  return line.length > 100 ? `${line.slice(0, 99).trimEnd()}…` : line
}

/**
 * Reads the post's page from X or Threads, keeps its pictures, and saves the
 * words. A post with a video then downloads it under the same lease, so the
 * Post card says "Saving the video" while the words are already there to
 * read. A Threads post brings its words and author only (`threads-reader.ts`).
 */
async function runReadPost(job: Claimed): Promise<void> {
  const stored: string[] = []
  let downloadNext = false
  try {
    if (!job.platformId) throw new SayableError(LIBRARY_SAYS.notALink)
    const post = job.source === "threads" ? await readThreadsPost(job.sourceUrl ?? "") : await readXPost(job.platformId)
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
    const words = {
      importStatus: "saved",
      importError: null,
      title: readTitle(postTitle(post.text, post.authorHandle)),
      sourceUrl: post.url,
      authorName: keepAuthor(post.authorName ?? (post.authorHandle ? `@${post.authorHandle}` : null)),
      authorHandle: sql`case when ${noteNotes.authorName} is null then ${post.authorHandle} else ${noteNotes.authorHandle} end`,
      authorPicturePath: author?.path ?? null,
      postedAt: post.postedAt,
      postText: post.text,
      pictures,
      quoted,
      thread,
      threadStatus: post.threadStatus,
      likesWhenSaved: post.likes,
      repostsWhenSaved: post.reposts,
      videoStatus,
      videoError: tooLong ? LIBRARY_SAYS.tooLong : null,
      videoSourceUrl: post.video?.url ?? null,
      durationSeconds: post.video?.seconds ?? null,
      coverPath: cover?.path ?? null,
    } satisfies Changes
    // A video to download keeps the lease, pushed forward; anything else lets it go.
    const saved = videoStatus === "downloading" ? await holdOn(job, words) : await writeHeld(job, { ...words, ...RELEASE })
    if (!saved) {
      await dropStored(stored)
      return
    }
    downloadNext = videoStatus === "downloading"
  } catch (error) {
    await dropStored(stored)
    await failImport(job, error)
    return
  }
  // Outside the try above: the post is saved by now, so nothing the video
  // does, or the notice, may throw its pictures away or mark the words failed.
  if (downloadNext) await runPostVideo(job)
  else await tellOwner({ ownerId: job.ownerId, noteId: job.id, message: `Ready to analyse: ${await titleOf(job.id, "your post")}` })
}

/**
 * Downloads an X post's video with the same downloader the video sources
 * use, into the person's media library. A failure says why on the Post card
 * and in the bell; the words stay, and the post can still be analysed.
 */
async function runPostVideo(job: Claimed): Promise<void> {
  let file: StoredFile | null = null
  let dir: string | null = null
  try {
    const [row] = await db.select().from(noteNotes).where(eq(noteNotes.id, job.id))
    if (!row?.videoSourceUrl) throw new SayableError(LIBRARY_SAYS.noVideo)
    const downloaded = await downloadVideo(parseVideoLink(row.videoSourceUrl))
    dir = downloaded.dir
    if (!(await holdOn(job))) return
    file = await storeFile({
      ownerId: job.ownerId,
      filePath: downloaded.filePath,
      mimeType: downloaded.mimeType,
      kind: downloaded.kind,
      name: `${noteTitle(row.title)} video`,
    })
    const saved = await writeHeld(job, {
      videoStatus: "saved",
      videoError: null,
      videoMediaId: file.id,
      mediaKind: downloaded.kind,
      durationSeconds: row.durationSeconds ?? downloaded.durationSeconds,
      ...RELEASE,
    })
    if (!saved) {
      await discardFile(file)
      return
    }
    await tellOwner({ ownerId: job.ownerId, noteId: job.id, message: `Ready to analyse: ${noteTitle(row.title)}` })
  } catch (error) {
    if (file) await discardFile(file)
    const reason = failureWords(error).slice(0, 500)
    console.error("An X post's video failed", job.id, error)
    const failed = await writeHeld(job, { videoStatus: "failed", videoError: reason, ...RELEASE })
    if (failed) {
      await tellOwner({
        ownerId: job.ownerId,
        noteId: job.id,
        message: `The video couldn't be saved: ${await titleOf(job.id, "your post")}`,
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
 * The saved file comes down to a folder of its own, ffmpeg cuts out the
 * sound as a small mp3, and Gemini writes the words down. Null when the note
 * has no saved file to listen to.
 */
async function writeDown(job: Claimed, apiKey: string, dir: string) {
  if (!job.videoMediaId) return null
  const [media] = await db
    .select({ storagePath: customShellMedia.storagePath })
    .from(customShellMedia)
    .where(eq(customShellMedia.id, job.videoMediaId))
  if (!media) throw new SayableError(LIBRARY_SAYS.fileGone)
  const sourcePath = path.join(dir, "source")
  const soundPath = path.join(dir, "sound.mp3")
  await downloadToFile(media.storagePath, sourcePath)
  const readSeconds = await extractSound(sourcePath, soundPath)
  await rm(sourcePath, { force: true })
  const durationSeconds = job.durationSeconds ?? readSeconds
  if (durationSeconds !== null && durationSeconds > MAX_DURATION_SECONDS) throw new SayableError(LIBRARY_SAYS.tooLong)
  const durationMs = durationSeconds ? durationSeconds * 1000 : null
  const transcript = await transcribe({
    ownerId: job.ownerId,
    noteId: job.id,
    apiKey,
    sound: new Uint8Array(await readFile(soundPath)),
    durationMs,
  })
  return { transcript, durationSeconds, durationMs }
}

/** Tags the AI suggests join the note's own and are never taken off (task part 10). */
function joinTags(own: string[], suggested: string[]) {
  const joined = [...own]
  for (const tag of suggested) if (!joined.includes(tag) && joined.length < TAGS_PER_NOTE) joined.push(tag)
  return joined
}

/**
 * Writes down what is said, then writes the summary, the plan, the quotes and
 * the tags: from the transcript for a video, and from the post with
 * everything that goes with it for X. Analyse again replaces all of it, the
 * ticks and edits included (Tyler, 19 Oct 2026: "Replace all, warn first").
 */
async function runAnalysis(job: Claimed): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "note-analyse-"))
  try {
    const apiKey = await requireGeminiKey()
    const aboutYou = await getAboutYou()
    let row: NoteRow = job

    // A video is written down once; Analyse again reads the words it has, which
    // is what the price line counted. An X post's own words are already here.
    const needsWords = job.videoMediaId !== null && job.transcript === null
    const heard = needsWords ? await writeDown(job, apiKey, dir) : null
    if (heard) {
      const wrote = await holdOn(job, {
        analyseStatus: "summarising",
        language: heard.transcript.language,
        durationSeconds: heard.durationSeconds,
        transcript: heard.transcript.lines,
        transcriptText: heard.transcript.lines.map((line) => line.text).join(" "),
      })
      if (!wrote) throw new LeaseLost()
      row = { ...row, transcript: heard.transcript.lines }
    } else if (!(await holdOn(job, { analyseStatus: "summarising" }))) {
      throw new LeaseLost()
    }

    let answer: { summary: string[]; actionPlan: NoteRow["actionPlan"]; quotes: NoteRow["quotes"]; tags: string[] }
    if (isPostSource(job.source)) {
      const pictures = (
        await Promise.all(allPictures(row).slice(0, PICTURES_PER_ANALYSIS).map(readStoredPicture))
      ).filter((part): part is PostPicturePart => part !== null)
      answer = await summarisePost({ row, apiKey, aboutYou, pictures })
    } else {
      const lines = row.transcript ?? []
      // Nothing was said, so there is nothing to summarise or pay for.
      answer = lines.length
        ? await summarise({
            ownerId: job.ownerId,
            noteId: job.id,
            apiKey,
            aboutYou,
            lines,
            durationMs: heard?.durationMs ?? (job.durationSeconds ? job.durationSeconds * 1000 : null),
          })
        : { summary: [], actionPlan: [], quotes: [], tags: [] }
    }

    const [current] = await db.select({ tags: noteNotes.tags }).from(noteNotes).where(eq(noteNotes.id, job.id))
    const ready = await writeHeld(job, {
      analyseStatus: "ready",
      analyseError: null,
      summary: answer.summary,
      actionPlan: answer.actionPlan,
      quotes: answer.quotes,
      tags: joinTags(current?.tags ?? job.tags, answer.tags),
      analysedAt: now(),
      ...RELEASE,
    })
    if (!ready) return
    await tellOwner({ ownerId: job.ownerId, noteId: job.id, message: `Analysed: ${await titleOf(job.id, "your note")}` })
  } catch (error) {
    if (error instanceof LeaseLost) return
    await failAnalysis(job, error)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** One plan from the picked notes' plans. A note deleted since is left out. */
async function runMerge(job: Claimed): Promise<void> {
  try {
    const apiKey = await requireGeminiKey()
    const ids = job.mergedFrom ?? []
    const rows = ids.length
      ? await db
          .select()
          .from(noteNotes)
          .where(and(eq(noteNotes.ownerId, job.ownerId), inArray(noteNotes.id, ids), isNotNull(noteNotes.actionPlan)))
      : []
    const sources = ids
      .map((id) => rows.find((row) => row.id === id))
      .filter((row): row is NoteRow => Boolean(row?.actionPlan?.length))
    if (sources.length < 2) throw new SayableError("Fewer than two of these notes still have a plan.")
    if (!(await holdOn(job, { analyseStatus: "summarising" }))) return
    const plan = await mergePlans({
      ownerId: job.ownerId,
      mergedId: job.id,
      apiKey,
      aboutYou: await getAboutYou(),
      notes: sources.map((row) => ({ title: noteTitle(row.title), summary: row.summary ?? [], plan: row.actionPlan ?? [] })),
    })
    const ready = await writeHeld(job, {
      analyseStatus: "ready",
      analyseError: null,
      actionPlan: plan,
      analysedAt: now(),
      ...RELEASE,
    })
    if (!ready) return
    await tellOwner({ ownerId: job.ownerId, noteId: job.id, message: `Plan ready: ${noteTitle(job.title)}` })
  } catch (error) {
    await failAnalysis(job, error)
  }
}
