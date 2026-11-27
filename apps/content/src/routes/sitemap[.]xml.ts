import { createFileRoute } from "@tanstack/react-router"

import { appSitemapChunkFiles } from "@/server/app-options"
import {
  publicFileWorkspaceId,
  publicRequestOrigin,
  readSitemapEntries,
  renderSitemapIndexXml,
  renderSitemapXml,
  SITEMAP_PAGES_PART,
  sitemapXmlResponse,
} from "@/server/content/sitemap"

/**
 * One address, two answers.
 *
 * A site whose app serves numbered sitemap files gets an index here, and its
 * pages move to `?part=pages`. Every other site — which is every app that has
 * not set the option — gets exactly the flat file it always got.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const workspaceId = await publicFileWorkspaceId()
        if (!workspaceId) return new Response("Not found", { status: 404 })

        const origin = publicRequestOrigin(request)
        const part = new URL(request.url).searchParams.get("part")

        if (part !== SITEMAP_PAGES_PART) {
          const chunks = await appSitemapChunkFiles(workspaceId)
          if (chunks.length > 0) {
            return sitemapXmlResponse(renderSitemapIndexXml(origin, chunks))
          }
        }

        const entries = await readSitemapEntries(workspaceId)
        return sitemapXmlResponse(renderSitemapXml(origin, entries))
      },
    },
  },
})
