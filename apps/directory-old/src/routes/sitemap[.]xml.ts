import { createFileRoute } from "@tanstack/react-router"

import { GET } from "@/screens/sitemap.xml/route"

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => GET(),
    },
  },
})
