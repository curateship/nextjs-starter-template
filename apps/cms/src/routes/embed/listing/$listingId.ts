import { createFileRoute } from "@tanstack/react-router"
import { getRequestIP } from "@tanstack/react-start/server"

import {
  listingBadgeResponse,
  listingBadgeUnavailableResponse,
} from "@/server/directory/badge"
import { visitorSite } from "@/server/directory/public"

export const Route = createFileRoute("/embed/listing/$listingId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return await listingBadgeResponse({
            request,
            site: await visitorSite(),
            listingId: params.listingId,
            requestAddress: getRequestIP({ xForwardedFor: true }) ?? "unknown",
          })
        } catch (error) {
          console.error("Listing badge failed", error)
          return listingBadgeUnavailableResponse()
        }
      },
    },
  },
})
