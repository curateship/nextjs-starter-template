import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CRM_INBOX_PAGE_SIZE,
  CRM_INBOX_SORTS,
  CRM_MAX_BODY_LENGTH,
  CRM_MAX_THREADS_PER_PRESS,
  CRM_REPLY_UPLOAD_MAX_BYTES,
  CRM_STAGES,
  CRM_THREAD_STATUSES,
  type CrmStage,
  type CrmThreadStatus,
  crmFileNameFromUrl,
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
  setThreadRobot,
  setThreadSaved,
  setThreadStatus,
  markMatchingThreadsRead,
  waitingCutoff,
  type InboxFilter,
  type ManyThreadsResult,
} from "@/server/crm/inbox"
import { listInboundAddresses } from "@/server/crm/addresses"
import { getPublicMediaUrl } from "@/server/media/storage"
import { startCrmConversation } from "@/server/crm/compose"
import { forwardCrmThread, listThreadForwards } from "@/server/crm/forward"
import { listWorkspaceLeadTags } from "@/server/crm/lead-tags"
import { fillMessageBody, MAX_BODY_ATTEMPTS } from "@/server/crm/inbound"
import { sendCrmReply } from "@/server/crm/reply"
import { clearReplyDraft, listReplyDrafts, saveReplyDraft } from "@/server/crm/reply-drafts"
import {
  cancelScheduledReply,
  changeScheduledReply,
  listScheduledReplies,
  scheduleReply,
} from "@/server/crm/scheduled-replies"
import {
  CRM_REPLY_FILES_TOO_BIG,
  CRM_REPLY_UPLOAD_EMPTY,
  storeReplyUpload,
} from "@/server/crm/reply-files"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import { getCrmReplySender } from "@/server/crm/sender"
import { devOutboxIsAvailable } from "@/server/email/dev-outbox"
import { getEmailSettings } from "@/server/email/settings"
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
  /** Sent by a machine, so it is in the Other view (CRM task 38, part 4). */
  robot: boolean
  lastDirection: "in" | "out"
  last_message_at: string
  snippet: string | null
  /**
   * While searching, the line of their mail holding the search, with the word
   * apart so the row can draw it heavier. Null when the row matched on who it
   * is with or its subject, or when nothing is searched.
   */
  match: { before: string; word: string; after: string; fromUs: boolean } | null
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
  /** The Waiting pill: they wrote last and nobody answered for `unansweredDays`. */
  waitingCount: number
  /** The Other view: machines' mail (CRM task 38, part 4). */
  otherCount: number
  /**
   * How many unread conversations the search, filters and view match, which
   * is what "Mark all read" would stamp (CRM task 38, part 7).
   */
  unreadInView: number
  /**
   * When the server read this list. "Mark all read" leaves alone anything that
   * arrived after it, because nobody has seen that yet.
   */
  listedAt: string
  /** After how many days a conversation is waiting; 0 is off, and the pill hides. */
  unansweredDays: number
  /** Whether this server keeps a development outbox, which is what shows the Outbox pill. */
  outboxAvailable: boolean
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

/** A reply written now and sent later (CRM task 38, part 6). */
export type ScheduledReply = {
  id: string
  body: string
  /** The names of its files, to say what goes with it. */
  fileNames: string[]
  send_at: string
  /** Waiting for its time, on its way now, or could not go (with `error`). */
  state: "waiting" | "sending" | "failed"
  error: string | null
  /** They wrote again after it was scheduled, which it still goes out over. */
  wroteSince: boolean
}

export type Conversation = {
  id: string
  subject: string
  status: CrmThreadStatus
  snoozed_until: string | null
  saved: boolean
  toAddress: string | null
  /** Sent by a machine, so it is in the Other view (CRM task 38, part 4). */
  robot: boolean
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
  /** Replies put off to a later time, soonest first (CRM task 38, part 6). */
  scheduled: ScheduledReply[]
  leadId: string
  /** Whether it was unread when it was opened, which is what decides whether
   * the browser then marks it read. */
  unread: boolean
  messages: ConversationMessage[]
}

const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  stage: z.enum([...CRM_STAGES, "all"]).optional(),
  unreadOnly: z.boolean().optional(),
  savedOnly: z.boolean().optional(),
  /** The Waiting pill. Ignored while chasing is off. */
  waitingOnly: z.boolean().optional(),
  /** The Other view: machines' mail, which every other view leaves out (CRM task 38, part 4). */
  robotsOnly: z.boolean().optional(),
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

/**
 * What the inbox's search, filters and view mean as a server filter. One
 * place, so the list, its counts and "Mark all read" (CRM task 38, part 7)
 * can never mean different conversations by the same choices.
 */
