import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type ContactItem = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  source: string | null
  tags: string[]
  status: string
  created_at: string
}

export type ContactListResponse = {
  contacts: ContactItem[]
  total: number
}

const listContactsSchema = z.object({
  search: z.string().max(255).optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
})

export function getContactsErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Contacts request failed."
}

const listContactsFn = createServerFn({ method: "GET" })
  .inputValidator(listContactsSchema)
  .handler(async ({ data }): Promise<ContactListResponse> => {
    const user = await requireUser()
    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
    const { listContacts } = await import("@/server/contacts")

    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const pageSize = data.pageSize ?? 50
    const { contacts, total } = await listContacts(workspace.id, {
      search: data.search,
      limit: pageSize,
      offset: (data.page ?? 0) * pageSize,
    })

    return {
      contacts: contacts.map((contact) => ({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        source: contact.source,
        tags: contact.tags,
        status: contact.status,
        created_at: contact.createdAt.toISOString(),
      })),
      total,
    }
  })

export function listWorkspaceContacts(input: {
  search?: string
  page?: number
  pageSize?: number
}) {
  return listContactsFn({ data: input })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
