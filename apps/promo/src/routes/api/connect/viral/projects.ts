import { createFileRoute } from "@tanstack/react-router"

import { viralProjects } from "@/server/viral-link/connect"
import { answerViral } from "@/server/viral-link/link"

/** The Promo projects Viral's Write a post for Promo lists. The key is the guard. */
export const Route = createFileRoute("/api/connect/viral/projects")({
  server: {
    handlers: {
      GET: ({ request }) => answerViral(request, null, (link) => viralProjects(link)),
    },
  },
})
