import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CRM_INBOX_PAGE_SIZE,
  CRM_INBOX_SORTS,
  CRM_MAX_BODY_LENGTH,
  CRM_MAX_THREADS_PER_PRESS,
  CRM_STAGES,
  CRM_THREAD_STATUSES,
  type CrmStage,
  type CrmThreadStatus,
} from "@/lib/crm/crm"
import { draftCrmReply, SUMMARY_MIN_MESSAGES, summariseCrmThread } from "@/server/crm/draft"
import {
  countInboxThreads,
  getThread,
  listInboxThreads,
  listThreadMessages,
  markThreadRead,
  markThreadsRead,
  markThreadUnread,
  setThreadSaved,
  setThreadStatus,
  setThreadStatuses,
  type ManyThreadsResult,
} from "@/server/crm/inbox"
import { listInboundAddresses } from "@/server/crm/addresses"
import { getPublicMediaUrl } from "@/server/media/storage"
import { startCrmConversation } from "@/server/crm/compose"
import { forwardCrmThread, listThreadForwards } from "@/server/crm/forward"
import { listWorkspaceLeadTags } from "@/server/crm/lead-tags"
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
  saved: boolean
  /** The address the mail arrived at, or null for mail from before the list. */
  toAddress: string | null
  lastDirection: "in" | "out"
  last_message_at: string
  snippet: string | null
  leadId: string
  leadEmail: string
  leadName: string | null
  leadStage: CrmStage
  follow_up_at: string | null
  /** The lead's tags, A to Z. */
  tags: string[]
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
  savedCount: number
  /** Every address mail arrives at, oldest first, for the row labels and the filter. */
  addresses: { address: string; label: string }[]
  /** Every tag the site's leads carry, for the filter. */
  tags: string[]
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
  attachments: ConversationFile[]
  /** False while the body is still being fetched, or after it was given up on. */
  bodyReady: boolean
  /** True once the fetch has been tried enough times to stop. */
  bodyGaveUp: boolean
  occurred_at: string
}

/**
 * One file as the browser sees it (CRM task 21): never where it is stored,
 * only the guarded address that serves it, once it is there.
 */
export type ConversationFile = {
  id: string
  filename: string
  contentType: string | null
  size: number | null
  /** The guarded route that serves it, or null while it is not stored. */
  href: string | null
  /**
   * Stored; on its way; given up on; too big to fetch; not fetched because
   * the site has no file storage; or one of ours from before files were kept.
   */
  state: "ready" | "fetching" | "gave-up" | "too-big" | "no-storage" | "names-only"
}

export type Conversation = {
  id: string
  subject: string
  status: CrmThreadStatus
  snoozed_until: string | null
  saved: boolean
  toAddress: string | null
  /**
   * The From line a reply in this conversation goes out as: from the address
   * its mail arrived at while that is on the list, otherwise the first one.
   * Null when the site has no address at all.
   */
  replyFrom: string | null
  /**
   * The summary somebody asked for (CRM task 32), or null. `summaryStale`
   * says messages have come since, and `canSummarise` that it is long enough
   * to be worth one.
   */
  summary: string | null
  summaryStale: boolean
  canSummarise: boolean
  /** Who it was forwarded to and when, oldest first (CRM task 20). */
  forwards: { id: string; toEmail: string; forwarded_at: string }[]
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
  savedOnly: z.boolean().optional(),
  toAddress: z.string().trim().max(255).optional(),
  followUpDue: z.boolean().optional(),
  tag: z.string().trim().max(60).optional(),
  sort: z.enum(CRM_INBOX_SORTS).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
})

const threadSchema = z.object({ threadId: z.string().min(1).max(36) })

/**
 * The ticked rows, for the actions that work on a handful at once.
 *
 * Capped, because the ids arrive from the browser and an uncapped array is an
 * invitation to send a hundred thousand of them. The cap is the same number
 * the bar in the inbox checks before it sends.
 */
const threadIdsSchema = z.object({
  threadIds: z
    .array(z.string().min(1).max(36))
    .min(1)
    .max(CRM_MAX_THREADS_PER_PRESS),
})

/**
 * What a ticked-rows press did, re-exported so the screen can name it without
 * reaching into `@/server`.
 */
export type { ManyThreadsResult }

const loadInboxFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }): Promise<InboxPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const addresses = await listInboundAddresses(workspaceId)
    // The first address also takes the conversations from before the list,
    // which have none recorded: it was the only one then.
    const filter = {
      ...data,
      toAddressTakesUnknown:
        Boolean(data.toAddress) &&
        addresses[0]?.address.toLowerCase() === data.toAddress?.toLowerCase(),
    }
    const [threads, counts, sender, tags] = await Promise.all([
      listInboxThreads(workspaceId, {
        ...filter,
        limit: CRM_INBOX_PAGE_SIZE,
        offset: ((data.page ?? 1) - 1) * CRM_INBOX_PAGE_SIZE,
      }),
      countInboxThreads(workspaceId, filter),
      getCrmReplySender(workspaceId),
      listWorkspaceLeadTags(workspaceId),
    ])

    return {
      // Worked out from the three counts rather than asked for again: the
      // list's filters are the tab filters plus the tab's own, so it is always
      // one of these three.
      total: data.savedOnly
        ? counts.saved
        : data.unreadOnly
          ? counts.unread
          : counts.all,
      allCount: counts.all,
      unreadCount: counts.unread,
      savedCount: counts.saved,
      addresses: addresses.map(({ address, label }) => ({ address, label })),
      tags,
      inboundAddress: sender?.address ?? null,
      replyFrom: sender?.from ?? null,
      pageSize: CRM_INBOX_PAGE_SIZE,
      threads: threads.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        messageCount: row.messageCount,
        unread: row.readAt === null,
        saved: row.savedAt !== null,
        toAddress: row.toAddress,
        lastDirection: row.lastDirection,
        last_message_at: row.lastMessageAt.toISOString(),
        snippet: row.snippet,
        leadId: row.leadId,
        leadEmail: row.leadEmail,
        leadName: row.leadName,
        leadStage: row.leadStage,
        follow_up_at: row.followUpAt?.toISOString() ?? null,
        tags: row.tags,
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

    const [messages, sender, forwards, storageReady] = await Promise.all([
      listThreadMessages(workspaceId, data.threadId),
      getCrmReplySender(workspaceId, undefined, thread.toAddress),
      listThreadForwards(workspaceId, data.threadId),
      // Whether the site has file storage at all; without it their files are
      // names only, and the conversation says why (CRM task 21).
      getPublicMediaUrl("").then(
        () => true,
        () => false
      ),
    ])

    return {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      snoozed_until: thread.snoozedUntil?.toISOString() ?? null,
      saved: thread.savedAt !== null,
      toAddress: thread.toAddress,
      replyFrom: sender?.from ?? null,
      summary: thread.summary,
      summaryStale:
        thread.summary !== null &&
        (thread.summaryMessageCount ?? 0) < thread.messageCount,
      canSummarise: thread.messageCount >= SUMMARY_MIN_MESSAGES,
      forwards: forwards.map((forward) => ({
        id: forward.id,
        toEmail: forward.toEmail,
        forwarded_at: forward.createdAt.toISOString(),
      })),
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
        attachments: message.attachments.map((file, index): ConversationFile => ({
          id: file.id,
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
          href: file.storageKey ? `/api/v1/crm/files/${message.id}/${index}` : null,
          state: file.storageKey
            ? "ready"
            : file.tooBig
              ? "too-big"
              : message.direction === "out"
                ? "names-only"
                : message.filesFetchedAt || message.fileAttempts >= MAX_BODY_ATTEMPTS
                  ? "gave-up"
                  : storageReady
                    ? "fetching"
                    : "no-storage",
        })),
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
  /** Files from the media library, by the address the picker gave. */
  files: z.array(z.string().trim().min(1).max(1000)).max(10).optional(),
})

const sendReplyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(sendReplySchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const result = await sendCrmReply(
      workspaceId,
      data.threadId,
      data.body,
      undefined,
      data.files ?? []
    )
    if (!result.sent) throw new Error(`CRM_SEND_REFUSED: ${result.error}`)
    return { messageId: result.messageId, reopened: result.reopened }
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

/**
 * Emails somebody who has not written first, and makes their lead (CRM task
 * 15). Nothing is written when the provider refuses.
 */
const startConversationFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      to: z.string().trim().min(3).max(255),
      name: z.string().trim().max(255).optional(),
      subject: z.string().trim().min(1).max(2000),
      body: z.string().trim().min(1).max(CRM_MAX_BODY_LENGTH),
      fromAddress: z.string().trim().max(255).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const result = await startCrmConversation(workspaceId, data)
    if (!result.sent) throw new Error(`CRM_SEND_REFUSED: ${result.error}`)
    return { threadId: result.threadId, leadExisted: result.leadExisted }
  })

