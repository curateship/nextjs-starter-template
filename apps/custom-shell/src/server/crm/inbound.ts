import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm"

import type { CrmAttachment } from "@/lib/crm/crm"
import {
  normalizeSubject,
  parseFromHeader,
  parseMessageIds,
  threadCandidateIds,
  threadMatchCutoff,
} from "@/lib/crm/thread-match"
import { now, uuid } from "@/server/auth/security"
import { isSenderBlocked } from "@/server/crm/blocked"
import { db, type CustomShellDb } from "@/server/db"
import { getAppEmailApiKey } from "@/server/email/settings"
import { getEmailProvider } from "@/server/email/provider"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
} from "@/server/schema"

/** The event Resend sends when mail lands at an inbound address. */
export const INBOUND_EVENT = "email.received"

/**
 * How many times the body of one message is asked for before it is given up
 * on. Five, the same as the outbound retry queue allows.
 */
export const MAX_BODY_ATTEMPTS = 5

/** A body fetch is not retried until the first attempt is this old. */
const BODY_RETRY_AFTER_MS = 60 * 1000

/**
 * What a received-mail event looks like, as far as this cares.
 *
 * Every field is optional and nothing is trusted: this is a parsed webhook
 * body, so it is a string somebody sent us. The signature proves it came from
 * Resend, not that the shape is right.
 */
export type ResendInboundEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    from?: string
    to?: string[] | string
    received_for?: string
    subject?: string
    message_id?: string
    attachments?: Array<{
      id?: string
      filename?: string
      content_type?: string
    }>
  }
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, limit)
}

/**
 * One Message-ID with its angle brackets taken off.
 *
 * Stored without them, always. `In-Reply-To` is read the same way, and an id
 * kept as `<abc@x>` on one row and `abc@x` on another would never match, which
 * would quietly turn header threading off while looking like it worked.
 */
function messageIdOf(value: unknown): string | null {
  const header = text(value, 998)
  return parseMessageIds(header)[0] ?? null
}

function firstAddress(value: string[] | string | undefined): string | null {
  const list = Array.isArray(value) ? value : value ? [value] : []
  for (const entry of list) {
    const address = text(entry, 255)
    if (address) return address.toLowerCase()
  }
  return null
}

/** The event's own time, or now when it did not say or said nonsense. */
function eventTime(event: ResendInboundEvent): Date {
  const parsed = event.created_at ? new Date(event.created_at) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : now()
}

function readAttachments(event: ResendInboundEvent): CrmAttachment[] {
  const list = event.data?.attachments
  if (!Array.isArray(list)) return []
  // Twenty is more than any real mail carries, and the cap means a hostile
  // payload cannot write an unbounded row.
  return list.slice(0, 20).flatMap((entry) => {
    const filename = text(entry?.filename, 255)
    if (!filename) return []
    return [
      {
        id: text(entry?.id, 255) ?? "",
        filename,
        contentType: text(entry?.content_type, 255),
        // Resend's event does not say how big a file is, and a made-up number
        // would read as a measured one.
        size: null,
      },
    ]
  })
}

export type InboundEmail = {
  providerEmailId: string
  fromEmail: string
  fromName: string | null
  toEmail: string
  subject: string
  rfcMessageId: string | null
  attachments: CrmAttachment[]
  occurredAt: Date
}

/**
 * The parts of a received-mail event this can use, or null when the event is
 * not one or is missing what it cannot do without.
 *
 * Exported so the test can check the refusals without a database.
 */
export function parseInboundEvent(
  event: ResendInboundEvent
): InboundEmail | null {
  if (event.type !== INBOUND_EVENT) return null

  const providerEmailId = text(event.data?.email_id, 255)
  if (!providerEmailId) return null

  const fromHeader = text(event.data?.from, 500)
  if (!fromHeader) return null

  const { email, name } = parseFromHeader(fromHeader)
  // A From with no address in it is mail this cannot file under anybody.
  if (!email || !email.includes("@") || email.length > 255) return null

  const toEmail =
    text(event.data?.received_for, 255)?.toLowerCase() ??
    firstAddress(event.data?.to) ??
    ""

  return {
    providerEmailId,
    fromEmail: email,
    fromName: name ? name.slice(0, 255) : null,
    toEmail,
    subject: text(event.data?.subject, 2000) ?? "",
    rfcMessageId: messageIdOf(event.data?.message_id),
    attachments: readAttachments(event),
    occurredAt: eventTime(event),
  }
}

