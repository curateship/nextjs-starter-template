import { and, asc, eq, lt, sql } from "drizzle-orm"

import { CRM_MAX_BODY_LENGTH } from "@/lib/crm/crm"
import { crmScheduledReplyFailedText } from "@/lib/notification-types"
import { now, uuid } from "@/server/auth/security"
import { clearReplyDraft } from "@/server/crm/reply-drafts"
import { sendCrmReply } from "@/server/crm/reply"
import type { ReplyUpload } from "@/server/crm/reply-files"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import {
  customShellCrmLeads,
  customShellCrmScheduledReplies,
  customShellCrmThreads,
  customShellNotifications,
  customShellWorkspaces,
} from "@/server/schema"

/**
 * Replies written now and sent later (CRM task 38, part 6; Tyler picked
 * "Send a reply later" on 25 Nov 2026).
 *
 * The browser works out the moment ("Tomorrow 9 AM" in the person's own
 * clock) and sends it as an exact time, so there is no site time zone to
 * guess. The background pass sends each one at its time through
 * `sendCrmReply`, the same path as a reply sent now: the same From line,
 * signature, quote and threading.
 */

/** How many the pass sends at most each time round. */
const SEND_BATCH = 20
/** How long a claimed reply may say "sending" before it is taken to have stopped. */
const STUCK_AFTER_MS = 10 * 60_000
const STUCK_SENDING =
  "It was being sent when the server stopped, so it may or may not have gone. Check the conversation before giving it a new time."

/** The latest a reply may be put off to. */
const MAX_AHEAD_MS = 366 * 86_400_000

export const CRM_SCHEDULE_BAD_TIME = "CRM_SCHEDULE_BAD_TIME"
export const CRM_SCHEDULED_NOT_FOUND = "CRM_SCHEDULED_NOT_FOUND"

export type ScheduledReplyFiles = { urls: string[]; uploads: ReplyUpload[] }

export type ScheduledReplyRow = {
  id: string
  body: string
  files: ScheduledReplyFiles
  sendAt: Date
  state: "waiting" | "sending" | "failed"
  error: string | null
  createdAt: Date
}

/** A time a reply can be put off to: later than now, and within a year. */
function checkTime(sendAt: Date) {
  const at = now().getTime()
  const when = sendAt.getTime()
  if (!Number.isFinite(when) || when <= at || when > at + MAX_AHEAD_MS) throw new Error(CRM_SCHEDULE_BAD_TIME)
}

async function threadHere(workspaceId: string, threadId: string, database: CustomShellDb) {
  const [thread] = await database
    .select({ id: customShellCrmThreads.id })
    .from(customShellCrmThreads)
    .where(and(eq(customShellCrmThreads.workspaceId, workspaceId), eq(customShellCrmThreads.id, threadId)))
    .limit(1)
  return Boolean(thread)
}

/**
 * Puts a reply off until `sendAt`. The box it came from is emptied, so this
 * admin's kept draft for the conversation goes; the words are in the
 * scheduled reply now, and Cancel hands them back.
 */
export async function scheduleReply(
  workspaceId: string,
  userId: string,
  threadId: string,
  input: { body: string; files: ScheduledReplyFiles; sendAt: Date },
  database: CustomShellDb = db
): Promise<string> {
  checkTime(input.sendAt)
  const body = input.body.trim().slice(0, CRM_MAX_BODY_LENGTH)
  if (!body) throw new Error(CRM_SCHEDULE_BAD_TIME)
  if (!(await threadHere(workspaceId, threadId, database))) throw new Error("CRM_THREAD_NOT_FOUND")

  const id = uuid()
  const at = now()
  await database.insert(customShellCrmScheduledReplies).values({
    id,
    workspaceId,
    threadId,
    scheduledByUserId: userId,
    body,
    files: input.files,
    sendAt: input.sendAt,
    state: "waiting",
    createdAt: at,
    updatedAt: at,
  })
  await clearReplyDraft(workspaceId, userId, threadId, database)
  return id
}

