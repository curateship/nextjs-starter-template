import { and, eq, ne } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { allPictures } from "@/server/note/library/cards"
import { noteNotes, type NoteRow } from "@/server/note/schema"

/**
 * Everything an imported note stored outside its row: the saved video and its
 * library row, the cover, the author's picture, and an X post's pictures. A
 * step that fails throws, so the caller stops before deleting the row and
 * pressing Delete again finishes the job. The original stays on its site.
 *
 * A file a sent newsletter carries is kept, the shell's own rule for its
 * library: an inbox copy can outlive every record of the email. So is a file
 * a duplicate of this note still uses.
 */
type FileHolder = Pick<
  NoteRow,
  "id" | "ownerId" | "sourceUrl" | "videoMediaId" | "coverPath" | "authorPicturePath" | "pictures" | "quoted" | "thread"
>

/**
 * The files of `row` another note still uses. A duplicate (Duplicate in the
 * note's menu) shares its original's video and pictures rather than storing
 * them twice, and keeps the same link, so the notes that could share a file
 * are this person's others with the same link.
 */
async function filesStillUsed(row: FileHolder) {
  const others = row.sourceUrl
    ? await db
        .select({
          videoMediaId: noteNotes.videoMediaId,
          coverPath: noteNotes.coverPath,
          authorPicturePath: noteNotes.authorPicturePath,
          pictures: noteNotes.pictures,
          quoted: noteNotes.quoted,
          thread: noteNotes.thread,
        })
        .from(noteNotes)
        .where(and(eq(noteNotes.ownerId, row.ownerId), eq(noteNotes.sourceUrl, row.sourceUrl), ne(noteNotes.id, row.id)))
    : []
  return {
    media: new Set(others.map((other) => other.videoMediaId).filter(Boolean)),
    paths: new Set(
      others.flatMap((other) => [...allPictures(other).map((picture) => picture.path), other.coverPath, other.authorPicturePath])
    ),
  }
}

export async function removeNoteFiles(row: FileHolder): Promise<void> {
  const used = await filesStillUsed(row)
  const [media] = row.videoMediaId && !used.media.has(row.videoMediaId)
    ? await db
        .select({
          id: customShellMedia.id,
          storagePath: customShellMedia.storagePath,
          emailProtectedAt: customShellMedia.emailProtectedAt,
        })
        .from(customShellMedia)
        .where(and(eq(customShellMedia.id, row.videoMediaId), eq(customShellMedia.userId, row.ownerId)))
    : []
  const removeFile = media !== undefined && media.emailProtectedAt === null
  if (removeFile) await deleteFromR2(media.storagePath)
  const paths = [...allPictures(row).map((picture) => picture.path), row.coverPath, row.authorPicturePath].filter(
    (path): path is string => Boolean(path) && !used.paths.has(path)
  )
  for (const path of new Set(paths)) await deleteFromR2(path)
  if (removeFile) await db.delete(customShellMedia).where(eq(customShellMedia.id, media.id))
}

/**
 * The saved video or sound of one of this person's notes, for Download video
 * (Tyler's task 02, part 6), with the note's title as the file's name and the
 * stored file's own ending. Null when the note is not theirs or has no file.
 */
export async function noteVideoFile(ownerId: string, noteId: string) {
  const [row] = await db
    .select({ title: noteNotes.title, storagePath: customShellMedia.storagePath, mimeType: customShellMedia.mimeType })
    .from(noteNotes)
    .innerJoin(customShellMedia, eq(customShellMedia.id, noteNotes.videoMediaId))
    .where(and(eq(noteNotes.id, noteId), eq(noteNotes.ownerId, ownerId)))
  if (!row) return null
  const ending = /\.([a-z0-9]{2,5})$/i.exec(row.storagePath)?.[1]?.toLowerCase() ?? "mp4"
  const name = row.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim()
  return { storagePath: row.storagePath, mimeType: row.mimeType, fileName: `${(name || "Video").slice(0, 120)}.${ending}` }
}
