import { createFileRoute } from "@tanstack/react-router"

import { answerSigned } from "@/server/phone/http"
import { checkIn } from "@/server/phone/link"
import { checkInShape } from "@/server/phone/shapes"

/**
 * Every fifteen seconds: what the phone is and how it is. The answer says how
 * often to come back and whether a window is watching its screen.
 */
export const Route = createFileRoute("/api/phone/check-in")({
  server: {
    handlers: {
      POST: ({ request }) => answerSigned(request, checkInShape, (phone, data) => checkIn(phone, data)),
    },
  },
})
