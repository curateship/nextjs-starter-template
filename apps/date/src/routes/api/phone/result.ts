import { createFileRoute } from "@tanstack/react-router"

import { answerSigned } from "@/server/phone/http"
import { finishAction } from "@/server/phone/link"
import { resultShape } from "@/server/phone/shapes"

/** The answer to one action, with a picture of the screen when it took one. */
export const Route = createFileRoute("/api/phone/result")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, resultShape, async (phone, data) => ({
          accepted: await finishAction(phone, { ...data, screenshot: data.screenshot || null }),
        })),
    },
  },
})
