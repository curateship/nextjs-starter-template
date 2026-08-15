import { createFileRoute } from "@tanstack/react-router"
import { getRequestIP } from "@tanstack/react-start/server"

import { visitorSite } from "@/server/directory/public"
import {
  listingShareImageResponse,
  listingShareImageUnavailableResponse,
} from "@/server/directory/share-image"

export const Route = createFileRoute("/directory_/share-image/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return await listingShareImageResponse({
            request,
            site: await visitorSite(),
            slug: params.slug,
            requestAddress: getRequestIP({ xForwardedFor: true }) ?? "unknown",
          })
        } catch (error) {
          console.error("Listing share image failed", error)
          return listingShareImageUnavailableResponse()
        }
      },
    },
  },
})
