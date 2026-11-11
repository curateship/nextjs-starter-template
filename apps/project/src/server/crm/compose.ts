import { and, eq, sql } from "drizzle-orm"

import { readEmailAddress } from "@/lib/crm/crm"
import { normalizeSubject } from "@/lib/crm/thread-match"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { replyHtml, replyText, CRM_NO_INBOUND_ADDRESS } from "@/server/crm/reply"
import { getCrmOutgoingReply } from "@/server/crm/sender"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey } from "@/server/email/settings"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
} from "@/server/schema"

/**
 * Starting a conversation with somebody who has not written first (CRM task
 * 15, built in task 36 on 7 Nov 2026): the New email button in the inbox's
 * header. The CRM could only ever answer before this. Half of a small
 * business's work comes the other way round: a number on a card, a name from
 * a friend.
 *
 * **Nothing is written when the provider refuses.** The mail goes out first,
 * and the lead, the conversation and the message are written only after. A
 * stranger whose first email never left is not a lead.
 *
 * **An address that already has a lead joins that lead.** The unique index on
 * the lead's lowered address means a second lead cannot exist, and two
 * records for one person would split their mail.
 *
 * **Adding a lead never writes a contact.** A lead is an address, not a
 * newsletter subscriber. Add to contacts is still the only way onto the list.
 */

export const CRM_COMPOSE_BAD_ADDRESS = "CRM_COMPOSE_BAD_ADDRESS"

/** Where a lead started by hand came from, so it never reads as "Email". */
export const HAND_ADDED_SOURCE = "Added by hand"

export type StartConversationInput = {
  to: string
  /** Their name, when known. Kept on a new lead; an existing one keeps its own. */
  name?: string
  subject: string
  body: string
  /** Which of the site's addresses it goes out from; the first one when unsaid. */
  fromAddress?: string | null
}

export type StartConversationResult =
  | { sent: true; threadId: string; leadId: string; leadExisted: boolean }
  | { sent: false; error: string }

/** The site's own domain for a Message-ID, from the address it goes out from. */
function messageIdFor(address: string) {
  const domain = address.split("@")[1] || "crm.local"
  return `${uuid()}@${domain}`
}

export async function startCrmConversation(
  workspaceId: string,
  input: StartConversationInput,
  database: CustomShellDb = db
): Promise<StartConversationResult> {
  const to = readEmailAddress(input.to)
  if (!to) throw new Error(CRM_COMPOSE_BAD_ADDRESS)
  const subject = input.subject.trim().slice(0, 2000)
  const body = input.body.trim()

  const outgoing = await getCrmOutgoingReply(workspaceId, database, input.fromAddress)
  if (!outgoing) throw new Error(CRM_NO_INBOUND_ADDRESS)
  const { sender, signature } = outgoing

  // Its own Message-ID, so their answer threads back by header. If the
  // provider puts its own in place of this one, the answer still joins: the
  // same person writing about the same subject within 30 days is the same
  // conversation (`threadForMessage` in `inbound.ts`).
  const rfcMessageId = messageIdFor(sender.address)
  const apiKey = await getAppEmailApiKey(database, workspaceId)
  const result = await getEmailProvider(apiKey ?? "").send({
    from: sender.from,
    to,
    subject,
    html: replyHtml(body, signature, null),
    text: replyText(body, signature, null),
    headers: { "Message-ID": `<${rfcMessageId}>` },
  })
  if (!result.success) {
    return { sent: false, error: result.error ?? "The email was not accepted" }
  }

  const at = now()
  const [existing] = await database
    .select({ id: customShellCrmLeads.id, stage: customShellCrmLeads.stage })
    .from(customShellCrmLeads)
    .where(
      and(
        eq(customShellCrmLeads.workspaceId, workspaceId),
        sql`lower(${customShellCrmLeads.email}) = ${to}`
      )
    )
    .limit(1)

  let leadId = existing?.id
  if (!leadId) {
    leadId = uuid()
    await database.insert(customShellCrmLeads).values({
      id: leadId,
      workspaceId,
      email: to,
      name: input.name?.trim().slice(0, 255) || null,
      // Written to, so already contacted.
      stage: "contacted",
      source: HAND_ADDED_SOURCE,
      createdAt: at,
      updatedAt: at,
    })
  } else if (existing?.stage === "new") {
    await database
      .update(customShellCrmLeads)
      .set({ stage: "contacted", updatedAt: at })
      .where(eq(customShellCrmLeads.id, leadId))
  }

  const threadId = uuid()
  await database.insert(customShellCrmThreads).values({
    id: threadId,
    workspaceId,
    leadId,
    subject,
    subjectKey: normalizeSubject(subject).slice(0, 500),
    status: "open",
    toAddress: sender.address,
    lastMessageAt: at,
    lastDirection: "out",
    messageCount: 1,
    // Ours, so there is nothing unread in it.
    readAt: at,
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(customShellCrmMessages).values({
    id: uuid(),
    workspaceId,
    threadId,
    direction: "out",
    fromEmail: sender.address,
    fromName: sender.name || null,
    toEmail: to,
    subject,
    textBody: body,
    htmlBody: replyHtml(body, signature, null),
    rfcMessageId,
    inReplyTo: null,
    providerEmailId: result.messageId ?? null,
    attachments: [],
    bodyFetchedAt: at,
    bodyAttempts: 0,
    occurredAt: at,
    createdAt: at,
  })

  return { sent: true, threadId, leadId, leadExisted: Boolean(existing) }
}
