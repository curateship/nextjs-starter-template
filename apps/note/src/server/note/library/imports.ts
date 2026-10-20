import type { JSONContent } from "@tiptap/core"
import { and, eq, inArray, isNotNull, isNull, notInArray, or } from "drizzle-orm"

import { getAiKey } from "@/server/ai/keys"
import { checkAiAllowance } from "@/server/ai/usage"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { cardsFor, detailFor } from "@/server/note/library/cards"
import { removeNoteFiles } from "@/server/note/library/files"
import { readImportLink } from "@/server/note/library/import-links"
import { folderForSource, libraryForSaving, requireLibrary } from "@/server/note/library/libraries"
import { requireNote } from "@/server/note/library/notes"
import { requireSaveKey } from "@/server/note/library/save-key"
import { noteLinks, noteNotes, type NoteRow } from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import { cleanHighlights, type Highlight, type HighlightPart } from "@/lib/note/library/highlights"
import { EMPTY_BODY } from "@/lib/note/notes/body"
import {
  isAnalysing,
  isPostSource,
  LIBRARY_SAYS,
  MANY_AT_ONCE_MAX,
  noteTitle,
  PLAN_STEP_MAX,
  PLAN_STEPS_MAX,
  type ImportSource,
  type NoteCard,
  type NoteDetail,
  type PlanStep,
} from "@/lib/note/library/notes"

/**
 * Imported notes: taking a link in, Try again, removing the video, and every
 * click that starts or changes the AI's work.
 *
 * Nothing slow happens here. Importing writes the note and returns at once;
 * the download, reading X and the AI happen in the `note-imports` worker
 * (`jobs.ts`), which finds the row by its status. The AI runs only when
 * Analyse is pressed (Tyler, 20 Oct 2026: "Only on the button").
 */

/** Not being analysed: never analysed (null), or settled. A plain `not in` leaves the nulls out. */
const notAnalysing = or(
  isNull(noteNotes.analyseStatus),
  notInArray(noteNotes.analyseStatus, ["queued", "transcribing", "summarising"])
)

/** Every import is a download or a read of X on the server, so sixty in ten minutes, as Videos allowed. */
const IMPORT_LIMIT = { maxAttempts: 60, windowSeconds: 10 * 60 }

export type ImportResult = {
  note: NoteCard
  /** The link was already in this library, so that note is handed back instead. */
  alreadyThere: boolean
  /** That note was in Trash and is back out of it. */
  restored?: boolean
  /** The source it was filed under, which differs from the one picked when the link was another site's. */
  filedAs: ImportSource
}

/**
 * Makes the note at once, titled "Importing…" until the worker reads the real
 * title, in the folder for its source, made the first time (Tyler, 20 Oct
 * 2026: "Import files it there"). A link from another source than the one
 * picked is filed under its real one, and the screen says so.
 */
export async function importLink(ownerId: string, input: { libraryId: string; url: string }): Promise<ImportResult> {
  const link = readImportLink(input.url)
  await requireLibrary(ownerId, input.libraryId)
  await enforceRateLimit(`note-import:${ownerId}`, IMPORT_LIMIT)
  const existing = await twinOf(input.libraryId, link.source, link.platformId)
  if (existing) return twinResult(ownerId, existing, link.source)

  const id = uuid()
  try {
    await db.transaction(async (tx) => {
      const folderId = await folderForSource(input.libraryId, link.source, tx)
      const at = now()
      await tx.insert(noteNotes).values({
        id,
        ownerId,
        libraryId: input.libraryId,
        folderId,
        title: "Importing…",
        body: EMPTY_BODY,
        source: link.source,
        sourceUrl: link.url,
        platformId: link.platformId,
        importStatus: "waiting",
        lastOpenedAt: at,
        createdAt: at,
        updatedAt: at,
      })
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    // The same link pressed twice in the same moment.
    const raced = await twinOf(input.libraryId, link.source, link.platformId)
    if (!raced) throw error
    return twinResult(ownerId, raced, link.source)
  }
  return { note: await cardOf(ownerId, id), alreadyThere: false, filedAs: link.source }
}

async function twinOf(libraryId: string, source: ImportSource, platformId: string | null) {
  if (!platformId) return null
  const [row] = await db
    .select({ id: noteNotes.id })
    .from(noteNotes)
    .where(and(eq(noteNotes.libraryId, libraryId), eq(noteNotes.source, source), eq(noteNotes.platformId, platformId)))
  return row?.id ?? null
}

/**
 * The note a link already has in this library. One in Trash is brought back
 * out, since importing it again says it is wanted.
 */
async function twinResult(ownerId: string, id: string, source: ImportSource): Promise<ImportResult> {
  const restored = await db
    .update(noteNotes)
    .set({ deletedAt: null, updatedAt: now() })
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId), isNotNull(noteNotes.deletedAt)))
    .returning({ id: noteNotes.id })
  return { note: await cardOf(ownerId, id), alreadyThere: true, restored: restored.length > 0, filedAs: source }
}

