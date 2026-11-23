import { and, eq, inArray } from "drizzle-orm"

import type { CrmAttachment } from "@/lib/crm/crm"
import { db, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { getFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"

/**
 * Files attached to a CRM reply (CRM task 22, built in task 36 on 7 Nov
 * 2026), picked from the site's media library rather than uploaded in the
 * reply box, so the app keeps one upload path and one place storage is
 * counted.
 *
 * **The total is capped at 10 MB.** Resend takes files as base64 inside the
 * request, which grows them by a third, and refuses a request past 40 MB;
 * 10 MB leaves room for the words and the quote and is stated beside the
 * button.
 */
export const CRM_REPLY_FILES_MAX_BYTES = 10 * 1024 * 1024
export const CRM_REPLY_FILES_MAX = 10

export const CRM_REPLY_FILE_NOT_FOUND = "CRM_REPLY_FILE_NOT_FOUND"
export const CRM_REPLY_FILES_TOO_BIG = "CRM_REPLY_FILES_TOO_BIG"

export type ReplyFile = {
  attachment: CrmAttachment
  send: { filename: string; content: string; contentType: string }
}

/**
 * Reads the picked files, by the address the picker gave, as this site's own
 * files only. A file from another site, or one gone since, refuses the whole
 * reply rather than sending part of what was meant.
 */
export async function loadReplyFiles(
  workspaceId: string,
  urls: string[],
  database: CustomShellDb = db
): Promise<ReplyFile[]> {
  const unique = [...new Set(urls)].slice(0, CRM_REPLY_FILES_MAX)
  if (unique.length === 0) return []

  const paths = (await Promise.all(unique.map((url) => storagePathForUrl(url)))).filter(
    (path): path is string => Boolean(path)
  )
  if (paths.length !== unique.length) throw new Error(CRM_REPLY_FILE_NOT_FOUND)

  const rows = await database
    .select({
      id: customShellMedia.id,
      originalName: customShellMedia.originalName,
      mimeType: customShellMedia.mimeType,
      fileSize: customShellMedia.fileSize,
      storagePath: customShellMedia.storagePath,
    })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.workspaceId, workspaceId), inArray(customShellMedia.storagePath, paths)))
  if (rows.length !== paths.length) throw new Error(CRM_REPLY_FILE_NOT_FOUND)

  const total = rows.reduce((sum, row) => sum + row.fileSize, 0)
  if (total > CRM_REPLY_FILES_MAX_BYTES) throw new Error(CRM_REPLY_FILES_TOO_BIG)

  return Promise.all(
    rows.map(async (row) => {
      const object = await getFromR2(row.storagePath)
      const bytes = object.Body ? await object.Body.transformToByteArray() : null
      if (!bytes) throw new Error(CRM_REPLY_FILE_NOT_FOUND)
      return {
        attachment: {
          id: row.id,
          filename: row.originalName,
          contentType: row.mimeType,
          size: bytes.byteLength,
          // The library's own copy, which the guarded file route serves.
          storageKey: row.storagePath,
        },
        send: {
          filename: row.originalName,
          content: Buffer.from(bytes).toString("base64"),
          contentType: row.mimeType,
        },
      }
    })
  )
}