async function readInboxFilter(
  workspaceId: string,
  data: Omit<z.output<typeof listSchema>, "page">
) {
  const [addresses, settings] = await Promise.all([
    listInboundAddresses(workspaceId),
    getEmailSettings(workspaceId),
  ])
  // The same default the chase job and the Waiting on you block use.
  const unansweredDays = settings?.crmUnansweredDays ?? 3
  const waitingSince = unansweredDays > 0 ? waitingCutoff(unansweredDays) : null
  const { waitingOnly, robotsOnly, ...rest } = data
  const filter: InboxFilter = {
    ...rest,
    robots: robotsOnly ? "only" : undefined,
    // The inbox is every conversation that is not closed: closed now means
    // only a blocked sender's, and nothing else closes or snoozes one
    // (9 Nov 2026).
    status: "open",
    waitingSince: waitingOnly ? (waitingSince ?? undefined) : undefined,
    // The first address also takes the conversations from before the list,
    // which have none recorded: it was the only one then.
    toAddressTakesUnknown:
      Boolean(data.toAddress) &&
      addresses[0]?.address.toLowerCase() === data.toAddress?.toLowerCase(),
  }
  return { filter, addresses, unansweredDays, waitingSince }
}

const loadInboxFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }): Promise<InboxPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const listedAt = new Date()
    const { filter, addresses, unansweredDays, waitingSince } = await readInboxFilter(workspaceId, data)
    const [threads, counts, sender, tags] = await Promise.all([
      listInboxThreads(workspaceId, {
        ...filter,
        limit: CRM_INBOX_PAGE_SIZE,
        offset: ((data.page ?? 1) - 1) * CRM_INBOX_PAGE_SIZE,
      }),
      countInboxThreads(workspaceId, filter, undefined, waitingSince),
      getCrmReplySender(workspaceId),
      listWorkspaceLeadTags(workspaceId),
    ])

    return {
      // Worked out from the three counts rather than asked for again: the
      // list's filters are the tab filters plus the tab's own, so it is always
      // one of these three.
      total: data.robotsOnly
        ? counts.other
        : filter.waitingSince
        ? counts.waiting
        : data.savedOnly
          ? counts.saved
          : data.unreadOnly
            ? counts.unread
            : counts.all,
      allCount: counts.all,
      unreadCount: counts.unread,
      savedCount: counts.saved,
      waitingCount: counts.waiting,
      otherCount: counts.other,
      unreadInView: data.robotsOnly
        ? counts.otherUnread
        : filter.waitingSince
        ? counts.waitingUnread
        : data.savedOnly
          ? counts.savedUnread
          : counts.unread,
      listedAt: listedAt.toISOString(),
      unansweredDays,
      outboxAvailable: devOutboxIsAvailable(),
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
        robot: row.robot,
        lastDirection: row.lastDirection,
        last_message_at: row.lastMessageAt.toISOString(),
        snippet: row.snippet,
        match: row.match,
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

    const [messages, sender, forwards, storageReady, scheduled] = await Promise.all([
      listThreadMessages(workspaceId, data.threadId),
      getCrmReplySender(workspaceId, undefined, thread.toAddress),
      listThreadForwards(workspaceId, data.threadId),
      // Whether the site has file storage at all; without it their files are
      // names only, and the conversation says why (CRM task 21).
      getPublicMediaUrl("").then(
        () => true,
        () => false
      ),
      listScheduledReplies(workspaceId, data.threadId),
    ])
    // Oldest first, so the last of theirs is the newest.
    const lastTheirs =
      messages.filter((message) => message.direction === "in").at(-1)?.occurredAt ?? null

    return {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      snoozed_until: thread.snoozedUntil?.toISOString() ?? null,
      saved: thread.savedAt !== null,
      toAddress: thread.toAddress,
      robot: thread.robot,
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
      scheduled: scheduled.map((reply) => ({
        id: reply.id,
        body: reply.body,
        fileNames: [
          ...reply.files.urls.map(crmFileNameFromUrl),
          ...reply.files.uploads.map((upload) => upload.name),
        ],
        send_at: reply.sendAt.toISOString(),
        state: reply.state,
        error: reply.error,
        wroteSince: lastTheirs !== null && lastTheirs > reply.createdAt,
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
  /**
   * Files uploaded from the computer for this reply (CRM task 38, part 3), by
   * where they were stored and the name to send them under. The server checks
   * each one is this site's before reading it.
   */
  uploads: z
    .array(z.object({ key: z.string().trim().min(1).max(500), name: z.string().trim().min(1).max(255) }))
    .max(10)
    .optional(),
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
      data.files ?? [],
      data.uploads ?? []
    )
    if (!result.sent) throw new Error(`CRM_SEND_REFUSED: ${result.error}`)
    // The kept draft goes only once the reply has really gone, so a tab shut
    // while it was waiting to send keeps the words (CRM task 38, parts 1 and 5).
    await clearReplyDraft(workspaceId, context.user.id, data.threadId)
    return { messageId: result.messageId, reopened: result.reopened }
  })

/**
 * A file from the computer for a reply (CRM task 38, part 3), kept under the
 * site's own CRM folder until the reply sends it. Up to 10 MB, the reply's
 * whole allowance, checked here and again with the reply's other files.
 */
const uploadReplyFileFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const file = data.get("file")
    if (!(file instanceof File)) throw new Error(CRM_REPLY_UPLOAD_EMPTY)
    return file
  })
  .handler(async ({ data, context }) => {
    if (data.size > CRM_REPLY_UPLOAD_MAX_BYTES) throw new Error(CRM_REPLY_FILES_TOO_BIG)
    await enforceRateLimit(`crm-reply-upload:${context.user.id}`, { maxAttempts: 60, windowSeconds: 10 * 60 })
    const workspaceId = await currentWorkspaceId(context.user.id)
    try {
      return await storeReplyUpload(workspaceId, {
        name: data.name,
        type: data.type,
        data: new Uint8Array(await data.arrayBuffer()),
      })
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) throw new Error("CRM_NO_FILE_STORAGE")
      throw error
    }
  })

