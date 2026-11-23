import { createFileRoute } from "@tanstack/react-router"

import { numberedSitemapResponse } from "@/server/directory/sitemap-file-route"
import { eventSitemapFile } from "@/server/events/public"

/** One numbered file of this site's event addresses. `/sitemap.xml` points here. */
export const Route = createFileRoute("/event-sitemaps/$chunk")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        numberedSitemapResponse(request, params.chunk, (workspaceId, chunk) =>
          eventSitemapFile(workspaceId, chunk)
        ),
    },
  },
})
