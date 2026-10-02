import { createFileRoute } from "@tanstack/react-router"

import { resizedImageResponse } from "@/server/media/resized-image"

/**
 * Smaller copies of public pictures, for `srcset`.
 *
 * Deliberately open to signed-out visitors. Every address it will answer for is
 * already public — the bucket serves the originals straight to any browser that
 * asks — so a session check here would only break the signed-out pages this
 * exists for. `resizedImageResponse` is what keeps it from being a proxy for
 * anything outside that bucket.
 */
export const Route = createFileRoute("/api/v1/media/resized")({
  server: {
    handlers: {
      GET: ({ request }) => resizedImageResponse(request),
    },
  },
})
