import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CONTACT_SORT_COLUMNS,
  deleteWorkspaceContacts,
  listWorkspaceContacts,
  listWorkspaceTags,
  setContactStatus,
  syncContactsFromUsers,
  upsertWorkspaceContact,
} from "@/server/contacts"
import { adminGet, adminPost } from "@/server/guards"
import { getOrCreateCurrentWorkspace } from "@/server/workspaces"

import { createErrorMessage } from "./error-message"

/** 'bounced' and 'complained' are set by the Resend webhook, never by hand. */
export type ContactStatus =
  | "subscribed"
  | "unsubscribed"
  | "bounced"
  | "complained"

export type ContactItem = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  tags: string[]
  status: ContactStatus
  source: string | null
  /** True when this contact is an account on the app rather than a typed-in address. */
  isAccount: boolean
  created_at: string
}

/**
 * Re-exported as a *type* on purpose. The page needs the column names, and a
 * type disappears at build time — importing the runtime value from `@/server/*`
 * into a component is what drags server code into the browser bundle and breaks
 * hydration across the whole app.
 */
export type { ContactSortColumn } from "@/server/contacts"

export type ContactsPage = {
  contacts: ContactItem[]
  total: number
  tags: string[]
}

const contactErrorMessages: Record<string, string> = {
  EMAIL_REQUIRED: "An email address is the one thing we need.",
  SAVE_FAILED: "We could not save that. Please try again.",
}

export const getContactErrorMessage = createErrorMessage(
  contactErrorMessages,
  "We could not save that change. Please try again."
)

export const getContactLoadErrorMessage = createErrorMessage(
  contactErrorMessages,
  "We could not load your contacts. Please try again."
)

const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(100).optional(),
  // Checked against the fixed list rather than passed through: this names a
  // column, and anything the database is asked to order by has to come from
  // us, never from whatever the browser sent.
  sort: z.enum(CONTACT_SORT_COLUMNS).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})

const idsSchema = z.object({
  contactIds: z.array(z.string().min(1).max(36)).max(500),
})

const upsertSchema = z.object({
  email: z.email(),
  firstName: z.string().trim().max(255).nullable().optional(),
  lastName: z.string().trim().max(255).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(25).optional(),
})

async function currentWorkspaceId(userId: string) {
  return (await getOrCreateCurrentWorkspace(userId)).id
}

const loadContactsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }): Promise<ContactsPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    // Opening the list is what brings it up to date with who has signed up.
    // Before the read, so somebody who joined a minute ago is on the page.
    await syncContactsFromUsers(workspaceId)
    const [{ contacts, total }, tags] = await Promise.all([
      listWorkspaceContacts(workspaceId, data),
      listWorkspaceTags(workspaceId),
    ])
    return {
      total,
      tags,
      contacts: contacts.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        tags: row.tags,
        status: row.status as ContactStatus,
        source: row.source,
        isAccount: row.userId !== null,
        created_at: row.createdAt.toISOString(),
      })),
    }
  })

const saveContactFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(upsertSchema)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const saved = await upsertWorkspaceContact(workspaceId, {
      ...data,
      source: "Added by hand",
    })
    return { id: saved.id }
  })

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    idsSchema.extend({ status: z.enum(["subscribed", "unsubscribed"]) })
  )
  .handler(async ({ data, context }): Promise<{ changed: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      changed: await setContactStatus(
        workspaceId,
        data.contactIds,
        data.status
      ),
    }
  })

const deleteContactsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(idsSchema)
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      deleted: await deleteWorkspaceContacts(workspaceId, data.contactIds),
    }
  })

export function loadContactsPage(
  options: z.input<typeof listSchema> = {}
) {
  return loadContactsPageFn({ data: options })
}

export function saveContact(input: z.input<typeof upsertSchema>) {
  return saveContactFn({ data: input })
}

export function setContactsStatus(
  contactIds: string[],
  status: "subscribed" | "unsubscribed"
) {
  return setStatusFn({ data: { contactIds, status } })
}

export function deleteContacts(contactIds: string[]) {
  return deleteContactsFn({ data: { contactIds } })
}