export function uploadReplyFile(file: File) {
  const formData = new FormData()
  formData.append("file", file)
  return uploadReplyFileFn({ data: formData })
}

/**
 * Puts a reply off to a set time (CRM task 38, part 6). The browser works the
 * moment out in the person's own clock and sends it exact.
 */
const scheduleReplyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(sendReplySchema.extend({ sendAt: z.string().datetime() }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const id = await scheduleReply(workspaceId, context.user.id, data.threadId, {
      body: data.body,
      files: { urls: data.files ?? [], uploads: data.uploads ?? [] },
      sendAt: new Date(data.sendAt),
    })
    return { id }
  })

const changeScheduledFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36), sendAt: z.string().datetime() }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await changeScheduledReply(workspaceId, data.id, new Date(data.sendAt))
    return { changed: true }
  })

/** Cancels a scheduled reply, handing its words and files back for the box. */
const cancelScheduledFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return cancelScheduledReply(workspaceId, data.id)
  })

export function scheduleConversationReply(input: {
  threadId: string
  body: string
  files: string[]
  uploads: { key: string; name: string }[]
  sendAt: string
}) {
  return scheduleReplyFn({ data: input })
}

export function changeScheduledConversationReply(id: string, sendAt: string) {
  return changeScheduledFn({ data: { id, sendAt } })
}

export function cancelScheduledConversationReply(id: string) {
  return cancelScheduledFn({ data: { id } })
}

/** This admin's half-written replies on this site, by conversation (CRM task 38, part 5). */
const loadReplyDraftsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<Record<string, string>> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return listReplyDrafts(workspaceId, context.user.id)
  })

/** Keeps one conversation's half-written reply, or forgets it when the box is empty. */
const saveReplyDraftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadSchema.extend({ body: z.string().max(CRM_MAX_BODY_LENGTH) }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const saved = await saveReplyDraft(workspaceId, context.user.id, data.threadId, data.body)
    if (!saved) throw new Error("CRM_THREAD_NOT_FOUND")
    return { saved }
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

/**
 * "Not a robot" or "Move to Other" (CRM task 38, part 4): a person's word on a
 * conversation, kept for its address too, that the rule never changes back.
 */
const setRobotFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(threadSchema.extend({ robot: z.boolean() }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const changed = await setThreadRobot(workspaceId, data.threadId, data.robot)
    if (!changed) throw new Error("CRM_THREAD_NOT_FOUND")
    return { changed }
  })

export function setConversationRobot(threadId: string, robot: boolean) {
  return setRobotFn({ data: { threadId, robot } })
}

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
 * Marks read every unread conversation the inbox's search, filters and view
 * match (CRM task 38, part 7), worked out on the server from the same filter
 * the list uses, so nothing but the filter crosses from the browser.
 * `listedAt` is when the list on screen was read: mail newer than that stays
 * unread, because nobody has seen it.
 */
const markMatchingReadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(listSchema.omit({ page: true }).extend({ listedAt: z.string().datetime() }))
  .handler(async ({ data, context }): Promise<{ changed: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const { listedAt, ...choices } = data
    const { filter } = await readInboxFilter(workspaceId, choices)
    const before = new Date(Math.min(Date.parse(listedAt), Date.now()))
    return { changed: await markMatchingThreadsRead(workspaceId, filter, before) }
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

export function sendReply(
  threadId: string,
  body: string,
  files: string[] = [],
  uploads: { key: string; name: string }[] = []
) {
  return sendReplyFn({ data: { threadId, body, files, uploads } })
}

export function loadReplyDrafts() {
  return loadReplyDraftsFn()
}

export function saveReplyDraftToServer(threadId: string, body: string) {
  return saveReplyDraftFn({ data: { threadId, body } })
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

export function markMatchingConversationsRead(
  choices: Omit<z.input<typeof listSchema>, "page">,
  listedAt: string
) {
  return markMatchingReadFn({ data: { ...choices, listedAt } })
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
      "One of the files is no longer there. Take it off and send again.",
    CRM_REPLY_UPLOAD_EMPTY: "That file is empty, so there is nothing to send.",
    CRM_SCHEDULE_BAD_TIME: "Pick a time later than now, and within a year.",
    CRM_SCHEDULED_NOT_FOUND: "That reply is already on its way, or was cancelled.",
    CRM_NO_FILE_STORAGE:
      "Set up file storage to attach files from your computer: Settings → General settings, under Cloudflare R2.",
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
