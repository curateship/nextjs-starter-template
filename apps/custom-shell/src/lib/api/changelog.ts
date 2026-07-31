import { createServerFn } from "@tanstack/react-start"
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

const changelogErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
  CHANGELOG_ENTRY_NOT_FOUND: "That update no longer exists.",
  CHANGELOG_TITLE_REQUIRED: "Give the update a title.",
  CHANGELOG_BODY_REQUIRED: "Write what changed.",
}

export function getChangelogErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(changelogErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? changelogErrorMessages[matched]
    : "We could not load the updates. Please try again."
}

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
const listFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ entries: ChangelogEntry[] }> => {
    const { requireUser } = await import("@/server/security")
    const { listPublishedChangelogEntries, serializeChangelogEntry } =
      await import("@/server/changelog")

    await requireUser()
    const entries = await listPublishedChangelogEntries(CHANGELOG_PAGE_LIMIT)
    return { entries: entries.map(serializeChangelogEntry) }
  }
)

/**
 * Everything, drafts included, for the page where updates are written. Returns
 * null rather than refusing when the reader is not an admin: that page's route
 * sends them on to What's new, and a refusal would be an error, not an answer.
 */
const listAdminFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ entries: ChangelogEntry[] | null }> => {
    const { isAdmin, requireUser } = await import("@/server/security")
    const { listChangelogEntries, serializeChangelogEntry } = await import(
      "@/server/changelog"
    )

    const user = await requireUser()
    if (!isAdmin(user)) return { entries: null }

    const entries = await listChangelogEntries()
    return { entries: entries.map(serializeChangelogEntry) }
  }
)

const createEntryFn = createServerFn({ method: "POST" })
  .inputValidator(entryInputSchema)
  .handler(async ({ data }): Promise<ChangelogEntry> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { createChangelogEntry, serializeChangelogEntry } = await import(
      "@/server/changelog"
    )

    requireAppOrigin()
    await requireAdmin()
    return serializeChangelogEntry(await createChangelogEntry(data))
  })

const updateEntryFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ entryId: z.string().min(1).max(36), entry: entryInputSchema })
  )
  .handler(async ({ data }): Promise<ChangelogEntry> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { updateChangelogEntry, serializeChangelogEntry } = await import(
      "@/server/changelog"
    )

    requireAppOrigin()
    await requireAdmin()
    return serializeChangelogEntry(
      await updateChangelogEntry(data.entryId, data.entry)
    )
  })

const deleteEntriesFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      entryIds: z.array(z.string().min(1).max(36)).min(1).max(200),
    })
  )
  .handler(async ({ data }): Promise<{ count: number }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { deleteChangelogEntries } = await import("@/server/changelog")

    requireAppOrigin()
    await requireAdmin()
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
