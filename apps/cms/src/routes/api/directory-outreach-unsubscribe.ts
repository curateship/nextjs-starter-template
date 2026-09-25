import { createFileRoute } from "@tanstack/react-router"

import { handleOutreachOptOut } from "@/server/directory/outreach"

/** Signed links work without a session; the signature limits the change to one address. */
export const Route = createFileRoute("/api/directory-outreach-unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => handleOutreachOptOut(request),
      POST: ({ request }) => handleOutreachOptOut(request),
    },
  },
})
