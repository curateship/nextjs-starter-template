import { createFileRoute } from "@tanstack/react-router"

import {
  publicFileWorkspaceId,
  publicRequestOrigin,
  renderSitemapXml,
  sitemapXmlResponse,
} from "@/server/content/sitemap"
import { directoryListingChunkEntries } from "@/server/directory/sitemap"

/**
 * One numbered file of this site's listing addresses.
 *
 * `/sitemap.xml` is the index that points here, once per file. The site comes
 * from the domain that was asked for, the same answer every other public file
 * on this app uses, so one site's listings can never appear under another's.
 */
export const Route = createFileRoute("/directory-sitemaps/$chunk")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const workspaceId = await publicFileWorkspaceId()
        if (!workspaceId) return new Response("Not found", { status: 404 })

        // Only plain digits. "01", "1e3" and "-1" are not file names this route
        // ever wrote, so they are not files this route answers for.
        if (!/^(0|[1-9][0-9]*)$/.test(params.chunk)) {
          return new Response("Not found", { status: 404 })
        }

        const entries = await directoryListingChunkEntries(
          workspaceId,
          Number(params.chunk)
        )
        if (!entries) return new Response("Not found", { status: 404 })

        return sitemapXmlResponse(
          renderSitemapXml(publicRequestOrigin(request), entries)
        )
      },
    },
  },
})
