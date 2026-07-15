import { createFileRoute } from "@tanstack/react-router"

import { applyStripeEvent, stripe } from "@/server/billing"

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    const signature = request.headers.get("stripe-signature")
    if (!secret || !signature) return Response.json({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook unavailable" } }, { status: 503 })
    let event
    try { event = stripe().webhooks.constructEvent(await request.text(), signature, secret) } catch { return Response.json({ error: { code: "INVALID_SIGNATURE", message: "Invalid signature" } }, { status: 400 }) }
    await applyStripeEvent(event)
    return Response.json({ received: true })
  } } },
})
