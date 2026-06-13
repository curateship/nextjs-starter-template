import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  idArraySchema,
  idSchema,
  makeSafeErrorMessage,
  nameSchema,
} from "@/lib/api/shared"

import type { ContactListItem, ContactListResponse } from "@/server/contact-lists"

export type { ContactListItem, ContactListResponse }

const listIdSchema = idSchema
const listNameSchema = nameSchema
const contactIdsSchema = idArraySchema

export const getContactListErrorMessage = makeSafeErrorMessage(
  "List request failed.",
  new Set(["List not found"])
)

const listContactListsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContactListResponse> => {
    const { listContactListsForCurrentUser } = await import(
      "@/server/contact-lists"
    )
    return listContactListsForCurrentUser()
  }
)

const createContactListFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: listNameSchema }))
  .handler(async ({ data }): Promise<ContactListItem> => {
    const { createContactListForCurrentUser } = await import(
      "@/server/contact-lists"
    )
    return createContactListForCurrentUser(data.name)
  })

const renameContactListFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ listId: listIdSchema, name: listNameSchema }))
  .handler(async ({ data }): Promise<void> => {
    const { renameContactListForCurrentUser } = await import(
      "@/server/contact-lists"
    )
    return renameContactListForCurrentUser(data.listId, data.name)
  })

const deleteContactListFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ listId: listIdSchema }))
  .handler(async ({ data }): Promise<void> => {
    const { deleteContactListForCurrentUser } = await import(
      "@/server/contact-lists"
    )
    return deleteContactListForCurrentUser(data.listId)
  })

const addContactsToListFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ listId: listIdSchema, contactIds: contactIdsSchema }))
  .handler(async ({ data }): Promise<{ addedCount: number }> => {
    const { addContactsToListForCurrentUser } = await import(
      "@/server/contact-lists"
    )
    return addContactsToListForCurrentUser(data.listId, data.contactIds)
  })

const removeContactsFromListFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ listId: listIdSchema, contactIds: contactIdsSchema }))
  .handler(async ({ data }): Promise<{ removedCount: number }> => {
    const { removeContactsFromListForCurrentUser } = await import(
      "@/server/contact-lists"
    )
    return removeContactsFromListForCurrentUser(data.listId, data.contactIds)
  })

export function listContactLists() {
  return listContactListsFn()
}

export function createContactList(name: string) {
  return createContactListFn({ data: { name } })
}

export function renameContactList(listId: string, name: string) {
  return renameContactListFn({ data: { listId, name } })
}

export function deleteContactList(listId: string) {
  return deleteContactListFn({ data: { listId } })
}

export function addContactsToList(listId: string, contactIds: string[]) {
  return addContactsToListFn({ data: { listId, contactIds } })
}

export function removeContactsFromList(listId: string, contactIds: string[]) {
  return removeContactsFromListFn({ data: { listId, contactIds } })
}
