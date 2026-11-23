import { createServerFn } from "@tanstack/react-start"
import { createOrUpsertContactImpl, bulkImportContactsImpl, updateContactImpl, deleteContactsImpl, getContactsWithStatsImpl, getContactByIdImpl, getContactStatsImpl, getContactEventsImpl, getContactSegmentsImpl, getContactClickedLinksImpl, getContactEngagementOverTimeImpl, unsubscribeContactImpl } from "./contact-actions.server"
import type { CrmContact, ContactFilterGroup } from "./contact-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./contact-actions.server"

export const createOrUpsertContact = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createOrUpsertContactImpl>[0] }) => data)
  .handler(async ({ data }) => createOrUpsertContactImpl(data.input))

export const bulkImportContacts = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  contacts: { email: string; first_name?: string; last_name?: string; tags?: string[]; created_at?: string; last_engaged_at?: string }[]
} }) => data)
  .handler(async ({ data }) => bulkImportContactsImpl(data.input))

export const updateContact = createServerFn({ method: "POST" })
  .inputValidator((data: { contactId: string; updates: { metadata?: Record<string, any>; status?: CrmContact['status'] } }) => data)
  .handler(async ({ data }) => updateContactImpl(data.contactId, data.updates))

export const deleteContacts = createServerFn({ method: "POST" })
  .inputValidator((data: { contactIds: string[] }) => data)
  .handler(async ({ data }) => deleteContactsImpl(data.contactIds))

export const getContactsWithStats = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: {
    filterGroup?: ContactFilterGroup
    searchQuery?: string
    page?: number
    pageSize?: number
  } }) => data)
  .handler(async ({ data }) => getContactsWithStatsImpl(data.siteId, data.options))

export const getContactById = createServerFn({ method: "POST" })
  .inputValidator((data: { contactId: string }) => data)
  .handler(async ({ data }) => getContactByIdImpl(data.contactId))

export const getContactStats = createServerFn({ method: "POST" })
  .inputValidator((data: { contactId: string }) => data)
  .handler(async ({ data }) => getContactStatsImpl(data.contactId))

export const getContactEvents = createServerFn({ method: "POST" })
  .inputValidator((data: { contactId: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data }) => getContactEventsImpl(data.contactId, data.page, data.pageSize))

export const getContactSegments = createServerFn({ method: "POST" })
  .inputValidator((data: { contactId: string }) => data)
  .handler(async ({ data }) => getContactSegmentsImpl(data.contactId))

export const getContactClickedLinks = createServerFn({ method: "POST" })
  .inputValidator((data: { contactId: string }) => data)
  .handler(async ({ data }) => getContactClickedLinksImpl(data.contactId))

export const getContactEngagementOverTime = createServerFn({ method: "POST" })
  .inputValidator((data: { contactId: string }) => data)
  .handler(async ({ data }) => getContactEngagementOverTimeImpl(data.contactId))

export const unsubscribeContact = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; email: string; token: string; newsletterId?: string }) => data)
  .handler(async ({ data }) => unsubscribeContactImpl(data.siteId, data.email, data.token, data.newsletterId))
