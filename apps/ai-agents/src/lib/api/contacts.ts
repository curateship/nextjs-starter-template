import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { idArraySchema, idSchema, makeSafeErrorMessage } from "@/lib/api/shared"

import type {
  ContactCallItem,
  ContactDetailResponse,
  ContactItem,
  ContactListResponse,
  ContactNoteItem,
} from "@/server/contacts"
import type {
  ImportContactsResult,
  ImportRowInput,
  ImportSkippedRow,
} from "@/server/contacts-import"

export type {
  ContactCallItem,
  ContactDetailResponse,
  ContactItem,
  ContactListResponse,
  ContactNoteItem,
  ImportContactsResult,
  ImportRowInput,
  ImportSkippedRow,
}

const contactIdSchema = z.object({
  contactId: idSchema,
})

const contactFieldsSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().max(255).nullable(),
  phone: z.string().min(1).max(32),
  email: z.string().max(255).nullable(),
  doNotCall: z.boolean(),
})

export const getContactErrorMessage = makeSafeErrorMessage(
  "Contact request failed.",
  new Set([
    "Contact not found",
    "Invalid phone number",
    "A contact with this phone number already exists",
    "List not found",
  ])
)

const listContactsFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ listId: idSchema.nullable() }).optional()
  )
  .handler(async ({ data }): Promise<ContactListResponse> => {
    const { listContactsForCurrentUser } = await import("@/server/contacts")
    return listContactsForCurrentUser(data?.listId ?? null)
  })

const getContactDetailFn = createServerFn({ method: "GET" })
  .inputValidator(contactIdSchema)
  .handler(async ({ data }): Promise<ContactDetailResponse> => {
    const { getContactDetailForCurrentUser } = await import("@/server/contacts")
    return getContactDetailForCurrentUser(data.contactId)
  })

const createContactFn = createServerFn({ method: "POST" })
  .inputValidator(contactFieldsSchema)
  .handler(async ({ data }): Promise<ContactItem> => {
    const { createContactForCurrentUser } = await import("@/server/contacts")
    return createContactForCurrentUser(data)
  })

const updateContactFn = createServerFn({ method: "POST" })
  .inputValidator(contactFieldsSchema.extend({ contactId: idSchema }))
  .handler(async ({ data }): Promise<ContactItem> => {
    const { updateContactForCurrentUser } = await import("@/server/contacts")
    const { contactId, ...fields } = data
    return updateContactForCurrentUser(contactId, fields)
  })

const bulkDeleteContactsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ contactIds: idArraySchema })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteContactsForCurrentUser } = await import("@/server/contacts")
    return deleteContactsForCurrentUser(data.contactIds)
  })

const updateContactTagsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      contactId: z.string().min(1).max(36),
      tags: z.array(z.string().min(1).max(50)).max(20),
    })
  )
  .handler(async ({ data }): Promise<ContactItem> => {
    const { updateContactTagsForCurrentUser } = await import("@/server/contacts")
    // Dedupe while preserving order.
    return updateContactTagsForCurrentUser(
      data.contactId,
      Array.from(new Set(data.tags))
    )
  })

const importRowSchema = z.object({
  firstName: z.string().max(255),
  lastName: z.string().max(255).nullable(),
  phone: z.string().min(1).max(64),
  email: z.string().max(255).nullable(),
  customFields: z.record(z.string().max(64), z.string().max(2000)),
})

const importContactsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      rows: z.array(importRowSchema).min(1).max(10_000),
      listId: idSchema.nullable(),
      newListName: z.string().min(1).max(255).nullable(),
    })
  )
  .handler(async ({ data }): Promise<ImportContactsResult> => {
    const { importContactsForCurrentUser } = await import(
      "@/server/contacts-import"
    )
    return importContactsForCurrentUser(data)
  })

const createContactNoteFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      contactId: idSchema,
      body: z.string().min(1).max(10_000),
    })
  )
  .handler(async ({ data }): Promise<ContactNoteItem> => {
    const { createContactNoteForCurrentUser } = await import("@/server/contacts")
    return createContactNoteForCurrentUser(data.contactId, data.body)
  })

export type ContactFields = z.infer<typeof contactFieldsSchema>

export function listContacts(listId?: string | null) {
  return listContactsFn({ data: { listId: listId ?? null } })
}

export function getContactDetail(contactId: string) {
  return getContactDetailFn({ data: { contactId } })
}

export function createContact(fields: ContactFields) {
  return createContactFn({ data: fields })
}

export function updateContact(contactId: string, fields: ContactFields) {
  return updateContactFn({ data: { contactId, ...fields } })
}

export function bulkDeleteContacts(contactIds: string[]) {
  return bulkDeleteContactsFn({ data: { contactIds } })
}

export function createContactNote(contactId: string, body: string) {
  return createContactNoteFn({ data: { contactId, body } })
}

export function updateContactTags(contactId: string, tags: string[]) {
  return updateContactTagsFn({ data: { contactId, tags } })
}

export function importContacts(input: {
  rows: ImportRowInput[]
  listId: string | null
  newListName: string | null
}) {
  return importContactsFn({ data: input })
}
