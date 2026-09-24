import { deleteFromR2 } from "@/server/media/storage"

/**
 * Removing exports' files from storage: the video and its cover.
 *
 * Shared by deleting an export and deleting the project it came from, since
 * both take the export's row away and a file with no row is space nobody can
 * ever find again. The caller removes the files first and keeps any row whose
 * files would not go, so a failed removal leaves a row that can be deleted
 * again rather than a file that cannot.
 */

// Enough to clear a few hundred exports in seconds without opening hundreds of
// connections to the bucket at once.
const REMOVALS_AT_ONCE = 8

type ExportFiles = {
  id: string
  storagePath: string | null
  thumbnailStoragePath: string | null
}

/** The ids of the exports whose files are all gone now. */
export async function removeExportFiles(rows: ExportFiles[]) {
  const removed = new Set<string>()
  let next = 0

  async function worker() {
    while (next < rows.length) {
      const row = rows[next++]
      const paths = [row.storagePath, row.thumbnailStoragePath].filter(
        (path): path is string => !!path
      )
      try {
        // Removing a file that is already gone succeeds, so a second try after
        // a half-finished one goes through.
        for (const path of paths) await deleteFromR2(path)
        removed.add(row.id)
      } catch (error) {
        console.error("Export file removal failed", row.id, error)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(REMOVALS_AT_ONCE, rows.length) }, worker)
  )
  return removed
}