/** Saves a conversation for the Saved tab, or takes the mark off. */
const setSavedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadSchema.extend({ saved: z.boolean() }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const changed = await setThreadSaved(workspaceId, data.threadId, data.saved)
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
 * Marks every ticked conversation read, in one request.
 *
 * One request rather than one per row: twenty rows is one trip, and the list
 * is asked again once rather than twenty times.
 */
const markManyReadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadIdsSchema)
  .handler(async ({ data, context }): Promise<ManyThreadsResult> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return markThreadsRead(workspaceId, data.threadIds)
  })

/**
 * Opens, snoozes or closes every ticked conversation, in one request.
 *
 * No `CRM_THREAD_NOT_FOUND` here, unlike the one-thread version. A ticked set
 * where one row has since been dealt with elsewhere should still write the
 * other nineteen, and the counts that come back say what happened.
 */
const setManyStatusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    threadIdsSchema.extend({
      status: z.enum(CRM_THREAD_STATUSES),
      snoozedUntil: z.string().datetime().nullable().optional(),
    })
  )
  .handler(async ({ data, context }): Promise<ManyThreadsResult> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return setThreadStatuses(
      workspaceId,
      data.threadIds,
      data.status,
      data.snoozedUntil ? new Date(data.snoozedUntil) : null
    )
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

/** Sends the whole conversation on to somebody else, with a note (CRM task 20). */
const forwardFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    threadSchema.extend({
      to: z.string().trim().min(3).max(255),
      note: z.string().trim().max(5000),
    })
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const result = await forwardCrmThread(
      workspaceId,
      data.threadId,
      { to: data.to, note: data.note },
      context.user.id
    )
    if (!result.sent) throw new Error(`CRM_SEND_REFUSED: ${result.error}`)
    return { forwardId: result.forwardId }
  })

export function forwardConversation(threadId: string, to: string, note: string) {
  return forwardFn({ data: { threadId, to, note } })
}

/** What this thread is about, on a press (CRM task 32). Metered like Draft with AI. */
const summariseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadSchema)
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      summary: await summariseCrmThread(workspaceId, data.threadId, context.user.id),
    }
  })

export function summariseConversation(threadId: string) {
  return summariseFn({ data: { threadId } })
}

export function loadInbox(options: z.input<typeof listSchema> = {}) {
  return loadInboxFn({ data: options })
}

export function loadConversation(threadId: string) {
  return loadConversationFn({ data: { threadId } })
}

export function sendReply(threadId: string, body: string, files: string[] = []) {
  return sendReplyFn({ data: { threadId, body, files } })
}

export function setConversationStatus(
  threadId: string,
  status: CrmThreadStatus,
  snoozedUntil?: string | null
) {
  return setStatusFn({ data: { threadId, status, snoozedUntil } })
}

export function startConversation(input: {
  to: string
  name?: string
  subject: string
  body: string
  fromAddress?: string
}) {
  return startConversationFn({ data: input })
}

export function setConversationSaved(threadId: string, saved: boolean) {
  return setSavedFn({ data: { threadId, saved } })
}

export function markConversationRead(threadId: string) {
  return markReadFn({ data: { threadId } })
}

export function markConversationsRead(threadIds: string[]) {
  return markManyReadFn({ data: { threadIds } })
}

export function setConversationsStatus(
  threadIds: string[],
  status: CrmThreadStatus,
  snoozedUntil?: string | null
) {
  return setManyStatusFn({ data: { threadIds, status, snoozedUntil } })
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
    CRM_COMPOSE_BAD_ADDRESS: "That is not an email address.",
    CRM_FORWARD_BAD_ADDRESS: "That is not an email address.",
    CRM_REPLY_FILE_NOT_FOUND:
      "One of the files is no longer in the media library. Take it off and send again.",
    CRM_REPLY_FILES_TOO_BIG:
      "The files come to more than 10 MB, the most one reply can carry. Take one off.",
    CRM_NO_INBOUND_ADDRESS:
      "Add the address mail arrives at, in Settings → Email, before replying.",
    CRM_SEND_REFUSED: "The email was not accepted. Nothing was sent.",
    CRM_NO_AI_KEY:
      "No AI key is saved, so there is nothing to write the draft with. Add one in Settings → AI.",
    CRM_DRAFT_FAILED: "The AI did not answer with anything usable. Try again.",
    CRM_TOO_SHORT_TO_SUMMARISE: "This conversation is short enough to read as it is.",
    AI_LIMIT_REACHED:
      "This month's AI allowance is used up, so no more drafts until the 1st.",
  },
  "That did not work. Try again."
)
