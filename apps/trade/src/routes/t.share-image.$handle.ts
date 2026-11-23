import { createFileRoute } from "@tanstack/react-router"

import { profileShareImageResponse } from "@/server/trade/profile-share-image"

/**
 * The picture a shared `/t/<handle>` link shows on X and Telegram. Open to
 * anybody, like the page it belongs to, and it answers only for a profile
 * that is public right now.
 */
export const Route = createFileRoute("/t/share-image/$handle")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return await profileShareImageResponse(params.handle)
        } catch (error) {
          console.error("Profile share picture failed", error)
          return new Response("The picture could not be drawn.", {
            status: 500,
            headers: { "Cache-Control": "no-store" },
          })
        }
      },
    },
  },
})
