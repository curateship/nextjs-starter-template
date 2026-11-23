import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { learnedPhrases } from "@/server/bans/phrases"
import { nextAction } from "@/server/phones/rack"
import { answerSigned } from "@/server/phones/rack-http"
import { takeLogRequest } from "@/server/phones/rack-log"

/**
 * Every few seconds: the oldest waiting action for this rack, or none, and
 * `sendLog`, true once after the Rack window's Log tab asked, which the rack
 * answers by posting its last lines to `/api/rack/log`.
 *
 * With an action come the ban lines a person taught Promo (Bans task, part
 * 9): `banPhrases` the rack adds to its own ban screens, and `harmless` the
 * lines it no longer asks about.
 */
export const Route = createFileRoute("/api/rack/next")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, z.object({}), async (rack) => {
          const action = await nextAction(rack)
          const learned = action ? await learnedPhrases(rack.userId) : null
          return {
            action,
            sendLog: takeLogRequest(rack.id),
            ...(learned ? { banPhrases: learned.bans, harmless: learned.harmless } : {}),
          }
        }),
    },
  },
})
