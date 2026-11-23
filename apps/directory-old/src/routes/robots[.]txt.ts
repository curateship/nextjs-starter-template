import { createFileRoute } from "@tanstack/react-router"

import robots from "@/screens/robots"

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const config = await robots()
        const lines = config.rules.flatMap((rule) => [
          `User-agent: ${rule.userAgent}`,
          ...(rule.allow ? [`Allow: ${rule.allow}`] : []),
          ...(rule.disallow || []).map((path) => `Disallow: ${path}`),
        ])
        if (config.sitemap) lines.push(`Sitemap: ${config.sitemap}`)
        return new Response(`${lines.join("\n")}\n`, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      },
    },
  },
})
