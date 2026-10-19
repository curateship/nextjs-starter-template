import { createFileRoute } from "@tanstack/react-router"

import { answerSigned } from "@/server/phone/http"
import { nextAction } from "@/server/phone/link"
import { nextShape } from "@/server/phone/shapes"

/** The oldest waiting action for this phone, or none after a short wait. */
export const Route = createFileRoute("/api/phone/next")({
  server: {
    handlers: {
      POST: ({ request }) => answerSigned(request, nextShape, (phone, data) => nextAction(phone, data)),
    },
  },
})
