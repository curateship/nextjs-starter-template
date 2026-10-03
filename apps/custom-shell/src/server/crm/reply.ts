import { and, desc, eq, isNotNull, sql } from "drizzle-orm"

import { escapeHtml } from "@/lib/email/escape-html"
import { normalizeSubject } from "@/lib/crm/thread-match"
import {
  quoteAsHtml,
  quoteAsText,
  quotedMessage,
  type QuotableMessage,
  type QuotedMessage,
} from "@/lib/crm/message-text"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getCrmOutgoingReply } from "@/server/crm/sender"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey } from "@/server/email/settings"
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

/** Typed lines as HTML paragraphs, escaped, with single newlines as breaks. */
function typedParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`
    )
}

/**
 * Typed words as an email body, with the workspace's signature under them.
 *
 * A reply is a person typing, not a newsletter: no blocks, no branding, no
 * unsubscribe footer. A contact's newsletter mail legally needs that footer
 * and a personal answer must not carry one, because it would offer to
 * unsubscribe somebody from a conversation they started. The signature obeys
 * the same rule, which is why it is the person's own plain typing and not the
 * newsletter's branded frame from `server/email/branding.ts`.
 *
 * Blank lines become paragraphs and single newlines become breaks, which is
 * what somebody typing into a box expects to come out the other end. The
 * signature is escaped exactly like the body, so `<b>` arrives as the four
 * characters somebody typed rather than turning the rest of the mail bold.
 *
 * A blank signature adds nothing at all: no rule, no gap, and a mail
 * identical to the one sent before there was a signature setting.
 */
export function replyHtml(
  body: string,
  signature = "",
  quote: QuotedMessage | null = null
): string {
  const paragraphs = typedParagraphs(body)
  const inner = paragraphs.length > 0 ? paragraphs.join("") : "<p></p>"

  const signed = typedParagraphs(signature)
  // A hairline rather than a border on the signature block: a `<hr>` is the
  // one separator every mail client draws the same way, and Outlook ignores
  // most of what else could draw this line.
  const sign =
    signed.length > 0
      ? `<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0 16px" />${signed.join("")}`
      : ""

  // Words, then signature, then the quote, which is the order Gmail and
  // Outlook both use. The signature belongs to what was just written, so it
  // stays with it rather than sitting below somebody else's message.
  const quoted = quote ? quoteAsHtml(quote) : ""

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${inner}${sign}${quoted}</div>`
}

/**
 * The same reply as plain text, for a reader that does not draw HTML.
 *
 * Mail carries both parts and they have to say the same thing, or somebody
 * reading the text one sees a message that stops before the phone number. The
 * rule the HTML draws becomes `--`, which is the line mail clients have
 * understood as the start of a signature since long before HTML mail.
 */
export function replyText(
  body: string,
  signature = "",
  quote: QuotedMessage | null = null
): string {
  const typed = body.replace(/\r\n/g, "\n").trim()
  const signed = signature.replace(/\r\n/g, "\n").trim()
  const withSignature = signed ? `${typed}\n\n-- \n${signed}` : typed
  return quote ? `${withSignature}\n\n${quoteAsText(quote)}` : withSignature
}

/**
 * The newest message that arrived in this conversation, for the quote.
 *
 * Only inbound: quoting our own last reply back at somebody would show them
 * their own copy of what we already sent. Answers an empty message rather than
 * null, so a conversation with nothing inbound in it simply quotes nothing.
 */
async function newestInboundMessage(
  workspaceId: string,
  threadId: string,
  database: CustomShellDb
): Promise<QuotableMessage> {
  const [message] = await database
    .select({
      fromName: customShellCrmMessages.fromName,
      fromEmail: customShellCrmMessages.fromEmail,
      textBody: customShellCrmMessages.textBody,
      htmlBody: customShellCrmMessages.htmlBody,
      occurredAt: customShellCrmMessages.occurredAt,
    })
    .from(customShellCrmMessages)
    .where(
      and(
        // The thread was already proved to be this workspace's, so this is
        // belt and braces. It costs nothing and it means the words that go
        // into somebody's mail can only ever have come from their own tenant.
        eq(customShellCrmMessages.workspaceId, workspaceId),
        eq(customShellCrmMessages.threadId, threadId),
        eq(customShellCrmMessages.direction, "in")
      )
    )
    .orderBy(desc(customShellCrmMessages.occurredAt))
    .limit(1)

  return (
    message ?? {
      fromName: null,
      fromEmail: "",
      textBody: null,
      htmlBody: null,
      occurredAt: null,
    }
  )
}

export type SendReplyResult =
  | {
      sent: true
      messageId: string
      /**
       * True when the conversation had been closed or snoozed and this reply
       * put it back in the inbox. The screen says so: a status changing under
       * somebody without a word is its own surprise.
       */
      reopened: boolean
    }
  | { sent: false; error: string }

/**
 * Sends one reply in a conversation and writes it into the thread.
 *
 * From the workspace's inbound address, so the answer comes back into the CRM,
 * under the name `getCrmOutgoingReply` works out.
 *
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
      status: customShellCrmThreads.status,
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

  const outgoing = await getCrmOutgoingReply(workspaceId, database)
  if (!outgoing) throw new Error(CRM_NO_INBOUND_ADDRESS)
  const { sender, signature, quoteReplies } = outgoing

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

  // The newest message that came IN, which is the one being answered. Read
  // only when the workspace quotes, so the switch off costs nothing.
  const quote = quoteReplies
    ? quotedMessage(
        await newestInboundMessage(workspaceId, threadId, database)
      )
    : null

  const headers: Record<string, string> = {}
  if (parent?.rfcMessageId) {
    headers["In-Reply-To"] = `<${parent.rfcMessageId}>`
    headers["References"] = `<${parent.rfcMessageId}>`
  }

  const subject = replySubject(thread.subject)
  const apiKey = await getAppEmailApiKey(database, workspaceId)
  const result = await getEmailProvider(apiKey ?? "").send({
    from: sender.from,
    to: thread.leadEmail,
    subject,
    html: replyHtml(body, signature, quote),
    text: replyText(body, signature, quote),
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
    fromEmail: sender.address,
    // What went out, so the record of the reply names the same sender the
    // customer saw rather than only the address.
    fromName: sender.name || null,
    toEmail: thread.leadEmail,
    subject,
    // The typed words only, with no signature. This is what the conversation
    // on screen draws, and the same lines repeated under every bubble you ever
    // sent would bury the words. `htmlBody` below keeps what actually went out.
    textBody: body,
    htmlBody: replyHtml(body, signature, quote),
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

  // It had been closed or snoozed, and answering it is still talking.
  const reopened = thread.status !== "open"

  await database
    .update(customShellCrmThreads)
    .set({
      messageCount: sql`${customShellCrmThreads.messageCount} + 1`,
      lastMessageAt: at,
      lastDirection: "out",
      // Answering a conversation is reading it.
      readAt: at,
      // If you are still talking, it is not done. A closed conversation
      // answered from a search would otherwise stay invisible in an inbox that
      // shows open ones, and their answer would arrive into a thread nobody
      // looks at. The snooze date goes with it, or the thread would fall
      // asleep again on a date that no longer means anything.
      //
      // Here rather than in an update of its own, so there is no moment where
      // the reply exists and the status is stale.
      ...(reopened ? { status: "open" as const, snoozedUntil: null } : {}),
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

  return { sent: true, messageId, reopened }
}