async function cardOf(ownerId: string, id: string): Promise<NoteCard> {
  const [card] = await cardsFor(ownerId, [id])
  if (!card) throw new Error(LIBRARY_SAYS.noteNotFound)
  return card
}

/**
 * The Save to Note button, and the iPhone Shortcut that opens the same
 * address: any link the Import menu takes goes into its source's folder in
 * the library opened last. Its key must be this person's own (`save-key.ts`).
 */
export async function saveFromLink(ownerId: string, url: string, key: string): Promise<ImportResult> {
  requireSaveKey(ownerId, key)
  return importLink(ownerId, { libraryId: await libraryForSaving(ownerId), url })
}

/** Try again on a failed import: the link is read or downloaded again from the start. */
export async function retryImport(ownerId: string, id: string): Promise<NoteDetail> {
  const row = await requireNote(ownerId, id)
  if (row.importStatus !== "failed" || !row.sourceUrl) return detailFor(ownerId, id)
  // A retry is another download or read of X, so it counts against the same allowance.
  await enforceRateLimit(`note-import:${ownerId}`, IMPORT_LIMIT)
  await db
    .update(noteNotes)
    .set({ importStatus: "waiting", importError: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now() })
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId), eq(noteNotes.importStatus, "failed")))
  return detailFor(ownerId, id)
}

/** An X post's video that failed to download is fetched again; the words stay as they are. */
export async function retryPostVideo(ownerId: string, id: string): Promise<NoteDetail> {
  const row = await requireNote(ownerId, id)
  if (row.videoStatus !== "failed" || !row.videoSourceUrl) throw new Error(LIBRARY_SAYS.noVideo)
  if (isAnalysing(row.analyseStatus)) throw new Error(LIBRARY_SAYS.stillAnalysing)
  await enforceRateLimit(`note-import:${ownerId}`, IMPORT_LIMIT)
  await db
    .update(noteNotes)
    .set({ videoStatus: "waiting", videoError: null, updatedAt: now() })
    .where(
      and(
        eq(noteNotes.id, id),
        eq(noteNotes.ownerId, ownerId),
        eq(noteNotes.videoStatus, "failed"),
        notAnalysing
      )
    )
  return detailFor(ownerId, id)
}

/**
 * The bin on the Video card: the link, the saved file, the author and the AI's
 * cards go, and the note with its own text stays as a plain "Note". A worker
 * part-way through it finds the lease gone at its next write and drops its work.
 */
export async function removeImport(ownerId: string, id: string): Promise<NoteDetail> {
  const row = await requireNote(ownerId, id)
  if (row.deletedAt) throw new Error(LIBRARY_SAYS.inTrash)
  await removeNoteFiles(row)
  await db
    .update(noteNotes)
    .set({
      title: row.title === "Importing…" ? "" : row.title,
      source: "note",
      sourceUrl: null,
      platformId: null,
      importStatus: null,
      importError: null,
      analyseStatus: null,
      analyseError: null,
      leaseToken: null,
      leaseExpiresAt: null,
      videoMediaId: null,
      mediaKind: null,
      coverPath: null,
      durationSeconds: null,
      postedAt: null,
      language: null,
      authorName: null,
      authorHandle: null,
      authorPicturePath: null,
      postText: null,
      pictures: null,
      quoted: null,
      thread: null,
      threadStatus: "none",
      likesWhenSaved: null,
      repostsWhenSaved: null,
      videoStatus: "none",
      videoError: null,
      videoSourceUrl: null,
      highlights: null,
      transcript: null,
      transcriptText: null,
      summary: null,
      actionPlan: null,
      quotes: null,
      analysedAt: null,
      mergedFrom: null,
      updatedAt: now(),
    })
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  return detailFor(ownerId, id)
}

