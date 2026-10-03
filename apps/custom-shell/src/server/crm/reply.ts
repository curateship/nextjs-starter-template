import { and, desc, eq, isNotNull, sql } from "drizzle-orm"

import { escapeHtml } from "@/lib/email/escape-html"
import { normalizeSubject } from "@/lib/crm/thread-match"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey, getInboundAddress } from "@/server/email/settings"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
} from "@/server/schema"

/** Said when the workspace has no inbound address, so a reply has nowhere to come back to. */
export const CRM_NO_INBOUND_ADDRESS = "CRM_NO_INBOUND_ADDRESS"

/** Said when the conversation is not this workspace's. */
export const CRM_THREAD_NOT_FOUND = "CRM_THREAD_NOT_FOUND"

/**
 * The subject of a reply.
 *
 * "Re:" goes on the front unless one is already there. `normalizeSubject`
 * answers the question, because it is the thing that knows every spelling of
 * a reply prefix.
 */
export function replySubject(subject: string): string {
  const trimmed = subject.trim()
  if (!trimmed) return "Re:"
  if (normalizeSubject(trimmed) !== trimmed.toLowerCase()) return trimmed
  return `Re: ${trimmed}`
}

/**
 * Typed words as an email body.
 *
 * A reply is a person typing, not a newsletter: no blocks, no branding, no
 * unsubscribe footer. A contact's newsletter mail legally needs that footer
 * and a personal answer must not carry one, because it would offer to
 * unsubscribe somebody from a conversation they started.
 *
 * Blank lines become paragraphs and single newlines become breaks, which is
 * what somebody typing into a box expects to come out the other end.
 */
export function replyHtml(body: string): string {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`
    )

  const inner = paragraphs.length > 0 ? paragraphs.join("") : "<p></p>"
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${inner}</div>`
}

export type SendReplyResult =
  | { sent: true; messageId: string }
  | { sent: false; error: string }

/**
 * Sends one reply in a conversation and writes it into the thread.
 *
 * From the workspace's inbound address, so the answer comes back into the CRM.
 * `In-Reply-To` and `References` carry the newest inbound message's Message-ID,
 * which is what makes the reply land in the same thread in the reader's own
 * mail client rather than as a loose email.
 *
 * Nothing is written when the provider refuses. A reply that was not sent must
 * not appear in the conversation as though it had been.
 */
export async function sendCrmReply(
  workspaceId: string,
  threadId: string,
  body: string,
  database: CustomShellDb = db
): Promise<SendReplyResult> {
  const [thread] = await database
    .select({
      id: customShellCrmThreads.id,
      subject: customShellCrmThreads.subject,
      leadId: customShellCrmLeads.id,
      leadEmail: customShellCrmLeads.email,
      leadStage: customShellCrmLeads.stage,
    })
    .from(customShellCrmThreads)
    .innerJoin(
      customShellCrmLeads,
      eq(customShellCrmLeads.id, customShellCrmThreads.leadId)
    )
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        eq(customShellCrmThreads.id, threadId)
      )
    )
    .limit(1)
  if (!thread) throw new Error(CRM_THREAD_NOT_FOUND)

  const from = await getInboundAddress(workspaceId, database)
  if (!from) throw new Error(CRM_NO_INBOUND_ADDRESS)

  // The newest message in the thread that has a Message-ID, whichever way it
  // went. Threading off our own last reply is right when the conversation's
  // most recent mail is one of ours.
  const [parent] = await database
    .select({ rfcMessageId: customShellCrmMessages.rfcMessageId })
    .from(customShellCrmMessages)
    .where(
      and(
        eq(customShellCrmMessages.threadId, threadId),
        isNotNull(customShellCrmMessages.rfcMessageId)
      )
    )
    .orderBy(desc(customShellCrmMessages.occurredAt))
    .limit(1)

  const headers: Record<string, string> = {}
  if (parent?.rfcMessageId) {
    headers["In-Reply-To"] = `<${parent.rfcMessageId}>`
    headers["References"] = `<${parent.rfcMessageId}>`
  }

  const subject = replySubject(thread.subject)
  const apiKey = await getAppEmailApiKey(database, workspaceId)
  const result = await getEmailProvider(apiKey ?? "").send({
    from,
    to: thread.leadEmail,
    subject,
    html: replyHtml(body),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  })

  if (!result.success) {
    return { sent: false, error: result.error ?? "The email was not accepted" }
  }

  const at = now()
  const messageId = uuid()
  await database.insert(customShellCrmMessages).values({
    id: messageId,
    workspaceId,
    threadId,
    direction: "out",
    fromEmail: from,
    fromName: null,
    toEmail: thread.leadEmail,
    subject,
    textBody: body,
    htmlBody: replyHtml(body),
    // Resend's id is not an RFC Message-ID, so it goes in its own column and
    // this stays null. A reply to our reply quotes the real header, which only
    // the inbound side ever sees.
    rfcMessageId: null,
    inReplyTo: parent?.rfcMessageId ?? null,
    providerEmailId: result.messageId ?? null,
    attachments: [],
    // Ours, so there is no second request coming and nothing to retry.
    bodyFetchedAt: at,
    bodyAttempts: 0,
    occurredAt: at,
    createdAt: at,
  })

  await database
    .update(customShellCrmThreads)
    .set({
      messageCount: sql`${customShellCrmThreads.messageCount} + 1`,
      lastMessageAt: at,
      lastDirection: "out",
      // Answering a conversation is reading it.
      readAt: at,
      updatedAt: at,
    })
    .where(eq(customShellCrmThreads.id, threadId))

  // Replying is what "contacted" means, so the stage moves itself. Only from
  // `new`: a lead somebody has already moved to Quoted or Won does not go
  // backwards because another email went out.
  if (thread.leadStage === "new") {
    await database
      .update(customShellCrmLeads)
      .set({ stage: "contacted", updatedAt: at })
      .where(eq(customShellCrmLeads.id, thread.leadId))
  }

  return { sent: true, messageId }
}
