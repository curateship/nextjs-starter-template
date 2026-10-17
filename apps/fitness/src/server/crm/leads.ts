import { and, eq, sql } from "drizzle-orm"

import { CRM_MAX_VALUE_CENTS, type CrmStage } from "@/lib/crm/crm"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellContacts, customShellCrmLeads } from "@/server/schema"

export type LeadDetail = {
  id: string
  email: string
  name: string | null
  company: string | null
  phone: string | null
  source: string | null
  stage: CrmStage
  valueCents: number
  followUpAt: Date | null
  followUpNote: string | null
  /** The newsletter contact they are, when they are one. */
  contactId: string | null
  createdAt: Date
}

/** One lead, or null when the id is not this workspace's. */
export async function getLead(
  workspaceId: string,
  leadId: string,
  database: CustomShellDb = db
): Promise<LeadDetail | null> {
  const [row] = await database
    .select({
      id: customShellCrmLeads.id,
      email: customShellCrmLeads.email,
      name: customShellCrmLeads.name,
      company: customShellCrmLeads.company,
      phone: customShellCrmLeads.phone,
      source: customShellCrmLeads.source,
      stage: customShellCrmLeads.stage,
      valueCents: customShellCrmLeads.valueCents,
      followUpAt: customShellCrmLeads.followUpAt,
      followUpNote: customShellCrmLeads.followUpNote,
      contactId: customShellCrmLeads.contactId,
      createdAt: customShellCrmLeads.createdAt,
    })
    .from(customShellCrmLeads)
    .where(
      and(
        eq(customShellCrmLeads.workspaceId, workspaceId),
        eq(customShellCrmLeads.id, leadId)
      )
    )
    .limit(1)
  return row ?? null
}

export type LeadEdit = {
  name?: string | null
  company?: string | null
  phone?: string | null
  stage?: CrmStage
  valueCents?: number
  followUpAt?: Date | null
  followUpNote?: string | null
}

/**
 * Changes one lead, writing only the fields that were sent.
 *
 * The panel saves a field at a time on purpose, so two people editing the same
 * lead cannot have one of them send a whole stale record over the other's
 * change. An undefined field here is "not mentioned", not "set to nothing".
 */
export async function updateLead(
  workspaceId: string,
  leadId: string,
  edit: LeadEdit,
  database: CustomShellDb = db
): Promise<boolean> {
  const values: Record<string, unknown> = { updatedAt: now() }

  if (edit.name !== undefined) values.name = edit.name
  if (edit.company !== undefined) values.company = edit.company
  if (edit.phone !== undefined) values.phone = edit.phone
  if (edit.stage !== undefined) values.stage = edit.stage
  if (edit.valueCents !== undefined) {
    values.valueCents = Math.max(
      0,
      Math.min(CRM_MAX_VALUE_CENTS, Math.round(edit.valueCents))
    )
  }
  if (edit.followUpNote !== undefined) values.followUpNote = edit.followUpNote
  if (edit.followUpAt !== undefined) {
    values.followUpAt = edit.followUpAt
    // A new chase date has not been mentioned yet, so the stamp that stops the
    // notice firing twice is cleared with it. Without this, moving a date
    // forward would never be chased again.
    values.followUpNotifiedAt = null
  }

  const changed = await database
    .update(customShellCrmLeads)
    .set(values)
    .where(
      and(
        eq(customShellCrmLeads.workspaceId, workspaceId),
        eq(customShellCrmLeads.id, leadId)
      )
    )
    .returning({ id: customShellCrmLeads.id })
  return changed.length > 0
}

/**
 * Puts a lead on the newsletter list, which is the one way a contact is ever
 * made from inbound mail.
 *
 * Deliberately a button somebody presses. Mail arriving does not do this,
 * because writing to you is not asking for a newsletter.
 *
 * A contact already on that address is linked rather than duplicated — the
 * contacts table's own unique index would refuse a second one anyway.
 */
export async function addLeadToContacts(
  workspaceId: string,
  leadId: string,
  database: CustomShellDb = db
): Promise<{ contactId: string } | null> {
  const lead = await getLead(workspaceId, leadId, database)
  if (!lead) return null
  if (lead.contactId) return { contactId: lead.contactId }

  const email = lead.email.toLowerCase()
  const [existing] = await database
    .select({ id: customShellContacts.id })
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        sql`lower(${customShellContacts.email}) = ${email}`
      )
    )
    .limit(1)

  const at = now()
  let contactId = existing?.id

  if (!contactId) {
    contactId = uuid()
    // The lead's name is one field and a contact's is two. Everything before
    // the first space is the first name, which is as much as a From header can
    // honestly be split into.
    const parts = lead.name?.trim().split(/\s+/) ?? []
    await database.insert(customShellContacts).values({
      id: contactId,
      workspaceId,
      email: lead.email,
      firstName: parts.length > 0 ? parts[0] : null,
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
      source: "CRM",
      status: "subscribed",
      createdAt: at,
      updatedAt: at,
    })
  }

  await database
    .update(customShellCrmLeads)
    .set({ contactId, updatedAt: at })
    .where(eq(customShellCrmLeads.id, leadId))

  return { contactId }
}
