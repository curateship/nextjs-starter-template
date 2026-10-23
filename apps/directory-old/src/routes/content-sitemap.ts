import { createFileRoute } from "@tanstack/react-router"

import { GET } from "@/screens/content-sitemap/route"

export const Route = createFileRoute("/content-sitemap")({
  server: {
    handlers: {
      GET: () => GET(),
    },
  },
})
