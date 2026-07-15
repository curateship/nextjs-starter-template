import Stripe from "stripe"
import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { stripeEvents, subscriptions } from "@/server/schema"

let stripeClient: Stripe | null = null

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("BILLING_NOT_CONFIGURED")
  stripeClient ??= new Stripe(key)
  return stripeClient
}

export function billingEnabled() {
  return process.env.POMODER_BILLING_ENABLED === "true"
}

export async function applyStripeEvent(event: Stripe.Event) {
  const exists = await db.select({ id: stripeEvents.eventId }).from(stripeEvents).where(eq(stripeEvents.eventId, event.id)).limit(1)
  if (exists.length) return false

  await db.transaction(async (tx) => {
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
      const userId = subscription.metadata.userId || (await tx.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1))[0]?.userId
      if (userId) {
        const periodEnd = getSubscriptionPeriodEnd(subscription)
        await tx.insert(subscriptions).values({ userId, stripeCustomerId: customerId, stripeSubscriptionId: subscription.id, status: subscription.status, priceId: subscription.items.data[0]?.price.id, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: subscription.cancel_at_period_end }).onConflictDoUpdate({ target: subscriptions.userId, set: { stripeCustomerId: customerId, stripeSubscriptionId: subscription.id, status: subscription.status, priceId: subscription.items.data[0]?.price.id, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: subscription.cancel_at_period_end, updatedAt: new Date() } })
      }
    }
    if (event.type === "checkout.session.completed") {
      const checkout = event.data.object as Stripe.Checkout.Session
      const userId = checkout.metadata?.userId
      const customerId = typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id
      if (userId && customerId) await tx.insert(subscriptions).values({ userId, stripeCustomerId: customerId, stripeSubscriptionId: typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id, status: "active" }).onConflictDoUpdate({ target: subscriptions.userId, set: { stripeCustomerId: customerId, stripeSubscriptionId: typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id, status: "active", updatedAt: new Date() } })
    }
    await tx.insert(stripeEvents).values({ eventId: event.id, type: event.type })
  })
  return true
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const seconds = subscription.items.data[0]?.current_period_end
  return seconds ? new Date(seconds * 1_000) : null
}
