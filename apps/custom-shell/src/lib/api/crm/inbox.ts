import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CRM_INBOX_PAGE_SIZE,
  CRM_MAX_BODY_LENGTH,
  CRM_STAGES,
  CRM_THREAD_STATUSES,
  type CrmAttachment,
  type CrmStage,
  type CrmThreadStatus,
} from "@/lib/crm/crm"
import { draftCrmReply } from "@/server/crm/draft"
import {
  countInboxThreads,
  getThread,
  listInboxThreads,
  listThreadMessages,
  markThreadRead,
  markThreadUnread,
  setThreadStatus,
} from "@/server/crm/inbox"
import { fillMessageBody, MAX_BODY_ATTEMPTS } from "@/server/crm/inbound"
import { sendCrmReply } from "@/server/crm/reply"
import { getCrmReplySender } from "@/server/crm/sender"
import { adminGet, adminPost } from "@/server/guards"
import { currentWorkspaceId } from "@/server/people/workspaces"

import { createErrorMessage } from "../error-message"

export type InboxThread = {
  id: string
  subject: string
  status: CrmThreadStatus
  messageCount: number
  unread: boolean
  lastDirection: "in" | "out"
  last_message_at: string
  snippet: string | null
  leadId: string
  leadEmail: string
  leadName: string | null
  leadStage: CrmStage
  follow_up_at: string | null
}

export type InboxPage = {
  threads: InboxThread[]
  /**
   * How many the current filters match, which is what paging counts against.
   * The same number as `allCount` or `unreadCount` depending on which tab is
   * on, because the tabs are the only thing that differs.
   */
  total: number
  pageSize: number
  /**
   * The two tab counts. Both obey every filter except the unread one, so
   * neither moves when you press the other — pressing Unread used to drop All
   * from 6 to 2.
   */
  allCount: number
  unreadCount: number
  /**
   * The address mail arrives at, or null when none is saved. Null is what the
   * empty inbox explains itself with, and what disables Send.
   */
  inboundAddress: string | null
  /**
   * The whole From line a reply would go out as, such as
   * `Tyler <leads@inbox.example.com>`, or null when there is no inbound
   * address. The composer's footnote shows this rather than assembling its own,
   * so what it promises is what the customer receives.
   */
  replyFrom: string | null
}

export type ConversationMessage = {
  id: string
  direction: "in" | "out"
  fromEmail: string
  fromName: string | null
  toEmail: string
  subject: string
  body: string | null
  isHtml: boolean
  attachments: CrmAttachment[]
  /** False while the body is still being fetched, or after it was given up on. */
  bodyReady: boolean
  /** True once the fetch has been tried enough times to stop. */
  bodyGaveUp: boolean
  occurred_at: string
}

export type Conversation = {
  id: string
  subject: string
  status: CrmThreadStatus
  snoozed_until: string | null
  leadId: string
  /** Whether it was unread when it was opened, which is what decides whether
   * the browser then marks it read. */
  unread: boolean
  messages: ConversationMessage[]
}

const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum([...CRM_THREAD_STATUSES, "all"]).optional(),
  stage: z.enum([...CRM_STAGES, "all"]).optional(),
  unreadOnly: z.boolean().optional(),
  followUpDue: z.boolean().optional(),
  page: z.number().int().min(1).max(10_000).optional(),
})

const threadSchema = z.object({ threadId: z.string().min(1).max(36) })

const loadInboxFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }): Promise<InboxPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const [threads, counts, sender] = await Promise.all([
      listInboxThreads(workspaceId, {
        ...data,
        limit: CRM_INBOX_PAGE_SIZE,
        offset: ((data.page ?? 1) - 1) * CRM_INBOX_PAGE_SIZE,
      }),
      countInboxThreads(workspaceId, data),
      getCrmReplySender(workspaceId),
    ])

    return {
      // Worked out from the two counts rather than asked for a third time:
      // the list's filters are the tab filters plus the unread one, so it is
      // always one of these two.
      total: data.unreadOnly ? counts.unread : counts.all,
      allCount: counts.all,
      unreadCount: counts.unread,
      inboundAddress: sender?.address ?? null,
      replyFrom: sender?.from ?? null,
      pageSize: CRM_INBOX_PAGE_SIZE,
      threads: threads.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        messageCount: row.messageCount,
        unread: row.readAt === null,
        lastDirection: row.lastDirection,
        last_message_at: row.lastMessageAt.toISOString(),
        snippet: row.snippet,
        leadId: row.leadId,
        leadEmail: row.leadEmail,
        leadName: row.leadName,
        leadStage: row.leadStage,
        follow_up_at: row.followUpAt?.toISOString() ?? null,
      })),
    }
  })

/**
 * One conversation, and nothing else.
 *
 * **It does not mark the thread read**, even though opening one does. A GET
 * skips the origin check on purpose — see `src/server/guards.ts` — so a GET
 * that writes is a write another site can make your browser perform. The
 * browser calls `markConversationRead` straight afterwards, which is a POST and
 * is checked.
 */
const loadConversationFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(threadSchema)
  .handler(async ({ data, context }): Promise<Conversation> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const thread = await getThread(workspaceId, data.threadId)
    if (!thread) throw new Error("CRM_THREAD_NOT_FOUND")

    const messages = await listThreadMessages(workspaceId, data.threadId)

    return {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      snoozed_until: thread.snoozedUntil?.toISOString() ?? null,
      leadId: thread.leadId,
      unread: thread.readAt === null,
      messages: messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        toEmail: message.toEmail,
        subject: message.subject,
        // Plain text wins when there is any: it is what the person typed, and
        // it needs no sanitising before it can be shown.
        body: message.textBody?.trim() ? message.textBody : message.htmlBody,
        isHtml: !message.textBody?.trim() && Boolean(message.htmlBody),
        attachments: message.attachments,
        bodyReady: message.bodyFetchedAt !== null,
        // The one place that decides a body is never coming, said once in
        // `MAX_BODY_ATTEMPTS` rather than typed again here.
        bodyGaveUp:
          message.bodyFetchedAt === null &&
          message.bodyAttempts >= MAX_BODY_ATTEMPTS,
        occurred_at: message.occurredAt.toISOString(),
      })),
    }
  })

const sendReplySchema = threadSchema.extend({
  body: z.string().trim().min(1).max(CRM_MAX_BODY_LENGTH),
})

const sendReplyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(sendReplySchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const result = await sendCrmReply(workspaceId, data.threadId, data.body)
    if (!result.sent) throw new Error(`CRM_SEND_REFUSED: ${result.error}`)
    return { messageId: result.messageId }
  })

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    threadSchema.extend({
      status: z.enum(CRM_THREAD_STATUSES),
      snoozedUntil: z.string().datetime().nullable().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const changed = await setThreadStatus(
      workspaceId,
      data.threadId,
      data.status,
      data.snoozedUntil ? new Date(data.snoozedUntil) : null
    )
    if (!changed) throw new Error("CRM_THREAD_NOT_FOUND")
    return { changed }
  })

/** Opening a conversation is reading it, and reading it is a write. */
const markReadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return { changed: await markThreadRead(workspaceId, data.threadId) }
  })

const markUnreadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const changed = await markThreadUnread(workspaceId, data.threadId)
    if (!changed) throw new Error("CRM_THREAD_NOT_FOUND")
    return { changed }
  })

/**
 * Asks Resend again for one message's body, at somebody's request.
 *
 * The same work the background pass does, on a button, because waiting fifteen
 * seconds for a pass to come round while looking at an empty message is a poor
 * answer. The workspace check is the thread read, so a message id from
 * somewhere else cannot be fetched.
 */
const fetchBodyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    threadSchema.extend({ messageId: z.string().min(1).max(36) })
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const thread = await getThread(workspaceId, data.threadId)
    if (!thread) throw new Error("CRM_THREAD_NOT_FOUND")
    return { filled: await fillMessageBody(workspaceId, data.messageId) }
  })

const draftReplyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadSchema)
  .handler(async ({ data, context }): Promise<{ draft: string }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      draft: await draftCrmReply(workspaceId, data.threadId, context.user.id),
    }
  })

export function loadInbox(options: z.input<typeof listSchema> = {}) {
  return loadInboxFn({ data: options })
}

export function loadConversation(threadId: string) {
  return loadConversationFn({ data: { threadId } })
}

export function sendReply(threadId: string, body: string) {
  return sendReplyFn({ data: { threadId, body } })
}

export function setConversationStatus(
  threadId: string,
  status: CrmThreadStatus,
  snoozedUntil?: string | null
) {
  return setStatusFn({ data: { threadId, status, snoozedUntil } })
}

export function markConversationRead(threadId: string) {
  return markReadFn({ data: { threadId } })
}

export function markConversationUnread(threadId: string) {
  return markUnreadFn({ data: { threadId } })
}

export function fetchMessageBody(threadId: string, messageId: string) {
  return fetchBodyFn({ data: { threadId, messageId } })
}

export function draftReply(threadId: string) {
  return draftReplyFn({ data: { threadId } })
}

/**
 * Every refusal this screen can hit, said in words a person can act on.
 *
 * `CRM_SEND_REFUSED` carries the provider's own reason after the colon, so the
 * fallback only shows when the error is something nobody wrote a sentence for.
 */
export const getCrmErrorMessage = createErrorMessage(
  {
    CRM_THREAD_NOT_FOUND: "That conversation is no longer here.",
    CRM_NO_INBOUND_ADDRESS:
      "Add the address mail arrives at, in Settings → Email, before replying.",
    CRM_SEND_REFUSED: "The email was not accepted. Nothing was sent.",
    CRM_NO_AI_KEY:
      "No AI key is saved, so there is nothing to write the draft with. Add one in Settings → AI.",
    CRM_DRAFT_FAILED: "The draft could not be written. Try again.",
    AI_LIMIT_REACHED:
      "This month's AI allowance is used up, so no more drafts until the 1st.",
  },
  "That did not work. Try again."
)
