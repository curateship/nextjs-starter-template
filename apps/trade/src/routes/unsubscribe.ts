import { createFileRoute } from "@tanstack/react-router"

import { handleUnsubscribeRequest } from "@/server/unsubscribe"

/**
 * The unsubscribe link at the bottom of every newsletter.
 *
 * GET is somebody clicking it. POST is the inbox doing it for them — Gmail and
 * Outlook show their own "Unsubscribe" button next to the sender and press this
 * themselves, which is what the `List-Unsubscribe-Post` header on each message
 * asks for.
 *
 * Neither is signed in and neither is checked for origin; the signature carried
 * in the address is what stands in for both. See `server/unsubscribe.ts`.
 */
export const Route = createFileRoute("/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => handleUnsubscribeRequest(request),
      POST: ({ request }) => handleUnsubscribeRequest(request),
    },
  },
})
