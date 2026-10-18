import { createFileRoute } from "@tanstack/react-router"

import { mediaLinkResponse } from "@/server/phones/media-links"

/**
 * A one-time link to a media library file, opened in Safari on an iPhone on
 * the rack so the file can be saved to Photos for a post (part 55 of the
 * phone farm). No sign-in: the phone's Safari has none. What keeps it closed
 * is the token, 32 random bytes that work once within ten minutes; a spent
 * or late one answers 410 Gone, a wrong one 404.
 */
export const Route = createFileRoute("/api/media-link/$token")({
  server: {
    handlers: {
      GET: ({ params }) => mediaLinkResponse(params.token),
    },
  },
})
