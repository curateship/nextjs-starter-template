import { createFileRoute } from "@tanstack/react-router"
import { getRequestIP } from "@tanstack/react-start/server"

import { visitorSite } from "@/server/directory/public"
import { listingShareImageUnavailableResponse } from "@/server/directory/share-image"
import { guideShareImageResponse } from "@/server/directory/guide-share-image"

export const Route = createFileRoute("/guides_/share-image/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return await guideShareImageResponse({
            request,
            site: await visitorSite(),
            slug: params.slug,
            requestAddress: getRequestIP({ xForwardedFor: true }) ?? "unknown",
          })
        } catch (error) {
          console.error("Guide share image failed", error)
          return listingShareImageUnavailableResponse()
        }
      },
    },
  },
})
