import { createServerFn } from "@tanstack/react-start"
import { requireUser, isAdmin } from "@/server/auth/security"
import { adminPost, userGet } from "@/server/guards"
import { listPublishedChangelogEntries, serializeChangelogEntry, listChangelogEntries, createChangelogEntry, updateChangelogEntry, deleteChangelogEntries } from "@/server/content/changelog"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

export type ChangelogEntry = {
  id: string
  title: string
  body: string
  publishedAt: string | null
  createdAt: string
}

/**
 * How many published updates the page shows. Everything ever published is in
 * reach of this one number; if a product ever outgrows it, this is where paging
 * would go.
 */
const CHANGELOG_PAGE_LIMIT = 200

export const getChangelogErrorMessage = createErrorMessage(
  {
    CHANGELOG_ENTRY_NOT_FOUND: "That update no longer exists.",
    CHANGELOG_TITLE_REQUIRED: "Give the update a title.",
    CHANGELOG_BODY_REQUIRED: "Write what changed.",
  },
  "We could not load the updates. Please try again."
)

const entryInputSchema = z.object({
  title: z.string().trim().min(1, "CHANGELOG_TITLE_REQUIRED").max(200),
  body: z.string().trim().min(1, "CHANGELOG_BODY_REQUIRED").max(5000),
  published: z.boolean().default(false),
})

export type ChangelogEntryFormInput = z.input<typeof entryInputSchema>

/**
 * What the What's new page reads: published updates only, the same list for
 * everyone — an admin reading it sees exactly what their users see.
 */
const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async (): Promise<{ entries: ChangelogEntry[] }> => {
    const entries = await listPublishedChangelogEntries(CHANGELOG_PAGE_LIMIT)
    return { entries: entries.map(serializeChangelogEntry) }
  })

/**
 * Everything, drafts included, for the page where updates are written. Returns
 * null rather than refusing when the reader is not an admin: that page's route
 * sends them on to What's new, and a refusal would be an error, not an answer.
 */
const listAdminFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ entries: ChangelogEntry[] | null }> => {
    const user = await requireUser()
    if (!isAdmin(user)) return { entries: null }

    const entries = await listChangelogEntries()
    return { entries: entries.map(serializeChangelogEntry) }
  }
)

const createEntryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(entryInputSchema)
  .handler(async ({ data }): Promise<ChangelogEntry> => {
    return serializeChangelogEntry(await createChangelogEntry(data))
  })

const updateEntryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ entryId: z.string().min(1).max(36), entry: entryInputSchema })
  )
  .handler(async ({ data }): Promise<ChangelogEntry> => {
    return serializeChangelogEntry(
      await updateChangelogEntry(data.entryId, data.entry)
    )
  })

const deleteEntriesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      entryIds: z.array(z.string().min(1).max(36)).min(1).max(200),
    })
  )
  .handler(async ({ data }): Promise<{ count: number }> => {
    return deleteChangelogEntries(data.entryIds)
  })

export function loadChangelog() {
  return listFn()
}

export function loadAdminChangelog() {
  return listAdminFn()
}

export function createAdminChangelogEntry(entry: ChangelogEntryFormInput) {
  return createEntryFn({ data: entry })
}

export function updateAdminChangelogEntry(
  entryId: string,
  entry: ChangelogEntryFormInput
) {
  return updateEntryFn({ data: { entryId, entry } })
}

export function deleteAdminChangelogEntries(entryIds: string[]) {
  return deleteEntriesFn({ data: { entryIds } })
}
