import { createFileRoute } from "@tanstack/react-router"

import { isPromoCaller } from "@/server/video/promo-link"
import { requestableProjects } from "@/server/video/promo-requests"

const NEVER_CACHE = { "cache-control": "no-store" }

/**
 * The Video projects Promo's Ask for a video lists (part 42,
 * `workspace/docs/send-to-promo.md`). The key saved on Settings → Promo is the guard.
 */
export const Route = createFileRoute("/api/connect/promo/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isPromoCaller(request))) {
          return Response.json({ error: "Video does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        return Response.json({ projects: await requestableProjects() }, { headers: NEVER_CACHE })
      },
    },
  },
})
