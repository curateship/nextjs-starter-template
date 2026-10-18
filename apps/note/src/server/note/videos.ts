import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { checkAiAllowance } from "@/server/ai/usage"
import { getAiKey } from "@/server/ai/keys"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getOwnedMedia } from "@/server/media/library"
import { deleteFromR2, getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { requireOwnFolder } from "@/server/note/folders"
import { readVideoLink } from "@/server/note/links"
import { noteVideos, type NoteVideoRow } from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import {
  firstLine,
  isAnalysing,
  MAX_FILE_BYTES,
  NO_FOLDER,
  NOTE_SAYS,
  NOTE_TEXT_MAX,
  planDone,
  VIDEOS_PAGE_SIZE,
  type FolderScope,
  type NoteVideoCard,
  type NoteVideoDetail,
  type NoteVideoPage,
} from "@/lib/note/videos"

/**
 * One person's saved videos: saving a link, finishing an upload, reading the
 * list and one video, and every change a click makes.
 *
 * Nothing slow happens here. Saving a link writes a row and returns; the
 * download and the AI happen in the worker (`jobs.ts`), which finds the row by
 * its status. Every query is scoped to the owner, so one person never sees
 * another's videos or words.
 */

/** Before yt-dlp has named the site of a link from anywhere else. */
const UNNAMED_SOURCE = "web"

/**
 * Every saved link is a download of up to 500MB on the server, so one person
 * may start sixty in ten minutes, the same allowance the shell gives uploads.
 */
const SAVE_LINK_LIMIT = { maxAttempts: 60, windowSeconds: 10 * 60 }

// ---------------------------------------------------------------------------
// Saving

/**
 * Writes the row the worker will download, or hands back the one already
 * there. Saving a YouTube, TikTok or Instagram link twice is one row; a link
 * from anywhere else is folded into its twin after the download, once yt-dlp
 * has said which video it is.
 */
export async function saveLink(
  ownerId: string,
  url: string
): Promise<{ video: NoteVideoCard; alreadySaved: boolean }> {
  await enforceRateLimit(`note-save-link:${ownerId}`, SAVE_LINK_LIMIT)
  const link = await readVideoLink(url)
  const at = now()
  try {
    const [created] = await db
      .insert(noteVideos)
      .values({
        id: uuid(),
        ownerId,
        source: link.source ?? UNNAMED_SOURCE,
        sourceUrl: link.url,
        platformVideoId: link.platformVideoId,
        kind: "video",
        status: "waiting",
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    return { video: await cardFor(created), alreadySaved: false }
  } catch (error) {
    if (!isUniqueViolation(error) || !link.source || !link.platformVideoId) throw error
  }

  const [existing] = await db
    .select()
    .from(noteVideos)
    .where(
      and(
        eq(noteVideos.ownerId, ownerId),
        eq(noteVideos.source, link.source),
        eq(noteVideos.platformVideoId, link.platformVideoId)
      )
    )
  if (!existing) throw new Error(NOTE_SAYS.videoNotFound)
  return { video: await cardFor(existing), alreadySaved: true }
}

/**
 * Turns a finished upload into a saved video. The library row must be the
 * caller's own, and a video or sound file. Asked twice for the same file, it
 * hands back the video already made from it.
 */
export async function finishUpload(ownerId: string, mediaId: string): Promise<NoteVideoCard> {
  let media: typeof customShellMedia.$inferSelect
  try {
    media = await getOwnedMedia(ownerId, mediaId)
  } catch {
    throw new Error(NOTE_SAYS.videoNotFound)
  }
  if (media.fileType !== "video" && media.fileType !== "audio") {
    throw new Error("Only a video or sound file can be saved here.")
  }
  if (media.fileSize > MAX_FILE_BYTES) throw new Error(NOTE_SAYS.uploadTooBig)

  const [already] = await db
    .select()
    .from(noteVideos)
    .where(and(eq(noteVideos.ownerId, ownerId), eq(noteVideos.mediaId, media.id)))
  if (already) return cardFor(already)

  const at = now()
  const [created] = await db
    .insert(noteVideos)
    .values({
      id: uuid(),
      ownerId,
      source: "upload",
      kind: media.fileType === "audio" ? "audio" : "video",
      status: "saved",
      mediaId: media.id,
      title: media.originalName.replace(/\.[^./\\]+$/, "").trim() || "Uploaded file",
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return cardFor(created)
}

// ---------------------------------------------------------------------------
// Reading

/**
 * One page of the middle panel, newest first: every video, the ones in no
 * folder, or one folder's, narrowed by the search box when it has words in
 * it. The search reads titles, tags and every transcribed word, and only
 * ever this person's.
 */
export async function listVideos(
  ownerId: string,
  options: { folder?: FolderScope; search?: string; cursor?: string | null } = {}
): Promise<NoteVideoPage> {
  const filters: SQL[] = [eq(noteVideos.ownerId, ownerId)]
  if (options.folder === NO_FOLDER) filters.push(isNull(noteVideos.folderId))
  else if (options.folder) filters.push(eq(noteVideos.folderId, options.folder))

  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
    const matches = or(
      ilike(noteVideos.title, pattern),
      ilike(noteVideos.transcriptText, pattern),
      sql`${noteVideos.tags}::text ilike ${pattern}`
    )
    if (matches) filters.push(matches)
  }

  const after = readCursor(options.cursor)
  if (after) {
    const older = or(
      lt(noteVideos.createdAt, after.createdAt),
      and(eq(noteVideos.createdAt, after.createdAt), lt(noteVideos.id, after.id))
    )
    if (older) filters.push(older)
  }

  const rows = await db
    .select()
    .from(noteVideos)
    .where(and(...filters))
    .orderBy(desc(noteVideos.createdAt), desc(noteVideos.id))
    .limit(VIDEOS_PAGE_SIZE + 1)

  const page = rows.slice(0, VIDEOS_PAGE_SIZE)
  const last = page.at(-1)
  return {
    videos: await Promise.all(page.map(cardFor)),
    nextCursor:
      rows.length > VIDEOS_PAGE_SIZE && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null,
  }
}

function readCursor(cursor: string | null | undefined) {
  if (!cursor) return null
  const [at, id] = cursor.split("|")
  const createdAt = new Date(at ?? "")
  if (!id || Number.isNaN(createdAt.getTime())) return null
  return { createdAt, id }
}

/**
 * The cards for these ids, as they are now. The screen asks this every few
 * seconds while any card is still moving. An id that is missing from the
 * answer is gone: deleted, or folded into the same video saved earlier.
 */
export async function refreshVideos(ownerId: string, ids: string[]): Promise<NoteVideoCard[]> {
  if (!ids.length) return []
  const rows = await db
    .select()
    .from(noteVideos)
    .where(and(eq(noteVideos.ownerId, ownerId), inArray(noteVideos.id, ids)))
  return Promise.all(rows.map(cardFor))
}

export async function loadVideo(ownerId: string, id: string): Promise<NoteVideoDetail> {
  return detailFor(await requireOwnVideo(ownerId, id))
}

async function requireOwnVideo(ownerId: string, id: string): Promise<NoteVideoRow> {
  const [row] = await db
    .select()
    .from(noteVideos)
    .where(and(eq(noteVideos.id, id), eq(noteVideos.ownerId, ownerId)))
  if (!row) throw new Error(NOTE_SAYS.videoNotFound)
  return row
}

async function cardFor(row: NoteVideoRow): Promise<NoteVideoCard> {
  return {
    id: row.id,
    folderId: row.folderId,
    source: row.source,
    sourceUrl: row.sourceUrl,
    kind: row.kind,
    status: row.status,
    error: row.error,
    coverUrl: row.coverStoragePath ? await getPublicMediaUrl(row.coverStoragePath) : null,
    hasFile: row.mediaId !== null,
    title: videoTitle(row),
    channelName: row.channelName,
    durationSeconds: row.durationSeconds,
    firstSummaryLine: row.summary?.[0] ?? null,
    tags: row.tags ?? [],
    done: planDone(row.actionPlan),
    noteFirstLine: firstLine(row.note),
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * What a video is called: its own title, or before the download has said one,
 * the site it is on ("youtube.com"). The card and the bell use the same name.
 */
export function videoTitle(row: Pick<NoteVideoRow, "title" | "sourceUrl">) {
  if (row.title?.trim()) return row.title.trim()
  if (!row.sourceUrl) return "Uploaded file"
  try {
    return new URL(row.sourceUrl).hostname.replace(/^www\./, "")
  } catch {
    return "Saved video"
  }
}

/**
 * The right panel's whole view of one video. The file plays from the bucket's
 * own address, the same as Video's player: a `<video>` asking an app route for
 * byte ranges is refused by the dev server.
 */
async function detailFor(row: NoteVideoRow): Promise<NoteVideoDetail> {
  let playbackUrl: string | null = null
  if (row.mediaId) {
    const [media] = await db
      .select({ storagePath: customShellMedia.storagePath })
      .from(customShellMedia)
      .where(eq(customShellMedia.id, row.mediaId))
    if (media) playbackUrl = await getPublicMediaUrl(media.storagePath)
  }
  return {
    ...(await cardFor(row)),
    playbackUrl,
    postedAt: row.postedAt?.toISOString() ?? null,
    language: row.language,
    transcript: row.transcript ?? [],
    summary: row.summary ?? [],
    actionPlan: row.actionPlan ?? [],
    quotes: row.quotes ?? [],
    note: row.note ?? "",
    analysedAt: row.analysedAt?.toISOString() ?? null,
  }
}

// ---------------------------------------------------------------------------
// Changing

/**
 * Puts the video in the queue for the worker to transcribe and summarise.
 * Allowed once it is saved, after it was analysed, and after a failure when
 * the file is still there. Pressing twice is one job: a video already in the
 * queue or being analysed comes straight back as it is.
 *
 * Nothing is spent here. The Gemini key and the monthly allowance are checked
 * first so a refusal is said at the button, not later on the card.
 */
export async function analyseVideo(ownerId: string, id: string): Promise<NoteVideoDetail> {
  const row = await requireOwnVideo(ownerId, id)
  if (isAnalysing(row.status)) return detailFor(row)
  if (row.status !== "saved" && row.status !== "ready" && row.status !== "failed") {
    throw new Error(NOTE_SAYS.notAnalysable)
  }
  // Saved once, but the file has gone since: an admin deleted it from the
  // media library. Saying "wait" would never come true.
  if (row.mediaId === null) {
    throw new Error(row.sourceUrl ? NOTE_SAYS.fileGone : NOTE_SAYS.uploadGone)
  }

  if (!(await getAiKey("gemini"))) throw new Error(NOTE_SAYS.noGeminiKey)
  await checkAiAllowance(ownerId)

  const [queued] = await db
    .update(noteVideos)
    .set({
      status: "queued",
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(noteVideos.id, id),
        eq(noteVideos.ownerId, ownerId),
        inArray(noteVideos.status, ["saved", "ready", "failed"]),
        isNotNull(noteVideos.mediaId)
      )
    )
    .returning()
  // Another press got there first; hand back where it has got to.
  return detailFor(queued ?? (await requireOwnVideo(ownerId, id)))
}

/**
 * Try again on a failed video. With its file still there it goes back in the
 * analysis queue; without one, a link is downloaded again. An upload with no
 * file has nothing to fetch, so it says to upload it again.
 */
export async function retryVideo(ownerId: string, id: string): Promise<NoteVideoDetail> {
  const row = await requireOwnVideo(ownerId, id)
  if (row.status !== "failed") return detailFor(row)
  if (row.mediaId) return analyseVideo(ownerId, id)
  if (!row.sourceUrl) throw new Error(NOTE_SAYS.uploadGone)

  const [waiting] = await db
    .update(noteVideos)
    .set({
      status: "waiting",
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(
      and(eq(noteVideos.id, id), eq(noteVideos.ownerId, ownerId), eq(noteVideos.status, "failed"))
    )
    .returning()
  return detailFor(waiting ?? (await requireOwnVideo(ownerId, id)))
}

/**
 * Removes the video from the library: the stored file, the cover, the
 * library row and the video row, in that order. A step that fails stops the
 * rest, so the row is never left pointing at a file that has gone without
 * saying so, and pressing Delete again finishes the job.
 *
 * A worker part-way through this video finds its row gone at its next write
 * and throws its own work away.
 */
export async function deleteVideo(ownerId: string, id: string): Promise<void> {
  const row = await requireOwnVideo(ownerId, id)
  const [media] = row.mediaId
    ? await db
        .select({
          id: customShellMedia.id,
          storagePath: customShellMedia.storagePath,
          emailProtectedAt: customShellMedia.emailProtectedAt,
        })
        .from(customShellMedia)
        .where(and(eq(customShellMedia.id, row.mediaId), eq(customShellMedia.userId, ownerId)))
    : []
  // A file a sent newsletter carries is kept, the shell's own rule for its
  // library: an inbox copy can outlive every record of the email.
  const removeFile = media !== undefined && media.emailProtectedAt === null
  if (removeFile) await deleteFromR2(media.storagePath)
  if (row.coverStoragePath) await deleteFromR2(row.coverStoragePath)
  if (removeFile) await db.delete(customShellMedia).where(eq(customShellMedia.id, media.id))
  await db
    .delete(noteVideos)
    .where(and(eq(noteVideos.id, id), eq(noteVideos.ownerId, ownerId)))
}

/** Into one folder, or out of every folder with null. */
export async function moveVideo(
  ownerId: string,
  id: string,
  folderId: string | null
): Promise<NoteVideoCard> {
  if (folderId) await requireOwnFolder(ownerId, folderId)
  const [moved] = await db
    .update(noteVideos)
    .set({ folderId, updatedAt: now() })
    .where(and(eq(noteVideos.id, id), eq(noteVideos.ownerId, ownerId)))
    .returning()
  if (!moved) throw new Error(NOTE_SAYS.videoNotFound)
  return cardFor(moved)
}

/**
 * Ticks or unticks one step of the action plan. Written in the database as
 * one change to that one step, so two quick ticks of two different steps can
 * never undo each other.
 */
export async function tickStep(
  ownerId: string,
  id: string,
  index: number,
  done: boolean
): Promise<NoteVideoCard> {
  const [ticked] = await db
    .update(noteVideos)
    .set({
      actionPlan: sql`jsonb_set(${noteVideos.actionPlan}, ${`{${index},done}`}::text[], ${done ? "true" : "false"}::jsonb)`,
      updatedAt: now(),
    })
    .where(
      and(
        eq(noteVideos.id, id),
        eq(noteVideos.ownerId, ownerId),
        sql`jsonb_typeof(${noteVideos.actionPlan}) = 'array'`,
        sql`jsonb_array_length(${noteVideos.actionPlan}) > ${index}`
      )
    )
    .returning()
  if (!ticked) {
    await requireOwnVideo(ownerId, id)
    throw new Error("That step is not on the plan any more. Reload the video.")
  }
  return cardFor(ticked)
}

export async function saveNote(ownerId: string, id: string, note: string): Promise<NoteVideoCard> {
  const [saved] = await db
    .update(noteVideos)
    .set({ note: note.slice(0, NOTE_TEXT_MAX), updatedAt: now() })
    .where(and(eq(noteVideos.id, id), eq(noteVideos.ownerId, ownerId)))
    .returning()
  if (!saved) throw new Error(NOTE_SAYS.videoNotFound)
  return cardFor(saved)
}
