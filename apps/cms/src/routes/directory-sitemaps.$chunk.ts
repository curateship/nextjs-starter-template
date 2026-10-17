import { createFileRoute } from "@tanstack/react-router"

import { directoryListingChunkEntries } from "@/server/directory/sitemap"
import { numberedSitemapResponse } from "@/server/directory/sitemap-file-route"

/** One numbered file of this site's listing addresses. `/sitemap.xml` points here. */
export const Route = createFileRoute("/directory-sitemaps/$chunk")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        numberedSitemapResponse(request, params.chunk, (workspaceId, chunk) =>
          directoryListingChunkEntries(workspaceId, chunk)
        ),
    },
  },
})
