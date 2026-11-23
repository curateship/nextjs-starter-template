import { createServerFn } from "@tanstack/react-start"
import { getAudienceCountImpl } from "./audience-sync-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./audience-sync-actions.server"

export const getAudienceCount = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; audienceFilter: { segment_id?: string; tags?: string[]; sources?: string[] } }) => data)
  .handler(async ({ data }) => getAudienceCountImpl(data.siteId, data.audienceFilter))
