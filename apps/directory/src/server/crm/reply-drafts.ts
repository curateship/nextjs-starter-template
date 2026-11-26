import { and, eq, lt } from "drizzle-orm"

import { CRM_MAX_BODY_LENGTH } from "@/lib/crm/crm"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellCrmReplyDrafts, customShellCrmThreads } from "@/server/schema"

/** How long a draft nobody touches is kept. */
export const CRM_REPLY_DRAFT_DAYS = 30

/**
 * Half-written CRM replies, kept so a reload or a closed tab loses nothing
 * (CRM task 38, part 5). Each admin's own: another admin opening the same
 * conversation sees an empty box, not somebody else's words.
 */

/** This admin's drafts on this site, by conversation. */
export async function listReplyDrafts(
  workspaceId: string,
  userId: string,
  database: CustomShellDb = db
): Promise<Record<string, string>> {
  const rows = await database
    .select({ threadId: customShellCrmReplyDrafts.threadId, body: customShellCrmReplyDrafts.body })
    .from(customShellCrmReplyDrafts)
    .where(and(eq(customShellCrmReplyDrafts.workspaceId, workspaceId), eq(customShellCrmReplyDrafts.userId, userId)))
  return Object.fromEntries(rows.map((row) => [row.threadId, row.body]))
}

/**
 * Keeps what is in one conversation's box, or forgets it when the box is
 * empty. Answers false when the conversation is not this site's, so an id
 * from somewhere else writes nothing.
 */
export async function saveReplyDraft(
  workspaceId: string,
  userId: string,
  threadId: string,
  body: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [thread] = await database
    .select({ id: customShellCrmThreads.id })
    .from(customShellCrmThreads)
    .where(and(eq(customShellCrmThreads.workspaceId, workspaceId), eq(customShellCrmThreads.id, threadId)))
    .limit(1)
  if (!thread) return false

  // Spaces alone are not a draft, the same line the screen draws.
  if (!body.trim()) {
    await clearReplyDraft(workspaceId, userId, threadId, database)
    return true
  }

  const words = body.slice(0, CRM_MAX_BODY_LENGTH)
  const at = now()
  await database
    .insert(customShellCrmReplyDrafts)
    .values({ workspaceId, threadId, userId, body: words, updatedAt: at })
    .onConflictDoUpdate({
      target: [customShellCrmReplyDrafts.threadId, customShellCrmReplyDrafts.userId],
      set: { body: words, updatedAt: at },
    })
  return true
}

/** Forgets one admin's draft in one conversation, as a sent reply does. */
export async function clearReplyDraft(
  workspaceId: string,
  userId: string,
  threadId: string,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .delete(customShellCrmReplyDrafts)
    .where(
      and(
        eq(customShellCrmReplyDrafts.workspaceId, workspaceId),
        eq(customShellCrmReplyDrafts.userId, userId),
        eq(customShellCrmReplyDrafts.threadId, threadId)
      )
    )
}

/** The background pass's part: drafts nobody has touched for 30 days go. */
export async function removeOldReplyDrafts(database: CustomShellDb = db): Promise<number> {
  const cutoff = new Date(now().getTime() - CRM_REPLY_DRAFT_DAYS * 86_400_000)
  const removed = await database
    .delete(customShellCrmReplyDrafts)
    .where(lt(customShellCrmReplyDrafts.updatedAt, cutoff))
    .returning({ threadId: customShellCrmReplyDrafts.threadId })
  return removed.length
}
