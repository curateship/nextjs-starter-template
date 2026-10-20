import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { allPictures } from "@/server/note/library/cards"
import type { NoteRow } from "@/server/note/schema"

/**
 * Everything an imported note stored outside its row: the saved video and its
 * library row, the cover, the author's picture, and an X post's pictures. A
 * step that fails throws, so the caller stops before deleting the row and
 * pressing Delete again finishes the job. The original stays on its site.
 *
 * A file a sent newsletter carries is kept, the shell's own rule for its
 * library: an inbox copy can outlive every record of the email.
 */
export async function removeNoteFiles(
  row: Pick<NoteRow, "ownerId" | "videoMediaId" | "coverPath" | "authorPicturePath" | "pictures" | "quoted" | "thread">
): Promise<void> {
  const [media] = row.videoMediaId
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
    (path): path is string => Boolean(path)
  )
  for (const path of new Set(paths)) await deleteFromR2(path)
  if (removeFile) await db.delete(customShellMedia).where(eq(customShellMedia.id, media.id))
}
