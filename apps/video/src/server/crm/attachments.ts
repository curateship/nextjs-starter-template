import { and, asc, eq, isNull, lt, sql } from "drizzle-orm"

import type { CrmAttachment } from "@/lib/crm/crm"
import { now, uuid } from "@/server/auth/security"
import { MAX_BODY_ATTEMPTS } from "@/server/crm/inbound"
import { db, type CustomShellDb } from "@/server/db"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey } from "@/server/email/settings"
import { R2StorageNotConfiguredError, uploadToR2 } from "@/server/media/storage"
import { customShellCrmMessages } from "@/server/schema"

/**
 * Fetching the files somebody sent into the site's storage (CRM task 21,
 * built in task 36 on 7 Nov 2026), so the conversation can open them. The
 * same shape as the words' second request in `inbound.ts`: the mail is
 * written first, the files are fetched after, from the background pass, and
 * after `MAX_BODY_ATTEMPTS` tries it stops asking and the file says so.
 *
 * **These are a stranger's files.** They are kept under the CRM's own path,
 * never put in the media library as if an admin had uploaded them, and only
 * ever served by the guarded route in `src/routes/api/v1/crm/files/`. Nothing
 * scans them.
 *
 * With no storage set up, nothing is fetched and no try is counted: the
 * conversation shows the names alone, as it did before, and says why.
 */

/** The largest one file may be. Bigger is named and never fetched. */
export const CRM_FILE_MAX_BYTES = 25 * 1024 * 1024

/** A name that is safe as the end of a storage key: no slashes, no control characters. */
export function safeFileName(name: string) {
  // Every character below a space, the delete character, and both slashes.
  const cleaned = [...name]
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127 && character !== "/" && character !== "\\"
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
  return cleaned || "file"
}

export type FetchFilesOutcome = "fetched" | "nothing" | "failed" | "no-storage"

/**
 * Fetches one inbound message's files. One try is counted before asking, so
 * a pass that dies part-way still counts it.
 */
export async function fetchMessageFiles(
  workspaceId: string,
  messageId: string,
  database: CustomShellDb = db
): Promise<FetchFilesOutcome> {
  const [message] = await database
    .select({
      id: customShellCrmMessages.id,
      providerEmailId: customShellCrmMessages.providerEmailId,
      attachments: customShellCrmMessages.attachments,
      filesFetchedAt: customShellCrmMessages.filesFetchedAt,
      fileAttempts: customShellCrmMessages.fileAttempts,
    })
    .from(customShellCrmMessages)
    .where(and(eq(customShellCrmMessages.workspaceId, workspaceId), eq(customShellCrmMessages.id, messageId)))
    .limit(1)
  if (!message || message.filesFetchedAt) return "nothing"

  const done = async (attachments: CrmAttachment[]) => {
    await database
      .update(customShellCrmMessages)
      .set({ attachments, filesFetchedAt: now() })
      .where(eq(customShellCrmMessages.id, message.id))
  }

  const wanted = message.attachments.filter((file) => !file.storageKey && !file.tooBig)
  if (wanted.length === 0 || !message.providerEmailId) {
    await done(message.attachments)
    return "nothing"
  }

  await database
    .update(customShellCrmMessages)
    .set({ fileAttempts: sql`${customShellCrmMessages.fileAttempts} + 1` })
    .where(eq(customShellCrmMessages.id, message.id))

  const apiKey = await getAppEmailApiKey(database, workspaceId)
  const provider = getEmailProvider(apiKey ?? "")
  if (!provider.receiveFiles) return "failed"
  const listed = await provider.receiveFiles(message.providerEmailId)
  if (!listed.success) return "failed"

  const updated: CrmAttachment[] = []
  let missing = false
  for (const file of message.attachments) {
    if (file.storageKey || file.tooBig) {
      updated.push(file)
      continue
    }
    const match =
      listed.files.find((item) => file.id && item.id === file.id) ??
      listed.files.find((item) => item.filename === file.filename)
    if (!match) {
      missing = true
      updated.push(file)
      continue
    }
    if (match.size !== null && match.size > CRM_FILE_MAX_BYTES) {
      updated.push({ ...file, size: match.size, tooBig: true })
      continue
    }
    let bytes: Uint8Array
    try {
      const response = await fetch(match.downloadUrl, { signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error("download refused")
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch {
      missing = true
      updated.push(file)
      continue
    }
    if (bytes.byteLength > CRM_FILE_MAX_BYTES) {
      updated.push({ ...file, size: bytes.byteLength, tooBig: true })
      continue
    }
    const storageKey = `crm-files/${workspaceId}/${message.id}/${uuid()}-${safeFileName(file.filename)}`
    try {
      await uploadToR2(storageKey, bytes, match.contentType || file.contentType || "application/octet-stream")
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        // No storage: not a failed try, and nothing changes on screen.
        await database
          .update(customShellCrmMessages)
          .set({ fileAttempts: message.fileAttempts })
          .where(eq(customShellCrmMessages.id, message.id))
        return "no-storage"
      }
      missing = true
      updated.push(file)
      continue
    }
    updated.push({ ...file, size: bytes.byteLength, storageKey })
  }

  // Every file stored or named too big is done. One still missing is tried
  // again next pass, until the tries run out.
  if (!missing || message.fileAttempts + 1 >= MAX_BODY_ATTEMPTS) {
    await done(updated)
  } else {
    await database
      .update(customShellCrmMessages)
      .set({ attachments: updated })
      .where(eq(customShellCrmMessages.id, message.id))
  }
  return missing ? "failed" : "fetched"
}

/** Inbound messages whose files are still to fetch, oldest first. */
export async function pendingFileMessages(limit: number, database: CustomShellDb = db) {
  return database
    .select({ id: customShellCrmMessages.id, workspaceId: customShellCrmMessages.workspaceId })
    .from(customShellCrmMessages)
    .where(
      and(
        isNull(customShellCrmMessages.filesFetchedAt),
        eq(customShellCrmMessages.direction, "in"),
        lt(customShellCrmMessages.fileAttempts, MAX_BODY_ATTEMPTS),
        sql`jsonb_array_length(${customShellCrmMessages.attachments}) > 0`
      )
    )
    .orderBy(asc(customShellCrmMessages.createdAt))
    .limit(limit)
}

/** The background pass's file job: up to ten messages a pass. */
export async function fillPendingFiles(database: CustomShellDb = db): Promise<number> {
  let fetched = 0
  for (const message of await pendingFileMessages(10, database)) {
    const outcome = await fetchMessageFiles(message.workspaceId, message.id, database)
    if (outcome === "no-storage") break
    if (outcome === "fetched") fetched += 1
  }
  return fetched
}