/**
 * The lead this address is, making one when it is new.
 *
 * **It never writes a contact.** `contacts` is the newsletter audience and
 * somebody emailing in has not asked for a newsletter. A contact that already
 * exists on the address is linked, so the history tab can find their sends,
 * and nothing is created.
 */
async function leadForAddress(
  workspaceId: string,
  email: string,
  name: string | null,
  database: CustomShellDb
): Promise<string> {
  const [existing] = await database
    .select({ id: customShellCrmLeads.id, name: customShellCrmLeads.name })
    .from(customShellCrmLeads)
    .where(
      and(
        eq(customShellCrmLeads.workspaceId, workspaceId),
        sql`lower(${customShellCrmLeads.email}) = ${email}`
      )
    )
    .limit(1)

  const at = now()

  if (existing) {
    // A lead added by hand has no name until they write in. Filling a blank
    // one is help; overwriting a name somebody typed is not.
    if (!existing.name && name) {
      await database
        .update(customShellCrmLeads)
        .set({ name, updatedAt: at })
        .where(eq(customShellCrmLeads.id, existing.id))
    }
    return existing.id
  }

  const [contact] = await database
    .select({ id: customShellContacts.id })
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        sql`lower(${customShellContacts.email}) = ${email}`
      )
    )
    .limit(1)

  const id = uuid()
  await database.insert(customShellCrmLeads).values({
    id,
    workspaceId,
    email,
    name,
    stage: "new",
    source: "Email",
    contactId: contact?.id ?? null,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

/**
 * The thread this mail joins, by the same subject from the same person within
 * the last month, or a new one.
 *
 * The header rule that beats this one needs `In-Reply-To`, which is not in the
 * webhook — only the fetched body has it. `mergeByHeaders` below applies it
 * once the body has landed.
 */
async function threadForMessage(
  workspaceId: string,
  leadId: string,
  mail: InboundEmail,
  blocked: boolean,
  database: CustomShellDb
): Promise<{ id: string; created: boolean }> {
  const subjectKey = normalizeSubject(mail.subject).slice(0, 500)

  if (subjectKey) {
    const [match] = await database
      .select({ id: customShellCrmThreads.id })
      .from(customShellCrmThreads)
      .where(
        and(
          eq(customShellCrmThreads.leadId, leadId),
          eq(customShellCrmThreads.subjectKey, subjectKey),
          gte(
            customShellCrmThreads.lastMessageAt,
            threadMatchCutoff(mail.occurredAt)
          )
        )
      )
      .orderBy(desc(customShellCrmThreads.lastMessageAt))
      .limit(1)
    if (match) return { id: match.id, created: false }
  }

  const at = now()
  const id = uuid()
  await database.insert(customShellCrmThreads).values({
    id,
    workspaceId,
    leadId,
    subject: mail.subject,
    subjectKey,
    // A blocked sender's conversation is born closed and read, which is what
    // keeps it out of the default inbox. Nothing is deleted: change the status
    // filter to All and it is there.
    status: blocked ? "closed" : "open",
    lastMessageAt: mail.occurredAt,
    lastDirection: "in",
    messageCount: 0,
    readAt: blocked ? at : null,
    createdAt: at,
    updatedAt: at,
  })
  return { id, created: true }
}

export type RecordInboundResult = {
  /** 1 when a message was written, 0 when the event was a replay or unusable. */
  changed: number
  messageId?: string
}

/**
 * Writes one received email.
 *
 * **A blocked sender's mail is written like anybody else's**, then its thread
 * is closed and stamped read so it never appears in the default inbox. It is
 * not thrown away, because a customer blocked by accident has to be
 * recoverable, and nothing judges spam by score or by content — only the list
 * somebody typed.
 *
 * The workspace comes from the signature on the webhook, the same way every
 * other Resend event finds its workspace, so it is not taken from the address
 * in the payload. The inbound address saved in Settings is what makes mail
 * arrive here at all; it is not consulted again to decide whose mail this is.
 *
 * Nothing is fetched here. The body comes in a second request, which is
 * `fillMessageBody` below, so a slow or broken Resend API cannot stop the mail
 * being recorded.
 */
export async function recordInboundEmail(
  workspaceId: string,
  event: ResendInboundEvent,
  database: CustomShellDb = db
): Promise<RecordInboundResult> {
  const mail = parseInboundEvent(event)
  if (!mail) return { changed: 0 }

  // The replay guard. Resend retries any webhook it was not answered quickly
  // enough, so the same email arrives more than once as a matter of course.
  const [already] = await database
    .select({ id: customShellCrmMessages.id })
    .from(customShellCrmMessages)
    .where(
      and(
        eq(customShellCrmMessages.workspaceId, workspaceId),
        eq(customShellCrmMessages.providerEmailId, mail.providerEmailId)
      )
    )
    .limit(1)
  if (already) return { changed: 0 }

  const blocked = await isSenderBlocked(workspaceId, mail.fromEmail, database)

  const leadId = await leadForAddress(
    workspaceId,
    mail.fromEmail,
    mail.fromName,
    database
  )
  const thread = await threadForMessage(
    workspaceId,
    leadId,
    mail,
    blocked,
    database
  )

  const at = now()
  const messageId = uuid()
  await database.insert(customShellCrmMessages).values({
    id: messageId,
    workspaceId,
    threadId: thread.id,
    direction: "in",
    fromEmail: mail.fromEmail,
    fromName: mail.fromName,
    toEmail: mail.toEmail,
    subject: mail.subject,
    textBody: null,
    htmlBody: null,
    rfcMessageId: mail.rfcMessageId,
    inReplyTo: null,
    providerEmailId: mail.providerEmailId,
    attachments: mail.attachments,
    bodyFetchedAt: null,
    bodyAttempts: 0,
    occurredAt: mail.occurredAt,
    createdAt: at,
  })

  // One statement rather than a read and a write, so two messages arriving at
  // once cannot both read a count of 3 and both write 4.
  await database
    .update(customShellCrmThreads)
    .set({
      messageCount: sql`${customShellCrmThreads.messageCount} + 1`,
      lastMessageAt: mail.occurredAt,
      lastDirection: "in",
      // New mail makes a read thread unread again, which is what puts it back
      // at the top of the inbox in bold. Blocked mail does the opposite: it
      // stays read and the thread stays closed, so a thread this sender had
      // open before the block is shut by their next message rather than
      // raised by it. The snooze date goes with it, the same way
      // `setThreadStatus` clears it, so no closed thread is left holding a
      // date nothing will ever read.
      ...(blocked
        ? { readAt: at, status: "closed" as const, snoozedUntil: null }
        : { readAt: null }),
      updatedAt: at,
    })
    .where(eq(customShellCrmThreads.id, thread.id))

  return { changed: 1, messageId }
}

/**
 * Moves a message to the thread its `In-Reply-To` header points at.
 *
 * Only ever for a message sitting alone in a thread that was just made for it.
 * A reply whose subject was rewritten mid-conversation lands in a thread of its
 * own, and the header is the only thing that can say where it really belongs.
 *
 * It will not move a message out of a conversation that holds anything else.
 * Splitting a thread somebody has already read is worse than one conversation
 * appearing twice.
 */
async function mergeByHeaders(
  workspaceId: string,
  messageId: string,
  inReplyTo: string | null,
  database: CustomShellDb
): Promise<void> {
  const candidates = threadCandidateIds(inReplyTo)
  if (candidates.length === 0) return

  const [message] = await database
    .select({
      id: customShellCrmMessages.id,
      threadId: customShellCrmMessages.threadId,
      fromEmail: customShellCrmMessages.fromEmail,
      occurredAt: customShellCrmMessages.occurredAt,
    })
    .from(customShellCrmMessages)
    .where(eq(customShellCrmMessages.id, messageId))
    .limit(1)
  if (!message) return

  const [currentThread] = await database
    .select({
      id: customShellCrmThreads.id,
      messageCount: customShellCrmThreads.messageCount,
    })
    .from(customShellCrmThreads)
    .where(eq(customShellCrmThreads.id, message.threadId))
    .limit(1)
  if (!currentThread || currentThread.messageCount > 1) return

  const [parent] = await database
    .select({ threadId: customShellCrmMessages.threadId })
    .from(customShellCrmMessages)
    .where(
      and(
        eq(customShellCrmMessages.workspaceId, workspaceId),
        inArray(customShellCrmMessages.rfcMessageId, candidates)
      )
    )
    .limit(1)
  if (!parent || parent.threadId === message.threadId) return

  const at = now()
  // Asked again here, not carried in, because the merge runs from the body
  // fetch rather than from the write. Without it, a blocked sender whose
  // subject changed mid-conversation would have their message moved into the
  // thread they had open before the block, and that move would raise it to
  // unread in the inbox the block exists to keep clear.
  const blocked = await isSenderBlocked(workspaceId, message.fromEmail, database)

  await database
    .update(customShellCrmMessages)
    .set({ threadId: parent.threadId })
    .where(eq(customShellCrmMessages.id, messageId))

  await database
    .update(customShellCrmThreads)
    .set({
      messageCount: sql`${customShellCrmThreads.messageCount} + 1`,
      lastMessageAt: message.occurredAt,
      lastDirection: "in",
      ...(blocked
        ? { readAt: at, status: "closed" as const, snoozedUntil: null }
        : { readAt: null }),
      updatedAt: at,
    })
    .where(eq(customShellCrmThreads.id, parent.threadId))

  // The thread made a moment ago now holds nothing, so it goes rather than
  // sitting in the inbox as an empty row.
  await database
    .delete(customShellCrmThreads)
    .where(eq(customShellCrmThreads.id, currentThread.id))
}

/**
 * Asks Resend for one message's body and writes it down.
 *
 * Answers true when the body landed. A failure counts the attempt, so a
 * message Resend will never answer for stops being asked about after
 * `MAX_BODY_ATTEMPTS`.
 */
export async function fillMessageBody(
  workspaceId: string,
  messageId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [message] = await database
    .select({
      id: customShellCrmMessages.id,
      providerEmailId: customShellCrmMessages.providerEmailId,
      bodyFetchedAt: customShellCrmMessages.bodyFetchedAt,
      bodyAttempts: customShellCrmMessages.bodyAttempts,
      rfcMessageId: customShellCrmMessages.rfcMessageId,
    })
    .from(customShellCrmMessages)
    .where(
      and(
        // The workspace is required, not optional. Without it an admin could
        // hand over any message id in the database and have this fetch it:
        // no body comes back to them, but it spends another business's Resend
        // allowance, counts an attempt against their message, and can move it
        // between their conversations through `mergeByHeaders` below.
        eq(customShellCrmMessages.workspaceId, workspaceId),
        eq(customShellCrmMessages.id, messageId)
      )
    )
    .limit(1)

  if (!message) return false
  if (message.bodyFetchedAt) return true
  if (!message.providerEmailId) return false
  if (message.bodyAttempts >= MAX_BODY_ATTEMPTS) return false

  // Counted before the call, not after, so a request that dies mid-flight
  // still costs an attempt and the retry cannot spin forever.
  await database
    .update(customShellCrmMessages)
    .set({ bodyAttempts: message.bodyAttempts + 1 })
    .where(eq(customShellCrmMessages.id, messageId))

  const apiKey = await getAppEmailApiKey(database, workspaceId)
  const result = await getEmailProvider(apiKey ?? "").receive(
    message.providerEmailId
  )
  if (!result.success || !result.email) return false

  await database
    .update(customShellCrmMessages)
    .set({
      textBody: result.email.text,
      htmlBody: result.email.html,
      inReplyTo: messageIdOf(result.email.inReplyTo),
      // The event's own message id is the one to keep when it had one; the
      // header is the fallback for a provider that did not say.
      rfcMessageId: message.rfcMessageId ?? messageIdOf(result.email.messageId),
      bodyFetchedAt: now(),
    })
    .where(eq(customShellCrmMessages.id, messageId))

  await mergeByHeaders(workspaceId, messageId, result.email.inReplyTo, database)
  return true
}

/**
 * Every message still missing its body, oldest first.
 *
 * A minute old before it is picked up, because the webhook's own fetch is
 * usually still in flight when the next background pass comes round.
 */
export async function pendingBodyMessages(
  limit = 25,
  database: CustomShellDb = db
): Promise<{ id: string; workspaceId: string }[]> {
  return database
    .select({
      id: customShellCrmMessages.id,
      workspaceId: customShellCrmMessages.workspaceId,
    })
    .from(customShellCrmMessages)
    .where(
      and(
        isNull(customShellCrmMessages.bodyFetchedAt),
        lt(customShellCrmMessages.bodyAttempts, MAX_BODY_ATTEMPTS),
        lt(
          customShellCrmMessages.createdAt,
          new Date(now().getTime() - BODY_RETRY_AFTER_MS)
        )
      )
    )
    .orderBy(customShellCrmMessages.createdAt)
    .limit(limit)
}
