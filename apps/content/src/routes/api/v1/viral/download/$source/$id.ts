import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser, isAdmin } from "@/server/auth/security"
import { DOWNLOAD_SOURCES, downloadKeptFile, type DownloadSource } from "@/server/viral/downloads"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * Download to computer (`workspace/docs/vault.md`): the video Viral kept, as
 * a download named after its title. `video` is a saved video's id, from the
 * project page's right panel; `idea` is a vault idea's id. Signed in and an
 * admin, like every Viral door, and the copy must be the asker's own
 * (`src/server/viral/downloads.ts`).
 */
export const Route = createFileRoute("/api/v1/viral/download/$source/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user) return Response.json({ detail: "Sign in first." }, { status: 401, headers: NO_STORE })
        if (!isAdmin(user)) return Response.json({ detail: "Only an admin can do that." }, { status: 403, headers: NO_STORE })
        if (!(DOWNLOAD_SOURCES as readonly string[]).includes(params.source)) {
          return Response.json({ detail: "No such file." }, { status: 404, headers: NO_STORE })
        }
        return downloadKeptFile(user.id, params.source as DownloadSource, params.id)
      },
    },
  },
})
