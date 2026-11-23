import { and, asc, eq } from "drizzle-orm"

import { readEmailAddress } from "@/lib/crm/crm"
import { escapeHtml } from "@/lib/email/escape-html"
import { htmlToText } from "@/lib/crm/message-text"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getThread, listThreadMessages } from "@/server/crm/inbox"
import { CRM_NO_INBOUND_ADDRESS, CRM_THREAD_NOT_FOUND } from "@/server/crm/reply"
import { getCrmOutgoingReply } from "@/server/crm/sender"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey } from "@/server/email/settings"
import { customShellCrmThreadForwards } from "@/server/schema"

/**
 * Forwarding a conversation to somebody else, such as a builder the job is
 * subcontracted to (CRM task 20, built in task 36 on 7 Nov 2026): a note of
 * yours, then the whole conversation quoted under it.
 *
 * **It carries a new Message-ID that is in none of the conversation's mail,
 * and no `In-Reply-To`.** That is what keeps their answer out of the
 * customer's conversation: with nothing to thread on, it arrives from a new
 * address as a conversation and a lead of its own.
 *
 * Files are named in the text rather than sent, until replies can carry files.
 * The customer's conversation records the forward as a quiet line.
 */

export const CRM_FORWARD_BAD_ADDRESS = "CRM_FORWARD_BAD_ADDRESS"

export type ForwardResult = { sent: true; forwardId: string } | { sent: false; error: string }

type Quoted = {
  direction: "in" | "out"
  fromEmail: string
  fromName: string | null
  occurredAt: Date
  textBody: string | null
  htmlBody: string | null
  attachments: { filename: string }[]
}

/** One message as it is quoted: who and when, the words, and the files named. */
function quotedLines(message: Quoted): string[] {
  const who = message.fromName?.trim() ? `${message.fromName.trim()} <${message.fromEmail}>` : message.fromEmail
  const words =
    message.textBody?.trim() ||
    (message.htmlBody ? htmlToText(message.htmlBody).trim() : "") ||
    "(The words of this email never arrived.)"
  const files = message.attachments.map((file) => file.filename).filter(Boolean)
  return [
    `From: ${who}`,
    `Date: ${message.occurredAt.toUTCString()}`,
    "",
    words,
    ...(files.length ? ["", `Files: ${files.join(", ")}`] : []),
  ]
}

/** The forward as plain text: the note, a line, then every message oldest first. */
export function forwardText(note: string, subject: string, messages: Quoted[]): string {
  const parts = [
    note.trim(),
    "",
    "---------- Forwarded conversation ----------",
    `Subject: ${subject || "(none)"}`,
  ]
  for (const message of messages) parts.push("", ...quotedLines(message))
  return parts.join("\n").replace(/^\n+/, "")
}

/** The same as HTML, every word escaped, so a forwarded email cannot carry markup. */
export function forwardHtml(note: string, subject: string, messages: Quoted[]): string {
  const paragraph = (text: string) =>
    `<p style="margin:0 0 12px">${escapeHtml(text).replace(/\n/g, "<br />")}</p>`
  const quoted = messages
    .map((message) => paragraph(quotedLines(message).join("\n")))
    .join("")
  return [
    note.trim() ? paragraph(note.trim()) : "",
    `<p style="margin:16px 0 8px;color:#666">---------- Forwarded conversation ----------<br />Subject: ${escapeHtml(subject || "(none)")}</p>`,
    `<div style="border-left:2px solid #ddd;padding-left:12px;color:#444">${quoted}</div>`,
  ].join("")
}

export async function forwardCrmThread(
  workspaceId: string,
  threadId: string,
  input: { to: string; note: string },
  userId: string | null,
  database: CustomShellDb = db
): Promise<ForwardResult> {
  const to = readEmailAddress(input.to)
  if (!to) throw new Error(CRM_FORWARD_BAD_ADDRESS)
  const thread = await getThread(workspaceId, threadId, database)
  if (!thread) throw new Error(CRM_THREAD_NOT_FOUND)
  const outgoing = await getCrmOutgoingReply(workspaceId, database, thread.toAddress)
  if (!outgoing) throw new Error(CRM_NO_INBOUND_ADDRESS)

  const messages = await listThreadMessages(workspaceId, threadId, database)
  const note = input.note.trim().slice(0, 5000)
  const subject = `Fwd: ${thread.subject}`.trim()
  const domain = outgoing.sender.address.split("@")[1] || "crm.local"

  const apiKey = await getAppEmailApiKey(database, workspaceId)
  const result = await getEmailProvider(apiKey ?? "").send({
    from: outgoing.sender.from,
    to,
    subject,
    html: forwardHtml(note, thread.subject, messages),
    text: forwardText(note, thread.subject, messages),
    // A Message-ID of its own and nothing to thread on, so the answer starts
    // a conversation of its own instead of joining the customer's.
    headers: { "Message-ID": `<${uuid()}@${domain}>` },
  })
  if (!result.success) return { sent: false, error: result.error ?? "The email was not accepted" }

  const forwardId = uuid()
  await database.insert(customShellCrmThreadForwards).values({
    id: forwardId,
    workspaceId,
    threadId,
    toEmail: to,
    note,
    forwardedByUserId: userId,
    createdAt: now(),
  })
  return { sent: true, forwardId }
}

/** Every forward of one conversation, oldest first, for its quiet lines. */
export async function listThreadForwards(
  workspaceId: string,
  threadId: string,
  database: CustomShellDb = db
) {
  return database
    .select({
      id: customShellCrmThreadForwards.id,
      toEmail: customShellCrmThreadForwards.toEmail,
      createdAt: customShellCrmThreadForwards.createdAt,
    })
    .from(customShellCrmThreadForwards)
    .where(
      and(
        eq(customShellCrmThreadForwards.workspaceId, workspaceId),
        eq(customShellCrmThreadForwards.threadId, threadId)
      )
    )
    .orderBy(asc(customShellCrmThreadForwards.createdAt))
}
