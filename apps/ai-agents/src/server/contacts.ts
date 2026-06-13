import { and, desc, eq, inArray } from "drizzle-orm"
import { parsePhoneNumberFromString } from "libphonenumber-js"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiAgentsCalls,
  aiAgentsContactListMembers,
  aiAgentsContactNotes,
  aiAgentsContacts,
  type AiAgentsContact,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type ContactItem = {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  email: string | null
  custom_fields: Record<string, string>
  tags: string[]
  do_not_call: boolean
  created_at: string
  updated_at: string
}

export type ContactListResponse = {
  contacts: ContactItem[]
}

export type ContactNoteItem = {
  id: string
  body: string
  created_at: string
}

export type ContactCallItem = {
  id: string
  direction: string
  status: string
  started_at: string | null
  duration_seconds: number | null
  summary: string | null
  created_at: string
}

export type ContactDetailResponse = {
  contact: ContactItem
  notes: ContactNoteItem[]
  calls: ContactCallItem[]
}

export type ContactFieldsInput = {
  firstName: string
  lastName: string | null
  phone: string
  email: string | null
  doNotCall: boolean
}

function serializeContact(row: AiAgentsContact): ContactItem {
  return {
    id: row.id,
    first_name: row.firstName,
    last_name: row.lastName,
    phone: row.phone,
    email: row.email,
    custom_fields: (row.customFields ?? {}) as Record<string, string>,
    tags: row.tags ?? [],
    do_not_call: row.doNotCall,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

// Normalizes any reasonable phone input to E.164 (the storage + dialing
// format voice providers require). Throws on numbers that can't be parsed.
export function normalizePhone(input: string): string {
  const defaultCountry = (process.env.AI_AGENTS_DEFAULT_COUNTRY || "US") as
    | "US"
    | undefined
  const parsed = parsePhoneNumberFromString(input, defaultCountry)
  if (!parsed || !parsed.isValid()) {
    throw new Error("Invalid phone number")
  }
  return parsed.number
}

// The {{variable}} map a call's assistant receives for personalization.
// This is the contract documented in the agent editor — keep them in sync.
export function buildContactVariables(
  contact: AiAgentsContact
): Record<string, string> {
  return {
    first_name: contact.firstName,
    last_name: contact.lastName ?? "",
    phone: contact.phone,
    email: contact.email ?? "",
    ...((contact.customFields ?? {}) as Record<string, string>),
  }
}

// Optionally filtered to the members of one contact list.
export async function listContactsForCurrentUser(
  listId?: string | null
): Promise<ContactListResponse> {
  const { workspace } = await requireUserWorkspace()
  if (listId) {
    const rows = await db
      .select({ contact: aiAgentsContacts })
      .from(aiAgentsContacts)
      .innerJoin(
        aiAgentsContactListMembers,
        and(
          eq(aiAgentsContactListMembers.contactId, aiAgentsContacts.id),
          eq(aiAgentsContactListMembers.listId, listId)
        )
      )
      .where(eq(aiAgentsContacts.workspaceId, workspace.id))
      .orderBy(desc(aiAgentsContacts.createdAt))
    return { contacts: rows.map(({ contact }) => serializeContact(contact)) }
  }
  const rows = await db
    .select()
    .from(aiAgentsContacts)
    .where(eq(aiAgentsContacts.workspaceId, workspace.id))
    .orderBy(desc(aiAgentsContacts.createdAt))
  return { contacts: rows.map(serializeContact) }
}

// Replaces the contact's tag set (already deduped/trimmed by the API layer).
export async function updateContactTagsForCurrentUser(
  contactId: string,
  tags: string[]
): Promise<ContactItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const [row] = await db
    .update(aiAgentsContacts)
    .set({ tags, updatedAt: now() })
    .where(
      and(
        eq(aiAgentsContacts.workspaceId, workspace.id),
        eq(aiAgentsContacts.id, contactId)
      )
    )
    .returning()
  if (!row) {
    throw new Error("Contact not found")
  }
  return serializeContact(row)
}

// Contact plus its activity timeline (notes and call history).
export async function getContactDetailForCurrentUser(
  contactId: string
): Promise<ContactDetailResponse> {
  const { workspace } = await requireUserWorkspace()
  const [row] = await db
    .select()
    .from(aiAgentsContacts)
    .where(
      and(
        eq(aiAgentsContacts.workspaceId, workspace.id),
        eq(aiAgentsContacts.id, contactId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("Contact not found")
  }

  const noteRows = await db
    .select()
    .from(aiAgentsContactNotes)
    .where(eq(aiAgentsContactNotes.contactId, contactId))
    .orderBy(desc(aiAgentsContactNotes.createdAt))

  const callRows = await db
    .select()
    .from(aiAgentsCalls)
    .where(eq(aiAgentsCalls.contactId, contactId))
    .orderBy(desc(aiAgentsCalls.createdAt))

  return {
    contact: serializeContact(row),
    notes: noteRows.map((note) => ({
      id: note.id,
      body: note.body,
      created_at: note.createdAt.toISOString(),
    })),
    calls: callRows.map((call) => ({
      id: call.id,
      direction: call.direction,
      status: call.status,
      started_at: call.startedAt ? call.startedAt.toISOString() : null,
      duration_seconds: call.durationSeconds,
      summary: call.summary,
      created_at: call.createdAt.toISOString(),
    })),
  }
}

export async function createContactForCurrentUser(
  input: ContactFieldsInput
): Promise<ContactItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const phone = normalizePhone(input.phone)
  const createdAt = now()
  try {
    const [row] = await db
      .insert(aiAgentsContacts)
      .values({
        id: uuid(),
        workspaceId: workspace.id,
        firstName: input.firstName,
        lastName: input.lastName,
        phone,
        email: input.email,
        doNotCall: input.doNotCall,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    return serializeContact(row)
  } catch (error) {
    throw translateUniquePhoneError(error)
  }
}

export async function updateContactForCurrentUser(
  contactId: string,
  input: ContactFieldsInput
): Promise<ContactItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const phone = normalizePhone(input.phone)
  try {
    const [row] = await db
      .update(aiAgentsContacts)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        phone,
        email: input.email,
        doNotCall: input.doNotCall,
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiAgentsContacts.workspaceId, workspace.id),
          eq(aiAgentsContacts.id, contactId)
        )
      )
      .returning()
    if (!row) {
      throw new Error("Contact not found")
    }
    return serializeContact(row)
  } catch (error) {
    throw translateUniquePhoneError(error)
  }
}

