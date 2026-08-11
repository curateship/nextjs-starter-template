import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import {
  confirmFeaturedCheckout,
  createFeaturedCheckout,
  deleteFeaturedPlan,
  featuredAdminOverview,
  featuredPurchaseState,
  revokeFeaturedEntitlement,
  saveFeaturedPlan,
} from "@/server/directory/featured"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export function getFeaturedErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const known = [
    ["RATE_LIMITED", "Too many payment attempts. Wait a few minutes and try again."],
    ["BILLING_NOT_CONFIGURED", "Stripe is not configured yet."],
    ["CHECKOUT_FAILED", "Stripe could not start checkout. Please try again."],
    ["CHECKOUT_NOT_FOUND", "Stripe could not find that checkout. Please try again from My listings."],
    ["CHECKOUT_ALREADY_STARTED", "Another checkout is already open for this listing."],
    ["CHECKOUT_PAYMENT_PROCESSING", "Stripe is still processing that payment. Try again shortly."],
  ] as const
  return (
    describeAuthError(message) ??
    known.find(([code]) => message.includes(code))?.[1] ??
    (message || "Featured placement is unavailable right now. Please try again.")
  )
}

const id = z.string().uuid()

const loadFeaturedAdminFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) =>
    featuredAdminOverview(await workspaceIdForRequest(context.user.id))
  )

export function loadFeaturedAdmin() {
  return loadFeaturedAdminFn()
}

const saveFeaturedPlanFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: id.optional(),
      name: z.string().max(120),
      description: z.string().max(500).optional(),
      priceCents: z.number().int().min(1).max(100_000_000),
      currency: z.string().trim().length(3),
      durationDays: z.number().int().min(1).max(3650),
      priority: z.number().int().min(-10_000).max(10_000).optional(),
      active: z.boolean().optional(),
    })
  )
  .handler(async ({ data, context }) =>
    saveFeaturedPlan(await workspaceIdForRequest(context.user.id), data)
  )

export function saveFeaturedPlanAction(input: {
  id?: string
  name: string
  description?: string
  priceCents: number
  currency: string
  durationDays: number
  priority?: number
  active?: boolean
}) {
  return saveFeaturedPlanFn({ data: input })
}

const deleteFeaturedPlanFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }) =>
    deleteFeaturedPlan(await workspaceIdForRequest(context.user.id), data.id)
  )

export function removeFeaturedPlan(idValue: string) {
  return deleteFeaturedPlanFn({ data: { id: idValue } })
}

const revokeFeaturedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id, note: z.string().max(500).optional() }))
  .handler(async ({ data, context }) =>
    revokeFeaturedEntitlement(
      await workspaceIdForRequest(context.user.id),
      data.id,
      context.user.id,
      data.note ?? ""
    )
  )

export function revokeFeatured(idValue: string, note = "") {
  return revokeFeaturedFn({ data: { id: idValue, note } })
}

const loadFeaturedPurchaseFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ listingId: id }))
  .handler(({ data, context }) => featuredPurchaseState(context.user.id, data.listingId))

export function loadFeaturedPurchase(listingId: string) {
  return loadFeaturedPurchaseFn({ data: { listingId } })
}

const startFeaturedCheckoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ listingId: id, planId: id }))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`directory-featured-start:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 15 * 60,
    })
    return createFeaturedCheckout(context.user, data)
  })

export function startFeaturedCheckout(listingId: string, planId: string) {
  return startFeaturedCheckoutFn({ data: { listingId, planId } })
}

const confirmFeaturedCheckoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ sessionId: z.string().trim().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/) }))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`directory-featured-confirm:${context.user.id}`, {
      maxAttempts: 20,
      windowSeconds: 10 * 60,
    })
    return confirmFeaturedCheckout(context.user.id, data.sessionId)
  })

export function confirmFeatured(sessionId: string) {
  return confirmFeaturedCheckoutFn({ data: { sessionId } })
}

export type {
  FeaturedEntitlement,
  FeaturedPlan,
} from "@/server/directory/featured"
