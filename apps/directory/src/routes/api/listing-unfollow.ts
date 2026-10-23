import { createFileRoute } from "@tanstack/react-router"

import { handleUnfollowLink } from "@/server/promotions/follows"

/**
 * The one-tap unfollow link at the foot of every follow email. Signed links
 * work without a session; the signature limits the change to one follow.
 */
export const Route = createFileRoute("/api/listing-unfollow")({
  server: {
    handlers: {
      GET: ({ request }) => handleUnfollowLink(request),
      POST: ({ request }) => handleUnfollowLink(request),
    },
  },
})
