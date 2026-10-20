import { and, asc, eq, inArray, isNull } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { noteFolders, noteLinks, noteNotes, type NoteRow } from "@/server/note/schema"
import { noteBodyFacts } from "@/lib/note/notes/body"
import {
  LIBRARY_SAYS,
  planProgress,
  type AnalyseInputs,
  type LinkedNoteState,
  type NoteCard,
  type NoteDetail,
  type PictureView,
  type PostPicture,
} from "@/lib/note/library/notes"

/**
 * A stored note as the screen sees it: a row of the middle table (`toCard`)
 * and everything the right panel shows (`toDetail`). Pictures, covers and the
 * video play from the bucket's own address, the same as Video's player: a
 * `<video>` asking an app route for byte ranges is refused by the dev server.
 */

/** The most pictures one Analyse sends, across the post, its quote and its thread. */
export const PICTURES_PER_ANALYSIS = 12

/** Every picture the AI would read, in order: the post's, the quoted post's, the thread's. */
export function allPictures(row: Pick<NoteRow, "pictures" | "quoted" | "thread">): PostPicture[] {
  return [
    ...(row.pictures ?? []),
    ...(row.quoted?.pictures ?? []),
    ...(row.thread ?? []).flatMap((post) => post.pictures),
  ]
}

/** What the price line needs, from what is saved now. */
function analyseInputs(row: NoteRow): AnalyseInputs {
  const chars =
    (row.postText?.length ?? 0) +
    (row.quoted?.text.length ?? 0) +
    (row.thread ?? []).reduce((sum, post) => sum + post.text.length, 0)
  // A video is written down once; an X post's text is read as it is.
  const hasVideo = row.videoMediaId !== null
  const soundSeconds = hasVideo && row.transcript === null ? (row.durationSeconds ?? 0) : 0
  const spokenChars = (row.transcript ?? []).reduce((sum, line) => sum + line.text.length + 1, 0)
  return {
    soundSeconds,
    chars: chars + spokenChars,
    pictures: Math.min(allPictures(row).length, PICTURES_PER_ANALYSIS),
  }
}

function toCard(row: NoteRow, folderName: string | null): NoteCard {
  return {
    id: row.id,
    libraryId: row.libraryId,
    folderId: row.folderId,
    folderName,
    title: row.title,
    tags: row.tags,
    priority: row.priority,
    source: row.source,
    sourceUrl: row.sourceUrl,
    authorName: row.authorName,
    importStatus: row.importStatus,
    analyseStatus: row.analyseStatus,
    videoStatus: row.videoStatus,
    analysed: row.analysedAt !== null,
    progress: planProgress(row.actionPlan),
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    analyse: analyseInputs(row),
    planChars: (row.actionPlan ?? []).reduce((sum, step) => sum + step.text.length + 1, 0),
  }
}

export const withFolderName = { note: noteNotes, folderName: noteFolders.name }

export function joinedCard(row: { note: NoteRow; folderName: string | null }) {
  return toCard(row.note, row.folderName)
}

/** The cards for these ids, as they are now. A missing one is gone. */
export async function cardsFor(ownerId: string, ids: string[]): Promise<NoteCard[]> {
  if (!ids.length) return []
  const rows = await db
    .select(withFolderName)
    .from(noteNotes)
    .leftJoin(noteFolders, eq(noteFolders.id, noteNotes.folderId))
    .where(and(eq(noteNotes.ownerId, ownerId), inArray(noteNotes.id, ids)))
  return rows.map(joinedCard)
}

async function address(path: string | null | undefined) {
  if (!path) return null
  try {
    return await getPublicMediaUrl(path)
  } catch {
    // No bucket set up here; the picture is simply left out.
    return null
  }
}

async function pictureViews(pictures: PostPicture[] | null | undefined): Promise<PictureView[]> {
  const views = await Promise.all(
    (pictures ?? []).map(async (picture) => {
      const url = await address(picture.path)
      return url ? { url, width: picture.width, height: picture.height } : null
    })
  )
  return views.filter((view): view is PictureView => view !== null)
}

