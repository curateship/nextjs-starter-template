import { createFileRoute } from "@tanstack/react-router"

import { acceptHandoff, addGuestCookie } from "@/server/video/project-handoff"

/**
 * Where Project sends somebody who pressed "Edit video" on a task, with a
 * stamped note in `?note=` (`workspace/docs/project-guests.md`). A note that
 * holds signs in a guest for its one video project and opens the guest
 * editor. Anything else goes to the page that says why, so a copied address
 * reads "This link has already been used".
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
        const result = await acceptHandoff(note)
        if ("refused" in result) return goTo(`/guest/ended?why=${result.refused}`)
        addGuestCookie(result.token)
        return goTo(`/guest/video-editor/${encodeURIComponent(result.projectId)}`)
      },
    },
  },
})
