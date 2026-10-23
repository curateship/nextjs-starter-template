import { createFileRoute } from "@tanstack/react-router"

import { numberedSitemapResponse } from "@/server/directory/sitemap-file-route"
import { postSitemapFile } from "@/server/posts/public"

/** One numbered file of this site's post addresses. `/sitemap.xml` points here. */
export const Route = createFileRoute("/post-sitemaps/$chunk")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        numberedSitemapResponse(request, params.chunk, (workspaceId, chunk) =>
          postSitemapFile(workspaceId, chunk)
        ),
    },
  },
})
