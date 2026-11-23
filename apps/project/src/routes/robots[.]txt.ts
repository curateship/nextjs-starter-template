import { createFileRoute } from "@tanstack/react-router"

import {
  publicFileWorkspaceId,
  publicRequestOrigin,
} from "@/server/content/sitemap"

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const workspaceId = await publicFileWorkspaceId()
        if (!workspaceId) return new Response("Not found", { status: 404 })

        const origin = publicRequestOrigin(request)
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /admin",
          "Disallow: /account",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n")

        return new Response(body, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      },
    },
  },
})
