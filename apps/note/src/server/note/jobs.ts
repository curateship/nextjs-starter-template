import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm"

import { isAiLimitError } from "@/server/ai/usage"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { deleteFromR2, R2StorageNotConfiguredError } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { summarise, transcribe } from "@/server/note/analysis"
import { downloadVideo } from "@/server/note/download"
import {
  discardFile,
  downloadToFile,
  extractSound,
  lookAtFile,
  storeFile,
  type StoredFile,
} from "@/server/note/files"
import { requireGeminiKey } from "@/server/note/gemini"
import { parseVideoLink } from "@/server/note/links"
import { tellOwner } from "@/server/note/notices"
import { noteVideos, type NoteVideoRow } from "@/server/note/schema"
import { SayableError } from "@/server/note/sayable"
import { isUniqueViolation } from "@/server/note/unique-violation"
import { videoTitle } from "@/server/note/videos"
import { isUnreadableKeyError, MAX_DURATION_SECONDS, NOTE_SAYS } from "@/lib/note/videos"

/**
 * The `note-videos` worker. The status is the job: the screen writes a row and
 * returns, and this finds the row on the shell's fifteen-second loop.
 *
 * One job at a time, claimed in this order: put back anything whose worker went away,
 * then take one video queued for analysis, else one link waiting to download,
 * else one upload whose length nobody has read yet. A claim is a lease of 20
 * minutes, pushed forward between steps, and every write checks the lease is
 * still this worker's. A write that finds another lease, or no row because the
 * video was deleted, throws its own work away.
 */

/**
 * How long one claim lasts before another tick may take it over. It has to
 * outlast the slowest honest step: a 15-minute download, or Gemini listening
 * to thirty minutes of sound. A lease that runs out mid-job is not a harmless
 * retry, because the analysis would be paid for twice.
 */
const JOB_LEASE_MS = 20 * 60 * 1000

type Claimed = NoteVideoRow & { leaseToken: string }

/** The job this process is running, if any. One at a time per process. */
let running: Promise<void> | null = null

/**
 * The worker's tick. It starts at most one job and returns without waiting
 * for it to end, because a download can take fifteen minutes and the shell's
 * pass waits for every worker on it: emails and automations would sit idle
 * meanwhile, and the production worker's health check counts a pass longer
 * than two minutes as a stopped worker. The next tick starts nothing while
 * this process still has a job going.
 */
export async function tick(): Promise<void> {
  await releaseAbandoned()
  if (running) return
  running = runNext()
    .catch((error) => {
      console.error("A note-videos job could not start", error)
    })
    .finally(() => {
      running = null
    })
}

/** Claims the next job and runs it to the end. */
export async function runNext(): Promise<void> {
  const queued = await claimQueued()
  if (queued) return runAnalysis(queued)
  const waiting = await claimWaiting()
  if (waiting) return runDownload(waiting)
  const unread = await claimUnreadUpload()
  if (unread) return runLook(unread)
}

/**
 * A row left mid-job by a restart has a lease nobody holds any more. A
 * download goes back to waiting and an analysis back to the queue, so closing
 * the browser or redeploying never strands a video with no status.
 */
export async function releaseAbandoned(): Promise<void> {
  const at = now()
  const expired = or(isNull(noteVideos.leaseExpiresAt), lt(noteVideos.leaseExpiresAt, at))
  const free = { leaseToken: null, leaseExpiresAt: null, updatedAt: at }
  await db
    .update(noteVideos)
    .set({ status: "waiting", ...free })
    .where(and(eq(noteVideos.status, "downloading"), expired))
  await db
    .update(noteVideos)
    .set({ status: "queued", ...free })
    .where(and(inArray(noteVideos.status, ["transcribing", "summarising"]), expired))
  await db
    .update(noteVideos)
    .set(free)
    .where(
      and(
        eq(noteVideos.status, "saved"),
        isNotNull(noteVideos.leaseToken),
        lt(noteVideos.leaseExpiresAt, at)
      )
    )
}

function leaseUntil(at: Date) {
  return new Date(at.getTime() + JOB_LEASE_MS)
}

