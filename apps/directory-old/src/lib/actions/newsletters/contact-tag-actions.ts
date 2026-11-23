import { createServerFn } from "@tanstack/react-start"
import { getNewsletterContactTagsImpl, renameNewsletterContactTagImpl, deleteNewsletterContactTagsImpl } from "./contact-tag-actions.server"
import type { NewsletterContactTagFilter } from "./contact-tag-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./contact-tag-actions.server"

export const getNewsletterContactTags = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { filter?: NewsletterContactTagFilter; searchQuery?: string; page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getNewsletterContactTagsImpl(data.siteId, data.options))

export const renameNewsletterContactTag = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; fromTag: string; toTag: string }) => data)
  .handler(async ({ data }) => renameNewsletterContactTagImpl(data.siteId, data.fromTag, data.toTag))

export const deleteNewsletterContactTags = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; tags: string[] }) => data)
  .handler(async ({ data }) => deleteNewsletterContactTagsImpl(data.siteId, data.tags))
