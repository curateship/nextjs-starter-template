import { createFileRoute } from "@tanstack/react-router"

import { handoffNoteApp } from "@/server/content-app/project-handoff"
import { handoffResponse } from "@/server/social/project-handoff"
import { acceptHandoff, addGuestCookie } from "@/server/video/project-handoff"

/**
 * Where Project sends somebody who pressed "Edit video" or "Open in Promo" on
 * a task, with a stamped note in `?note=`. The note says which it is for, and
 * that part checks it (`workspace/docs/content-app.md`):
 *
 * - **"Edit video"** (`workspace/docs/video-project-guests.md`): a note that
 *   holds signs in a guest for its one video project and opens the guest
 *   editor. Anything else goes to the page that says why, so a copied address
 *   reads "This link has already been used".
 * - **"Open in Promo"** (`workspace/docs/project-guests.md`): a note that
 *   holds signs in a guest for its one project and opens the guest's project
 *   page, and a refused one opens the page that says why.
 *
 * Nothing here needs a session, which is the point: the note is the guard,
 * and its HMAC stamp can't be guessed, so there is nothing to rate-limit.
 * The page lands on an address without the note, so it isn't left in the bar.
 */
function goTo(path: string) {
  return new Response(null, { status: 302, headers: { location: path, "cache-control": "no-store" } })
}

export const Route = createFileRoute("/handoff/project")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const note = new URL(request.url).searchParams.get("note") ?? ""
        if (handoffNoteApp(note) === "promo") return handoffResponse(request)
        const result = await acceptHandoff(note)
        if ("refused" in result) return goTo(`/guest/ended?why=${result.refused}`)
        addGuestCookie(result.token)
        return goTo(`/guest/video-editor/${encodeURIComponent(result.projectId)}`)
      },
    },
  },
})
