import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { SiteSearchResult } from "@/lib/pages/site-search"
import { searchSite } from "@/server/content/search"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export const getSiteSearchErrorMessage = createErrorMessage(
  {},
  "Search could not be loaded. Please try again."
)

const readSiteSearchFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ query: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }): Promise<SiteSearchResult[]> => {
    // The domain chooses the site. A browser-supplied id would let a caller
    // search another site's content by changing one request value.
    const workspaceId = await visitorWorkspaceId()
    if (!workspaceId) return []
    return searchSite(workspaceId, data.query)
  })

export function loadSiteSearch(query: string) {
  return readSiteSearchFn({ data: { query } })
}
