import { createFileRoute } from "@tanstack/react-router"
import { getRequestIP } from "@tanstack/react-start/server"

import { visitorSite } from "@/server/directory/public"
import { listingShareImageUnavailableResponse } from "@/server/directory/share-image"
import { eventShareImageResponse } from "@/server/events/share-image"

export const Route = createFileRoute("/events_/share-image/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return await eventShareImageResponse({
            request,
            site: await visitorSite(),
            slug: params.slug,
            requestAddress: getRequestIP({ xForwardedFor: true }) ?? "unknown",
          })
        } catch (error) {
          console.error("Event share image failed", error)
          return listingShareImageUnavailableResponse()
        }
      },
    },
  },
})