/** One conversation's replies waiting to go, or that could not, soonest first. */
export async function listScheduledReplies(
  workspaceId: string,
  threadId: string,
  database: CustomShellDb = db
): Promise<ScheduledReplyRow[]> {
  return database
    .select({
      id: customShellCrmScheduledReplies.id,
      body: customShellCrmScheduledReplies.body,
      files: customShellCrmScheduledReplies.files,
      sendAt: customShellCrmScheduledReplies.sendAt,
      state: customShellCrmScheduledReplies.state,
      error: customShellCrmScheduledReplies.error,
      createdAt: customShellCrmScheduledReplies.createdAt,
    })
    .from(customShellCrmScheduledReplies)
    .where(
      and(
        eq(customShellCrmScheduledReplies.workspaceId, workspaceId),
        eq(customShellCrmScheduledReplies.threadId, threadId)
      )
    )
    .orderBy(asc(customShellCrmScheduledReplies.sendAt))
}

/**
 * Moves a scheduled reply to another time, and nothing else. A failed one
 * given a new time waits again. One already being sent cannot be moved.
 */
export async function changeScheduledReply(
  workspaceId: string,
  id: string,
  sendAt: Date,
  database: CustomShellDb = db
): Promise<void> {
  checkTime(sendAt)
  const changed = await database
    .update(customShellCrmScheduledReplies)
    .set({ sendAt, state: "waiting", error: null, updatedAt: now() })
    .where(
      and(
        eq(customShellCrmScheduledReplies.workspaceId, workspaceId),
        eq(customShellCrmScheduledReplies.id, id),
        sql`${customShellCrmScheduledReplies.state} <> 'sending'`
      )
    )
    .returning({ id: customShellCrmScheduledReplies.id })
  if (changed.length === 0) throw new Error(CRM_SCHEDULED_NOT_FOUND)
}

/**
 * Cancels a scheduled reply, and hands back its words and files for the box.
 * One already being sent cannot be cancelled.
 */
