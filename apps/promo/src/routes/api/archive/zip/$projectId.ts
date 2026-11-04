import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser, isAdmin } from "@/server/auth/security"
import { projectZip, streamZip } from "@/server/archive/zip"

const NEVER_CACHE = { "cache-control": "no-store" }

/**
 * Download everything as a zip, from the ⋮ after the Archive's tabs
 * (part 31). Signed-in admins only, for their own projects; a guest from
 * Project has no download (Tyler, 4 Nov 2026: "Watch and post only").
 */
export const Route = createFileRoute("/api/archive/zip/$projectId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user || !isAdmin(user)) return Response.json({ error: "Sign in as an admin first." }, { status: 401, headers: NEVER_CACHE })
        const zip = await projectZip(user.id, params.projectId.slice(0, 36))
        if ("refused" in zip) return new Response(zip.refused, { status: 404, headers: { ...NEVER_CACHE, "content-type": "text/plain; charset=utf-8" } })
        return new Response(streamZip(zip.entries), {
          headers: {
            ...NEVER_CACHE,
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${zip.name.replace(/"/g, "")}"`,
            "x-content-type-options": "nosniff",
          },
        })
      },
    },
  },
})