// ---------------------------------------------------------------------------
// Analyse

async function checkAiCanRun(ownerId: string) {
  if (!(await getAiKey("gemini"))) throw new Error(LIBRARY_SAYS.noGeminiKey)
  await checkAiAllowance(ownerId)
}

/** Why this note cannot be analysed now, or null when it can. */
function analyseRefusal(
  row: Pick<
    NoteRow,
    "source" | "importStatus" | "videoStatus" | "videoMediaId" | "postText" | "deletedAt" | "mergedFrom" | "analyseStatus"
  >
): string | null {
  if (row.deletedAt) return LIBRARY_SAYS.inTrash
  // One plan from many is written again only after it failed; its notes are read again then.
  if (row.mergedFrom) return row.analyseStatus === "failed" ? null : LIBRARY_SAYS.notAnImport
  if (row.source === "note" || row.importStatus === null) return LIBRARY_SAYS.notAnImport
  if (row.importStatus !== "saved") return LIBRARY_SAYS.notImported
  if (isPostSource(row.source)) {
    if (row.postText === null) return LIBRARY_SAYS.notImported
    if (row.videoStatus === "waiting" || row.videoStatus === "downloading") return LIBRARY_SAYS.videoStillSaving
    return null
  }
  // Saved once, but the file has gone since: somebody deleted it from the media library.
  if (row.videoMediaId === null) return LIBRARY_SAYS.fileGone
  return null
}

/** Puts one note in the queue, after the checks. Nothing is spent here. */
async function queueNote(ownerId: string, row: NoteRow): Promise<void> {
  if (isAnalysing(row.analyseStatus)) return
  const refusal = analyseRefusal(row)
  if (refusal) throw new Error(refusal)
  await db
    .update(noteNotes)
    .set({ analyseStatus: "queued", analyseError: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now() })
    .where(
      and(
        eq(noteNotes.id, row.id),
        eq(noteNotes.ownerId, ownerId),
        // Read again here, not trusted from the row read earlier: a second
        // press must never put back a job the worker has already started.
        notAnalysing,
        row.mergedFrom
          ? eq(noteNotes.analyseStatus, "failed")
          : and(eq(noteNotes.importStatus, "saved"), notInArray(noteNotes.videoStatus, ["waiting", "downloading"]))
      )
    )
}

/**
 * Queues the note for the AI. The Gemini key and the monthly allowance are
 * checked first so a refusal is said at the button, not later on the card.
 * Pressing twice is one job.
 */
export async function analyseNote(ownerId: string, id: string): Promise<NoteDetail> {
  const row = await requireNote(ownerId, id)
  if (!isAnalysing(row.analyseStatus)) {
    const refusal = analyseRefusal(row)
    if (refusal) throw new Error(refusal)
    await checkAiCanRun(ownerId)
    await queueNote(ownerId, row)
  }
  return detailFor(ownerId, id)
}

/**
 * Analyse many: one request, one check of the key and the allowance, then
 * each note queued or skipped with its reason. A note with no link is
 * skipped, and the toast counts it.
 */