export async function cancelScheduledReply(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<{ threadId: string; body: string; files: ScheduledReplyFiles }> {
  const [removed] = await database
    .delete(customShellCrmScheduledReplies)
    .where(
      and(
        eq(customShellCrmScheduledReplies.workspaceId, workspaceId),
        eq(customShellCrmScheduledReplies.id, id),
        sql`${customShellCrmScheduledReplies.state} <> 'sending'`
      )
    )
    .returning({
      threadId: customShellCrmScheduledReplies.threadId,
      body: customShellCrmScheduledReplies.body,
      files: customShellCrmScheduledReplies.files,
    })
  if (!removed) throw new Error(CRM_SCHEDULED_NOT_FOUND)
  return removed
}

/**
 * The background pass's part: sends every waiting reply whose time has come.
 *
 * Each is claimed in the same statement that finds it, so two passes running
 * at once never both send one. Mail from a sender blocked since it was
 * written is not sent: blocking closes the conversation, and a closed one is
 * refused with the reason. One that could not go stays, failed, with the
 * reason, and the person who scheduled it hears in the bell.
 *
 * Answers how many went.
 */
export async function sendDueScheduledReplies(database: CustomShellDb = db): Promise<number> {
  const timestamp = now()

  // A reply claimed by a pass that never came back (the server stopped mid
  // send) would read "Sending…" for ever. It may or may not have gone, so it
  // is never sent again on its own: it is marked failed, and the person
  // checks the conversation before giving it a new time.
  await database
    .update(customShellCrmScheduledReplies)
    .set({ state: "failed", error: STUCK_SENDING, updatedAt: timestamp })
    .where(
      and(
        eq(customShellCrmScheduledReplies.state, "sending"),
        lt(customShellCrmScheduledReplies.updatedAt, new Date(timestamp.getTime() - STUCK_AFTER_MS))
      )
    )
  const claimed = await database
    .update(customShellCrmScheduledReplies)
    .set({ state: "sending", updatedAt: timestamp })
    .where(
      sql`${customShellCrmScheduledReplies.id} in (
        select ${customShellCrmScheduledReplies.id} from ${customShellCrmScheduledReplies}
        where ${customShellCrmScheduledReplies.state} = 'waiting'
          and ${customShellCrmScheduledReplies.sendAt} <= ${timestamp}
        order by ${customShellCrmScheduledReplies.sendAt}
        limit ${SEND_BATCH}
        for update skip locked
      )`
    )
    .returning()

  let sent = 0
  for (const reply of claimed) {
    const refusal = await sendOne(reply, database).catch((error: unknown) =>
      reasonInWords(error instanceof Error ? error.message : "")
    )
    if (refusal === null) {
      await database.delete(customShellCrmScheduledReplies).where(eq(customShellCrmScheduledReplies.id, reply.id))
      sent += 1
      continue
    }
    await database
      .update(customShellCrmScheduledReplies)
      .set({ state: "failed", error: refusal, updatedAt: now() })
      .where(eq(customShellCrmScheduledReplies.id, reply.id))
    await tellItFailed(reply, refusal, database).catch((error) =>
      console.error("CRM scheduled reply notice failed", error)
    )
  }
  return sent
}

/**
 * What a refusal from `sendCrmReply` means, in the words the conversation and
 * the bell show. The provider's own reason is already words, and is kept.
 */
const REFUSALS: Record<string, string> = {
  CRM_THREAD_NOT_FOUND: "The conversation is no longer here.",
  CRM_NO_INBOUND_ADDRESS: "No address is set for mail to arrive at, in Settings → Email.",
  CRM_REPLY_FILE_NOT_FOUND: "One of its files is no longer there.",
  CRM_REPLY_FILES_TOO_BIG: "Its files come to more than 10 MB.",
}

function reasonInWords(message: string) {
  const code = Object.keys(REFUSALS).find((key) => message.includes(key))
  return code ? REFUSALS[code] : message.trim() || "The email was not accepted."
}

/** Sends one claimed reply; answers null when it went, or the reason it did not. */
async function sendOne(
  reply: typeof customShellCrmScheduledReplies.$inferSelect,
  database: CustomShellDb
): Promise<string | null> {
  const [thread] = await database
    .select({ status: customShellCrmThreads.status })
    .from(customShellCrmThreads)
    .where(eq(customShellCrmThreads.id, reply.threadId))
    .limit(1)
  if (!thread) return "The conversation is no longer here."
  // Only a blocked sender's conversation is closed (`inbox-and-leads.md`).
  if (thread.status === "closed") return "Mail from this address is blocked, so the reply was not sent."

  const result = await sendCrmReply(
    reply.workspaceId,
    reply.threadId,
    reply.body,
    database,
    reply.files.urls,
    reply.files.uploads
  )
  return result.sent ? null : result.error
}

/** A notice in the bell of whoever scheduled it, or the site's owner, opening the conversation. */
async function tellItFailed(
  reply: typeof customShellCrmScheduledReplies.$inferSelect,
  reason: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select({
      ownerId: customShellWorkspaces.userId,
      email: customShellCrmLeads.email,
      name: customShellCrmLeads.name,
    })
    .from(customShellCrmThreads)
    .innerJoin(customShellCrmLeads, eq(customShellCrmLeads.id, customShellCrmThreads.leadId))
    .innerJoin(customShellWorkspaces, eq(customShellWorkspaces.id, customShellCrmThreads.workspaceId))
    .where(eq(customShellCrmThreads.id, reply.threadId))
    .limit(1)
  const recipient = reply.scheduledByUserId ?? row?.ownerId
  if (!row || !recipient) return

  const words = crmScheduledReplyFailedText(row.name?.trim() || row.email, reason)
  // The CRM's own kind, as the unanswered-mail notice is, with words of its
  // own: it opens the conversation, which is where the reply waits.
  await database.insert(customShellNotifications).values({
    id: uuid(),
    recipientUserId: recipient,
    type: "crm_follow_up",
    message: words.message,
    detail: words.detail,
    crmThreadId: reply.threadId,
    createdAt: now(),
  })
  await publishNotificationCreated(recipient, database)
}