export async function toDetail(row: NoteRow, folderName: string | null): Promise<NoteDetail> {
  const facts = noteBodyFacts(row.body)
  const [media, linkedFrom, linked, merged] = await Promise.all([
    row.videoMediaId
      ? db
          .select({ storagePath: customShellMedia.storagePath })
          .from(customShellMedia)
          .where(eq(customShellMedia.id, row.videoMediaId))
      : [],
    db
      .select({ id: noteNotes.id, title: noteNotes.title })
      .from(noteLinks)
      .innerJoin(noteNotes, eq(noteNotes.id, noteLinks.fromNoteId))
      .where(and(eq(noteLinks.toNoteId, row.id), eq(noteNotes.ownerId, row.ownerId), isNull(noteNotes.deletedAt)))
      .orderBy(asc(noteNotes.title)),
    facts.linkedIds.length
      ? db
          .select({ id: noteNotes.id, title: noteNotes.title, deletedAt: noteNotes.deletedAt })
          .from(noteNotes)
          .where(and(eq(noteNotes.ownerId, row.ownerId), inArray(noteNotes.id, facts.linkedIds)))
      : [],
    row.mergedFrom?.length
      ? db
          .select({ id: noteNotes.id, title: noteNotes.title })
          .from(noteNotes)
          .where(and(eq(noteNotes.ownerId, row.ownerId), inArray(noteNotes.id, row.mergedFrom)))
      : [],
  ])

  const linkTitles: NoteDetail["linkTitles"] = {}
  for (const linkedId of facts.linkedIds) {
    const found = linked.find((each) => each.id === linkedId)
    const state: LinkedNoteState = !found ? "gone" : found.deletedAt ? "trash" : "ok"
    linkTitles[linkedId] = { title: found?.title ?? "", state }
  }
  const order = new Map((row.mergedFrom ?? []).map((id, index) => [id, index]))

  return {
    ...toCard(row, folderName),
    body: row.body,
    revision: row.revision,
    words: row.words,
    linkedFrom,
    linkTitles,
    importError: row.importError,
    analyseError: row.analyseError,
    authorHandle: row.authorHandle,
    authorPictureUrl: await address(row.authorPicturePath),
    postedAt: row.postedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    mediaKind: row.mediaKind,
    playbackUrl: media[0] ? await address(media[0].storagePath) : null,
    coverUrl: await address(row.coverPath),
    hasFile: row.videoMediaId !== null,
    postText: row.postText,
    pictures: await pictureViews(row.pictures),
    quoted: row.quoted ? { ...row.quoted, pictures: await pictureViews(row.quoted.pictures) } : null,
    thread: await Promise.all(
      (row.thread ?? []).map(async (post) => ({ ...post, pictures: await pictureViews(post.pictures) }))
    ),
    threadStatus: row.threadStatus,
    likesWhenSaved: row.likesWhenSaved,
    repostsWhenSaved: row.repostsWhenSaved,
    videoError: row.videoError,
    highlights: row.highlights ?? [],
    transcript: row.transcript ?? [],
    summary: row.summary ?? [],
    actionPlan: row.actionPlan ?? [],
    quotes: row.quotes ?? [],
    analysedAt: row.analysedAt?.toISOString() ?? null,
    mergedFrom: merged.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)),
  }
}

/** One note of this person's, with its folder's name, or "Note not found". */
export async function detailFor(ownerId: string, id: string): Promise<NoteDetail> {
  const [row] = await db
    .select(withFolderName)
    .from(noteNotes)
    .leftJoin(noteFolders, eq(noteFolders.id, noteNotes.folderId))
    .where(and(eq(noteNotes.id, id), eq(noteNotes.ownerId, ownerId)))
  if (!row) throw new Error(LIBRARY_SAYS.noteNotFound)
  return toDetail(row.note, row.folderName)
}
