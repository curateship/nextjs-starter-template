import { createFileRoute } from "@tanstack/react-router"

import {
  publicFileWorkspaceId,
  publicRequestOrigin,
  readSitemapEntries,
  renderSitemapXml,
} from "@/server/content/sitemap"

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const workspaceId = await publicFileWorkspaceId()
        if (!workspaceId) return new Response("Not found", { status: 404 })

        const entries = await readSitemapEntries(workspaceId)
        return new Response(
          renderSitemapXml(publicRequestOrigin(request), entries),
          { headers: { "Content-Type": "application/xml; charset=utf-8" } }
        )
      },
    },
  },
})
