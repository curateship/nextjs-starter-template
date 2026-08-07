import { createFileRoute } from "@tanstack/react-router"

import { applyStripeEvent, stripe } from "@/server/billing/stripe"
import { getActiveStripeConfig } from "@/server/billing/settings"

/**
 * Stripe webhook receiver.
 *
 * Deliberately no origin check: Stripe is a server, not a browser, so the
 * signature over the raw body is what proves the request is genuine.
 */
export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret } = await getActiveStripeConfig()
        const signature = request.headers.get("stripe-signature")

        if (!webhookSecret || !signature) {
          return Response.json(
            { detail: "Stripe webhook is not configured" },
            { status: 503 }
          )
        }

        let event
        try {
          event = (await stripe()).webhooks.constructEvent(
            await request.text(),
            signature,
            webhookSecret
          )
        } catch {
          return Response.json({ detail: "Invalid signature" }, { status: 400 })
        }

        try {
          const applied = await applyStripeEvent(event)
          return Response.json({ received: true, applied })
        } catch {
          // Ask Stripe to retry rather than swallowing a failed sync.
          return Response.json(
            { detail: "Could not process event" },
            { status: 500 }
          )
        }
      },
    },
  },
})