/** The oldest row in one status, taken by one tick and no other. */
async function claim(
  from: "queued" | "waiting",
  to: "transcribing" | "downloading"
): Promise<Claimed | null> {
  const [oldest] = await db
    .select({ id: noteVideos.id })
    .from(noteVideos)
    .where(eq(noteVideos.status, from))
    .orderBy(asc(noteVideos.updatedAt))
    .limit(1)
  if (!oldest) return null

  const leaseToken = uuid()
  const at = now()
  const [claimed] = await db
    .update(noteVideos)
    .set({ status: to, leaseToken, leaseExpiresAt: leaseUntil(at), updatedAt: at })
    // Only one tick can win this, so two servers never do the same job twice.
    .where(and(eq(noteVideos.id, oldest.id), eq(noteVideos.status, from)))
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

export function claimQueued() {
  return claim("queued", "transcribing")
}

export function claimWaiting() {
  return claim("waiting", "downloading")
}

/**
 * An uploaded file nobody has looked at yet: it has a file and no length.
 * Its status stays "saved" while the lease is held, so it can still be
 * analysed. A look that fails leaves a note in `error`, which keeps it from
 * being picked up again on every tick.
 */
export async function claimUnreadUpload(): Promise<Claimed | null> {
  const unread = and(
    eq(noteVideos.status, "saved"),
    isNotNull(noteVideos.mediaId),
    isNull(noteVideos.durationSeconds),
    isNull(noteVideos.error),
    isNull(noteVideos.leaseToken)
  )
  const [oldest] = await db
    .select({ id: noteVideos.id })
    .from(noteVideos)
    .where(unread)
    .orderBy(asc(noteVideos.updatedAt))
    .limit(1)
  if (!oldest) return null

  const leaseToken = uuid()
  const at = now()
  const [claimed] = await db
    .update(noteVideos)
    .set({ leaseToken, leaseExpiresAt: leaseUntil(at) })
    .where(and(eq(noteVideos.id, oldest.id), unread))
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

/**
 * One write, only while the lease is still this worker's. False means the
 * video was deleted or another worker took it over, and the caller drops
 * whatever it was doing.
 */
async function writeHeld(
  job: Claimed,
  values: Partial<typeof noteVideos.$inferInsert>
): Promise<boolean> {
  const at = now()
  const written = await db
    .update(noteVideos)
    .set({ ...values, updatedAt: at })
    .where(and(eq(noteVideos.id, job.id), eq(noteVideos.leaseToken, job.leaseToken)))
    .returning({ id: noteVideos.id })
  return written.length > 0
}

/** Pushes the lease forward between steps, so a slow job keeps its place. */
function holdOn(job: Claimed, values: Partial<typeof noteVideos.$inferInsert> = {}) {
  return writeHeld(job, { ...values, leaseExpiresAt: leaseUntil(now()) })
}

/** Thrown when the lease was lost, to stop a job without calling it a failure. */
class LeaseLost extends Error {}

const OWN_SENTENCES: ReadonlySet<string> = new Set(Object.values(NOTE_SAYS))

/**
 * The sentence a failure leaves on the card and in the bell. Only words
 * written for the owner get through: the app's own sentences, a step's
 * `SayableError`, and the shell's "storage is not set up". Anything else,
 * such as a database error with its query in it, stays in the server log.
 */
export function failureWords(error: unknown) {
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

/**
 * A failure keeps its reason on the row, up to 500 characters, and says so in
 * the bell. Whatever went wrong, the row ends up `failed` with a sentence a
 * person can act on, never stuck with no status.
 */
async function failJob(
  job: Claimed,
  error: unknown,
  values: Partial<typeof noteVideos.$inferInsert> = {}
): Promise<void> {
  const reason = failureWords(error).slice(0, 500)
  console.error("A saved video failed", job.id, error)
  const failed = await writeHeld(job, {
    ...values,
    status: "failed",
    error: reason,
    leaseToken: null,
    leaseExpiresAt: null,
  })
  if (!failed) return
  const [row] = await db
    .select({ title: noteVideos.title, sourceUrl: noteVideos.sourceUrl })
    .from(noteVideos)
    .where(eq(noteVideos.id, job.id))
  await tellOwner({
    ownerId: job.ownerId,
    videoId: job.id,
    message: `Failed: ${videoTitle(row ?? job)}`,
    detail: reason,
  })
}

// ---------------------------------------------------------------------------
// Downloading a link

/**
 * yt-dlp fetches the file into a folder of its own, the file goes up to the
 * bucket in pieces, ffmpeg takes a cover from a second in, and the row becomes
 * `saved`. A row that fails anywhere becomes `failed` with the reason, and a
 * file already stored for it is deleted, so Try again starts clean.
 */
export async function runDownload(job: Claimed): Promise<void> {
  let stored: StoredFile | null = null
  let dir: string | null = null
  try {
    if (!job.sourceUrl) throw new Error(NOTE_SAYS.uploadGone)
    const downloaded = await downloadVideo(parseVideoLink(job.sourceUrl))
    dir = downloaded.dir

    // Which video this is, now yt-dlp has said. A link from anywhere else,
    // or a shortened TikTok link, may turn out to be a video already saved:
    // then this row goes and the one saved earlier is what stays. A plain page
    // or file is read by yt-dlp's "generic" reader, whose id is only the last
    // part of the address ("intro" for two different sites' /intro), so it
    // names nothing and is never folded.
    const named = downloaded.source === "generic" ? null : downloaded
    const source = job.platformVideoId ? job.source : (named?.source ?? job.source)
    const platformVideoId = job.platformVideoId ?? named?.platformVideoId ?? null
    try {
      if (!(await holdOn(job, { source, platformVideoId }))) return
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      await db
        .delete(noteVideos)
        .where(and(eq(noteVideos.id, job.id), eq(noteVideos.leaseToken, job.leaseToken)))
      return
    }

    stored = await storeFile({
      ownerId: job.ownerId,
      filePath: downloaded.filePath,
      mimeType: downloaded.mimeType,
      kind: downloaded.kind,
      name: downloaded.title ?? "Saved video",
    })
    const look = await lookAtFile({
      ownerId: job.ownerId,
      videoId: job.id,
      filePath: downloaded.filePath,
      kind: downloaded.kind,
    })
    const durationSeconds = downloaded.durationSeconds ?? look.durationSeconds
    if (durationSeconds !== null && durationSeconds > MAX_DURATION_SECONDS) {
      if (look.coverStoragePath) await deleteFromR2(look.coverStoragePath).catch(() => undefined)
      throw new Error(NOTE_SAYS.tooLong)
    }

    const saved = await writeHeld(job, {
      status: "saved",
      kind: downloaded.kind,
      mediaId: stored.id,
      coverStoragePath: look.coverStoragePath,
      title: downloaded.title,
      channelName: downloaded.channelName,
      durationSeconds,
      postedAt: downloaded.postedAt,
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    if (!saved) {
      // Deleted while downloading, or taken over. The file belongs to nothing
      // now. The cover is named after the row, so it only goes when the row
      // itself has gone; a worker that took over writes the very same one.
      await discardFile(stored)
      const [still] = await db
        .select({ id: noteVideos.id })
        .from(noteVideos)
        .where(eq(noteVideos.id, job.id))
      if (!still && look.coverStoragePath) {
        await deleteFromR2(look.coverStoragePath).catch(() => undefined)
      }
      return
    }

    await tellOwner({
      ownerId: job.ownerId,
      videoId: job.id,
      message: `Ready to analyse: ${videoTitle({ title: downloaded.title, sourceUrl: job.sourceUrl })}`,
    })
  } catch (error) {
    if (stored) await discardFile(stored)
    await failJob(job, error, { mediaId: null, coverStoragePath: null })
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Looking at an upload

/**
 * An uploaded file gets the same cover and length a link gets from its
 * download. A file over 30 minutes is refused here, its file deleted, because
 * it would only ever fail to analyse, and the bell says so. A file that is
 * fine rings nothing: the person watched it upload.
 */
export async function runLook(job: Claimed): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "note-look-"))
  try {
    const media = await mediaOf(job)
    if (!media) throw new Error(NOTE_SAYS.uploadGone)
    const filePath = path.join(dir, "source")
    await downloadToFile(media.storagePath, filePath)
    const look = await lookAtFile({
      ownerId: job.ownerId,
      videoId: job.id,
      filePath,
      kind: job.kind,
    })

    if (look.durationSeconds !== null && look.durationSeconds > MAX_DURATION_SECONDS) {
      if (look.coverStoragePath) await deleteFromR2(look.coverStoragePath).catch(() => undefined)
      await discardFile({ id: media.id, storagePath: media.storagePath })
      await failJob(job, new Error(NOTE_SAYS.tooLong), {
        mediaId: null,
        durationSeconds: look.durationSeconds,
      })
      return
    }

    const written = await writeHeld(job, {
      coverStoragePath: look.coverStoragePath,
      durationSeconds: look.durationSeconds,
      // Nothing about the length could be read. Noted, so this file is not
      // looked at again on every tick; analysing it reads it again anyway.
      error: look.durationSeconds === null ? "The length could not be read." : null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    if (!written && look.coverStoragePath) await keepOrDropCover(job, look.coverStoragePath)
  } catch (error) {
    console.error("An uploaded video could not be looked at", job.id, error)
    await writeHeld(job, {
      error: "The length could not be read.",
      leaseToken: null,
      leaseExpiresAt: null,
    })
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * The look lost its lease after the cover was stored: Delete was pressed, or
 * Analyse took the video over. A deleted video's cover goes. A video still
 * there keeps it, unless the analysis has already put the same one on it.
 */
async function keepOrDropCover(job: Claimed, coverStoragePath: string) {
  const [row] = await db
    .select({ coverStoragePath: noteVideos.coverStoragePath })
    .from(noteVideos)
    .where(eq(noteVideos.id, job.id))
  if (!row) {
    await deleteFromR2(coverStoragePath).catch(() => undefined)
    return
  }
  if (row.coverStoragePath) return
  await db
    .update(noteVideos)
    .set({ coverStoragePath })
    .where(and(eq(noteVideos.id, job.id), isNull(noteVideos.coverStoragePath)))
}

async function mediaOf(job: Claimed) {
  if (!job.mediaId) return null
  const [media] = await db
    .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
    .from(customShellMedia)
    .where(eq(customShellMedia.id, job.mediaId))
  return media ?? null
}

// ---------------------------------------------------------------------------
// Analysing

/**
 * The file comes down to a folder of its own, ffmpeg cuts out the sound as a
 * small mp3 and the video itself is deleted at once, Gemini writes the words
 * down, then reads them and writes the summary, plan, quotes and tags. A
 * failure keeps the file, so Try again goes straight back to the queue.
 *
 * Analysing again replaces all five. The old summary is cleared the moment the
 * new words are written, because it belongs to the words it was made from.
 */
export async function runAnalysis(job: Claimed): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "note-analyse-"))
  try {
    const media = await mediaOf(job)
    if (!media) throw new Error(job.sourceUrl ? NOTE_SAYS.fileGone : NOTE_SAYS.uploadGone)
    const apiKey = await requireGeminiKey()

    const sourcePath = path.join(dir, "source")
    const soundPath = path.join(dir, "sound.mp3")
    await downloadToFile(media.storagePath, sourcePath)
    const readSeconds = await extractSound(sourcePath, soundPath)
    // An upload analysed before the worker looked at it has no cover yet, and
    // never will once its length is known, so the cover is taken here while
    // the file is on hand.
    const coverStoragePath =
      job.kind === "video" && !job.coverStoragePath
        ? (await lookAtFile({ ownerId: job.ownerId, videoId: job.id, filePath: sourcePath, kind: "video" }))
            .coverStoragePath
        : job.coverStoragePath
    await rm(sourcePath, { force: true })

    const durationSeconds = job.durationSeconds ?? readSeconds
    if (durationSeconds !== null && durationSeconds > MAX_DURATION_SECONDS) {
      throw new Error(NOTE_SAYS.tooLong)
    }
    if (!(await holdOn(job, { durationSeconds, coverStoragePath }))) throw new LeaseLost()

    const durationMs = durationSeconds ? durationSeconds * 1000 : null
    const transcript = await transcribe({
      ownerId: job.ownerId,
      videoId: job.id,
      apiKey,
      sound: new Uint8Array(await readFile(soundPath)),
      durationMs,
    })
    const wroteWords = await holdOn(job, {
      status: "summarising",
      language: transcript.language,
      transcript: transcript.lines,
      transcriptText: transcript.lines.map((line) => line.text).join(" "),
      summary: null,
      actionPlan: null,
      quotes: null,
      tags: null,
    })
    if (!wroteWords) throw new LeaseLost()

    // Nothing was said, so there is nothing to summarise or pay for.
    const summary = transcript.lines.length
      ? await summarise({
          ownerId: job.ownerId,
          videoId: job.id,
          apiKey,
          lines: transcript.lines,
          durationMs,
        })
      : { summary: [], actionPlan: [], quotes: [], tags: [] }

    const ready = await writeHeld(job, {
      status: "ready",
      summary: summary.summary,
      actionPlan: summary.actionPlan,
      quotes: summary.quotes,
      tags: summary.tags,
      analysedAt: now(),
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    if (!ready) return

    const [row] = await db
      .select({ title: noteVideos.title, sourceUrl: noteVideos.sourceUrl })
      .from(noteVideos)
      .where(eq(noteVideos.id, job.id))
    await tellOwner({
      ownerId: job.ownerId,
      videoId: job.id,
      message: `Analysed: ${videoTitle(row ?? job)}`,
    })
  } catch (error) {
    if (error instanceof LeaseLost) return
    await failJob(job, error)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
