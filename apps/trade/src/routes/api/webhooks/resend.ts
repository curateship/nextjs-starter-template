import { createFileRoute } from "@tanstack/react-router"

import { handleResendWebhook } from "@/server/email/resend-webhook"

/**
 * Resend webhook receiver: bounces and spam complaints come in here and take
 * the affected address off the contact list.
 *
 * Deliberately no origin check, like the Stripe receiver beside it: Resend is
 * a server, not a browser, so the signature over the raw body is what proves
 * the request is genuine.
 */
export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const result = await handleResendWebhook(await request.text(), {
          id: request.headers.get("svix-id"),
          timestamp: request.headers.get("svix-timestamp"),
          signature: request.headers.get("svix-signature"),
        })

        switch (result.outcome) {
          case "not_configured":
            return Response.json(
              { detail: "Resend webhook is not configured" },
              { status: 503 }
            )
          case "bad_signature":
            return Response.json(
              { detail: "Invalid signature" },
              { status: 400 }
            )
          case "bad_payload":
            return Response.json({ detail: "Invalid payload" }, { status: 400 })
          case "applied":
            return Response.json({ received: true, changed: result.changed })
        }
      },
    },
  },
})
