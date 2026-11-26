import { and, eq, inArray } from "drizzle-orm"

import { CRM_REPLY_FILES_MAX, CRM_REPLY_UPLOAD_MAX_BYTES, type CrmAttachment } from "@/lib/crm/crm"
import { db, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { uuid } from "@/server/auth/security"
import { getFromR2, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"

/**
 * Files attached to a CRM reply: picked from the site's media library (CRM
 * task 22, built in task 36 on 7 Nov 2026), or uploaded from the computer in
 * the reply box (CRM task 38, part 3), because the library holds pictures,
 * video and sound and a quote is usually a PDF.
 *
 * **The total is capped at 10 MB.** Resend takes files as base64 inside the
 * request, which grows them by a third, and refuses a request past 40 MB;
 * 10 MB leaves room for the words and the quote and is stated beside the
 * button.
 */

export const CRM_REPLY_FILE_NOT_FOUND = "CRM_REPLY_FILE_NOT_FOUND"
export const CRM_REPLY_FILES_TOO_BIG = "CRM_REPLY_FILES_TOO_BIG"
export const CRM_REPLY_UPLOAD_EMPTY = "CRM_REPLY_UPLOAD_EMPTY"

export type ReplyFile = {
  attachment: CrmAttachment
  send: { filename: string; content: string; contentType: string }
}

/** A file uploaded from the computer for a reply: where it was stored, and the name it goes under. */
export type ReplyUpload = { key: string; name: string }

/**
 * Where a site's uploaded reply files are kept (CRM task 38, part 3): beside
 * the files people send in, under `crm-files/<site>/`, never in the media
 * library. A key is only read back for a reply on the site it starts with.
 */
export function replyUploadPrefix(workspaceId: string) {
  return `crm-files/${workspaceId}/replies/`
}

/** A file name safe to keep in a storage key and a mail header: no folders, no control characters. */
export function safeUploadName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? ""
  const clean = base.replace(/[\p{Cc}"<>|?*:]/gu, "").trim().slice(0, 120)
  // "." and ".." name a folder, not a file.
  return clean.replace(/^\.+$/, "") || "file"
}

/**
 * Keeps a file uploaded from the computer for a reply, and answers where it
 * is. Up to the reply's own 10 MB; the total across a reply's files is
 * checked again when it is sent.
 */
export async function storeReplyUpload(
  workspaceId: string,
  file: { name: string; type: string; data: Uint8Array }
): Promise<{ key: string; name: string; size: number }> {
  if (file.data.byteLength === 0) throw new Error(CRM_REPLY_UPLOAD_EMPTY)
  if (file.data.byteLength > CRM_REPLY_UPLOAD_MAX_BYTES) throw new Error(CRM_REPLY_FILES_TOO_BIG)
  const name = safeUploadName(file.name)
  const key = `${replyUploadPrefix(workspaceId)}${uuid()}/${name}`
  await uploadToR2(key, file.data, file.type || "application/octet-stream")
  return { key, name, size: file.data.byteLength }
}

/**
 * Reads the picked files: the media library's by the address the picker
 * gave, and the uploaded ones by their key, as this site's own files only. A
 * file from another site, or one gone since, refuses the whole reply rather
 * than sending part of what was meant. The 10 MB is the total of both.
 */
export async function loadReplyFiles(
  workspaceId: string,
  urls: string[],
  database: CustomShellDb = db,
  uploads: ReplyUpload[] = []
): Promise<ReplyFile[]> {
  const uploaded = await loadUploads(workspaceId, uploads)
  const fromLibrary = await loadLibraryFiles(workspaceId, urls, database)
  const total = [...uploaded, ...fromLibrary].reduce((sum, file) => sum + (file.attachment.size ?? 0), 0)
  if (total > CRM_REPLY_UPLOAD_MAX_BYTES) throw new Error(CRM_REPLY_FILES_TOO_BIG)
  return [...fromLibrary, ...uploaded]
}

/**
 * The uploaded files, each checked to be under this site's own folder before
 * it is read, so a key from another site, or one walking out of the folder,
 * refuses the reply.
 */
async function loadUploads(workspaceId: string, uploads: ReplyUpload[]): Promise<ReplyFile[]> {
  const prefix = replyUploadPrefix(workspaceId)
  const unique = [...new Map(uploads.map((upload) => [upload.key, upload])).values()].slice(0, CRM_REPLY_FILES_MAX)
  return Promise.all(
    unique.map(async (upload) => {
      // A ".." folder in the key would walk out of this site's folder; dots
      // inside a file's own name ("quote..v2.pdf") are fine.
      const walksOut = upload.key.split("/").some((part) => part === "." || part === "..")
      if (!upload.key.startsWith(prefix) || walksOut) throw new Error(CRM_REPLY_FILE_NOT_FOUND)
      const object = await getFromR2(upload.key).catch(() => null)
      const bytes = object?.Body ? await object.Body.transformToByteArray() : null
      if (!bytes) throw new Error(CRM_REPLY_FILE_NOT_FOUND)
      if (bytes.byteLength > CRM_REPLY_UPLOAD_MAX_BYTES) throw new Error(CRM_REPLY_FILES_TOO_BIG)
      const filename = safeUploadName(upload.name)
      const contentType = object?.ContentType || "application/octet-stream"
      return {
        attachment: { id: uuid(), filename, contentType, size: bytes.byteLength, storageKey: upload.key },
        send: { filename, content: Buffer.from(bytes).toString("base64"), contentType },
      }
    })
  )
}

async function loadLibraryFiles(
  workspaceId: string,
  urls: string[],
  database: CustomShellDb
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

  // Refused before any download when the library's own sizes are already too
  // much; the total with any uploads is checked again by the caller.
  const total = rows.reduce((sum, row) => sum + row.fileSize, 0)
  if (total > CRM_REPLY_UPLOAD_MAX_BYTES) throw new Error(CRM_REPLY_FILES_TOO_BIG)

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
