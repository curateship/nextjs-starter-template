import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { RackRefusal } from "@/server/phones/rack"
import { answerSigned } from "@/server/phones/rack-http"
import { rackRelease } from "@/server/phones/release"

/**
 * The program version Promo serves, signed with the rack's own key like every
 * other answer, so the rack runs only code that came from the Promo it
 * paired with. The rack also checks the file's checksum and its VERSION line
 * before switching.
 */
export const Route = createFileRoute("/api/rack/release")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, z.object({ version: z.string().max(40) }), async (_rack, data) => {
          const release = rackRelease()
          if (data.version !== release.version) {
            throw new RackRefusal(409, `Promo serves ${release.version}, not ${data.version}.`)
          }
          return release
        }),
    },
  },
})
