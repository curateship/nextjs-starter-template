import { createFileRoute } from "@tanstack/react-router"

import { handleDirectoryVerifyRequest } from "@/server/directory/verify-link"

/**
 * The "confirm your email address" link from a submission or a claim.
 *
 * GET only: nothing about it changes anything a mail client would fire on its
 * own, and a link in an inbox is a GET. It is not signed in and not
 * origin-checked — the unguessable token in the address is what stands in for
 * both, exactly as the unsubscribe link works. See
 * `server/directory/verify-link.ts`.
 */
export const Route = createFileRoute("/api/directory-verify")({
  server: {
    handlers: {
      GET: ({ request }) => handleDirectoryVerifyRequest(request),
    },
  },
})