export async function deleteContactsForCurrentUser(
  contactIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const deleted = await db
    .delete(aiAgentsContacts)
    .where(
      and(
        eq(aiAgentsContacts.workspaceId, workspace.id),
        inArray(aiAgentsContacts.id, contactIds)
      )
    )
    .returning({ id: aiAgentsContacts.id })
  return { deletedCount: deleted.length }
}

export async function createContactNoteForCurrentUser(
  contactId: string,
  body: string
): Promise<ContactNoteItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  // Ensure the contact belongs to this workspace before attaching a note.
  const [contact] = await db
    .select({ id: aiAgentsContacts.id })
    .from(aiAgentsContacts)
    .where(
      and(
        eq(aiAgentsContacts.workspaceId, workspace.id),
        eq(aiAgentsContacts.id, contactId)
      )
    )
    .limit(1)
  if (!contact) {
    throw new Error("Contact not found")
  }
  const [row] = await db
    .insert(aiAgentsContactNotes)
    .values({
      id: uuid(),
      workspaceId: workspace.id,
      contactId,
      body,
      createdAt: now(),
    })
    .returning()
  return { id: row.id, body: row.body, created_at: row.createdAt.toISOString() }
}

// Maps the workspace+phone unique violation to a user-readable message.
function translateUniquePhoneError(error: unknown): Error {
  if (
    error instanceof Error &&
    error.message.includes("contacts_workspace_phone_unique")
  ) {
    return new Error("A contact with this phone number already exists")
  }
  return error instanceof Error ? error : new Error(String(error))
}
