import { createServerFn } from "@tanstack/react-start"
import {
  createPaymentIntentImpl,
  updatePaymentIntentCustomerImpl,
  updatePaymentIntentImpl,
} from "./checkout-actions.server"
import type { OrderBump } from "./checkout-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./checkout-actions.server"

// verifyPaymentIntent is only called while the server renders the purchase
// success page, so it lives in checkout-actions.server.ts with no wrapper.

export const createPaymentIntent = createServerFn({ method: "POST" })
  .inputValidator((data: {
    productId?: string
    productSlug: string
    productName: string
    mainPriceId: string
    tierId?: string
    tierName?: string
    selectedBumps: OrderBump[]
    siteId?: string
  }) => data)
  .handler(async ({ data }) => createPaymentIntentImpl(data))

export const updatePaymentIntent = createServerFn({ method: "POST" })
  .inputValidator((data: {
    paymentIntentId: string
    mainPriceId: string
    selectedBumps: OrderBump[]
    siteId?: string
  }) => data)
  .handler(async ({ data }) => updatePaymentIntentImpl(data))

export const updatePaymentIntentCustomer = createServerFn({ method: "POST" })
  .inputValidator((data: {
    paymentIntentId: string
    email: string
    siteId?: string
  }) => data)
  .handler(async ({ data }) => updatePaymentIntentCustomerImpl(data))