export async function analyseNotes(
  ownerId: string,
  ids: string[]
): Promise<{ queued: string[]; skipped: { id: string; reason: string }[] }> {
  if (ids.length > MANY_AT_ONCE_MAX) throw new Error(LIBRARY_SAYS.tooManyPicked)
  await checkAiCanRun(ownerId)
  const rows = await db
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, ids)))
  const queued: string[] = []
  const skipped: { id: string; reason: string }[] = []
  for (const id of ids) {
    const row = rows.find((each) => each.id === id)
    if (!row) {
      skipped.push({ id, reason: LIBRARY_SAYS.noteNotFound })
      continue
    }
    try {
      await queueNote(ownerId, row)
      queued.push(id)
    } catch (error) {
      skipped.push({ id, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { queued, skipped }
}

/**
 * One plan from many: a new plain note in Loose notes, "Plan from 4 notes",
 * whose plan the worker writes from the picked notes' plans. They are kept
 * by id, so deleting one later leaves the merged plan as it is.
 */
export async function mergePlans(ownerId: string, ids: string[]): Promise<NoteCard> {
  const unique = [...new Set(ids)]
  if (unique.length < 2) throw new Error(LIBRARY_SAYS.pickTwo)
  if (unique.length > MANY_AT_ONCE_MAX) throw new Error(LIBRARY_SAYS.tooManyPicked)
  const rows = await db
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, unique)))
  if (rows.length !== unique.length) throw new Error(LIBRARY_SAYS.noteNotFound)
  if (rows.some((row) => !row.actionPlan?.length)) throw new Error(LIBRARY_SAYS.noPlanYet)
  const libraryIds = new Set(rows.map((row) => row.libraryId))
  if (libraryIds.size !== 1) throw new Error(LIBRARY_SAYS.noteNotFound)
  await checkAiCanRun(ownerId)
  const at = now()
  const id = uuid()
  const tags = [...new Set(rows.flatMap((row) => row.tags))].slice(0, 25)
  const body: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Made from:" }] },
      {
        type: "bulletList",
        content: rows.map((row) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "noteLink", attrs: { id: row.id, label: noteTitle(row.title) } }] }],
        })),
      },
    ],
  }
  await db.insert(noteNotes).values({
    id,
    ownerId,
    libraryId: rows[0].libraryId,
    folderId: null,
    title: `Plan from ${rows.length} notes`,
    body,
    bodyText: `Made from: ${rows.map((row) => noteTitle(row.title)).join(", ")}`,
    tags,
    analyseStatus: "queued",
    mergedFrom: unique,
    lastOpenedAt: at,
    createdAt: at,
    updatedAt: at,
  })
  await db
    .insert(noteLinks)
    .values(rows.map((row) => ({ fromNoteId: id, toNoteId: row.id })))
    .onConflictDoNothing()
  return cardOf(ownerId, id)
}

/**
 * The whole plan as the person left it: words edited, steps added, deleted,
 * dragged and ticked. The screen sends one save at a time, each with the plan
 * as it stands, so the last one sent is the one kept.
 */
export async function savePlan(ownerId: string, id: string, steps: PlanStep[]): Promise<NoteCard> {
  if (steps.length > PLAN_STEPS_MAX) throw new Error(LIBRARY_SAYS.tooManySteps)
  const plan = steps.map((step) => {
    const text = step.text.replace(/\s+/g, " ").trim().slice(0, PLAN_STEP_MAX)
    if (!text) throw new Error(LIBRARY_SAYS.stepEmpty)
    return step.from ? { text, done: step.done, from: step.from.slice(0, 200) } : { text, done: step.done }
  })
  const row = await requireNote(ownerId, id)
  if (isAnalysing(row.analyseStatus)) throw new Error(LIBRARY_SAYS.stillAnalysing)
  const [saved] = await db
    .update(noteNotes)
    .set({ actionPlan: plan, updatedAt: now() })
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId), notAnalysing))
    .returning({ id: noteNotes.id })
  if (!saved) throw new Error(LIBRARY_SAYS.stillAnalysing)
  return cardOf(ownerId, id)
}

/** The words of each part a highlight can sit on: an X post's parts, or one transcript line. */
function partTextOf(row: Pick<NoteRow, "postText" | "quoted" | "thread" | "transcript">) {
  return (part: HighlightPart): string | null => {
    if (part === "post") return row.postText
    if (part === "quoted") return row.quoted?.text ?? null
    if (part.startsWith("line-")) return row.transcript?.[Number(part.slice("line-".length))]?.text ?? null
    const index = Number(part.slice("thread-".length))
    return row.thread?.[index]?.text ?? null
  }
}

/** The highlights as they now stand. Only ones that fit the saved words are kept. */
export async function saveHighlights(ownerId: string, id: string, highlights: Highlight[]): Promise<NoteCard> {
  const row = await requireNote(ownerId, id)
  const clean = cleanHighlights(highlights, partTextOf(row))
  await db
    .update(noteNotes)
    .set({ highlights: clean, updatedAt: now() })
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  return cardOf(ownerId, id)
}
