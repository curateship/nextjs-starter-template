import { createFileRoute } from "@tanstack/react-router"

import { answerSigned } from "@/server/phone/http"
import { receiveFrame } from "@/server/phone/screens"
import { screenShape } from "@/server/phone/shapes"

/**
 * A few times a second while a window watches the phone: the newest picture
 * of its screen, in; whether anyone is still watching, out. Taps in the
 * window reach the phone as ordinary actions through `next`.
 */
export const Route = createFileRoute("/api/phone/screen")({
  server: {
    handlers: {
      POST: ({ request }) => answerSigned(request, screenShape, async (phone, data) => receiveFrame(phone.id, data.frame)),
    },
  },
})
