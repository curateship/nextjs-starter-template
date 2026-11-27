import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { CRM_MAX_VALUE_CENTS, type CrmStage } from "@/lib/crm/crm"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { deleteFromR2 } from "@/server/media/storage"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
} from "@/server/schema"

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
  /**
   * The subscriber on the same address, when there is one. Looked up by
   * address, not stored: leads and subscribers are separate lists that may
   * share an address (Tyler, 9 Nov 2026; migration 0111 dropped the link).
   */
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
      contactId: customShellContacts.id,
      createdAt: customShellCrmLeads.createdAt,
    })
    .from(customShellCrmLeads)
    .leftJoin(
      customShellContacts,
      and(
        eq(customShellContacts.workspaceId, customShellCrmLeads.workspaceId),
        sql`lower(${customShellContacts.email}) = lower(${customShellCrmLeads.email})`
      )
    )
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
 * Adds a lead's address to the subscribers ("Add to subscribers"). The lead
 * stays a lead: the two lists are separate and may share an address.
 *
 * Deliberately a button somebody presses. Mail arriving does not do this,
 * because writing to you is not asking for a newsletter. A subscriber already
 * on that address is answered rather than duplicated.
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

  return { contactId }
}

/** One lead as a hand add or a CSV row brings it. */
export type LeadInput = {
  email: string
  name?: string | null
  company?: string | null
  phone?: string | null
  /** A hand add picks one; an import starts every new lead at New. */
  stage?: CrmStage
}

/** Trimmed, cut to the column's width, and null when nothing is left. */
function cleanField(value: string | null | undefined, max: number) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/**
 * Adds leads by hand or from a CSV file (Tyler, 9 Nov 2026: "allow me to add
 * manual leads as well as paste a csv file too just like suvscribers").
 *
 * An address already a lead (whatever its capitals) is not added twice: a
 * name, company or phone in the input fills or replaces theirs, and their
 * stage, deal and conversations stay as they are. A new one starts at the
 * stage given, or New. Nobody is put on the subscriber list; leads and
 * subscribers are separate lists.
 */
export async function addWorkspaceLeads(
  workspaceId: string,
  rows: LeadInput[],
  source: string,
  database: CustomShellDb = db
): Promise<{ added: number; updated: number; unchanged: number; leadIds: string[] }> {
  let added = 0
  let updated = 0
  let unchanged = 0
  const leadIds: string[] = []
  const timestamp = now()
  // The same address twice in one batch is one lead, the later row winning.
  const byEmail = new Map<string, LeadInput>()
  for (const row of rows) {
    const email = row.email.trim().toLowerCase()
    if (email) byEmail.set(email, { ...byEmail.get(email), ...row, email })
  }
  for (const [email, row] of byEmail) {
    const name = cleanField(row.name, 255)
    const company = cleanField(row.company, 255)
    const phone = cleanField(row.phone, 60)
    const [current] = await database
      .select()
      .from(customShellCrmLeads)
      .where(
        and(
          eq(customShellCrmLeads.workspaceId, workspaceId),
          sql`lower(${customShellCrmLeads.email}) = ${email}`
        )
      )
      .limit(1)
    if (!current) {
      const id = uuid()
      await database.insert(customShellCrmLeads).values({
        id,
        workspaceId,
        email,
        name,
        company,
        phone,
        source,
        stage: row.stage ?? "new",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      added += 1
      leadIds.push(id)
      continue
    }
    leadIds.push(current.id)
    const next = {
      name: name ?? current.name,
      company: company ?? current.company,
      phone: phone ?? current.phone,
    }
    if (next.name === current.name && next.company === current.company && next.phone === current.phone) {
      unchanged += 1
      continue
    }
    await database
      .update(customShellCrmLeads)
      .set({ ...next, updatedAt: timestamp })
      .where(eq(customShellCrmLeads.id, current.id))
    updated += 1
  }
  return { added, updated, unchanged, leadIds }
}

/**
 * Moves the picked leads to one stage, from the Leads list's mass select and
 * right-click (9 Nov 2026). Only this site's leads, and only those not
 * already there, count as changed.
 */
export async function setLeadsStage(
  workspaceId: string,
  leadIds: string[],
  stage: CrmStage,
  database: CustomShellDb = db
): Promise<{ changed: number }> {
  if (!leadIds.length) return { changed: 0 }
  const changed = await database
    .update(customShellCrmLeads)
    .set({ stage, updatedAt: now() })
    .where(
      and(
        eq(customShellCrmLeads.workspaceId, workspaceId),
        inArray(customShellCrmLeads.id, leadIds),
        ne(customShellCrmLeads.stage, stage)
      )
    )
    .returning({ id: customShellCrmLeads.id })
  return { changed: changed.length }
}

/**
 * Deletes the picked leads for good, from the Leads list (9 Nov 2026). Their
 * conversations, messages and tags go with them (the tables cascade), and
 * the files those messages kept in storage are removed after. A subscriber
 * on the same address is a separate list and stays.
 */
export async function deleteLeads(
  workspaceId: string,
  leadIds: string[],
  database: CustomShellDb = db
): Promise<{ deleted: number }> {
  if (!leadIds.length) return { deleted: 0 }
  const mine = and(eq(customShellCrmLeads.workspaceId, workspaceId), inArray(customShellCrmLeads.id, leadIds))
  // The stored files, read before the rows that name them are gone.
  const messages = await database
    .select({ attachments: customShellCrmMessages.attachments })
    .from(customShellCrmMessages)
    .innerJoin(customShellCrmThreads, eq(customShellCrmThreads.id, customShellCrmMessages.threadId))
    .innerJoin(customShellCrmLeads, eq(customShellCrmLeads.id, customShellCrmThreads.leadId))
    .where(mine)
  const deleted = await database.delete(customShellCrmLeads).where(mine).returning({ id: customShellCrmLeads.id })
  const keys = messages.flatMap((message) => message.attachments.map((file) => file.storageKey).filter((key): key is string => Boolean(key)))
  // A file that will not delete is left behind, never a reason to fail: the
  // lead is already gone.
  await Promise.all(keys.map((key) => deleteFromR2(key).catch(() => undefined)))
  return { deleted: deleted.length }
}

/**
 * The other way round from `addLeadToContacts`: a subscriber becomes a lead
 * too, from the Subscribers list's right-click (Tyler, 9 Nov 2026: "in
 * subscribers, I should be able to right click and add subscriber to lead as
 * well"). They stay a subscriber. A lead already on that address (whatever its
 * capitals) is returned as it is, never changed or added twice. Null when the
 * subscriber is not this site's.
 */
export async function addContactToLeads(
  workspaceId: string,
  contactId: string,
  database: CustomShellDb = db
): Promise<{ leadId: string; existed: boolean } | null> {
  const [contact] = await database
    .select()
    .from(customShellContacts)
    .where(and(eq(customShellContacts.workspaceId, workspaceId), eq(customShellContacts.id, contactId)))
    .limit(1)
  if (!contact) return null
  const email = contact.email.trim().toLowerCase()
  const [existing] = await database
    .select({ id: customShellCrmLeads.id })
    .from(customShellCrmLeads)
    .where(and(eq(customShellCrmLeads.workspaceId, workspaceId), sql`lower(${customShellCrmLeads.email}) = ${email}`))
    .limit(1)
  if (existing) return { leadId: existing.id, existed: true }
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()
  const { leadIds } = await addWorkspaceLeads(workspaceId, [{ email, name: name || null }], "Subscribers", database)
  return { leadId: leadIds[0]!, existed: false }
}
