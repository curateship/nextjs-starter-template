import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { confirmPurchase, startPurchase } from "@/server/pomodoro/purchases"
import { MEDIA_PAGE } from "@/lib/pomodoro/notices"
import { PURCHASE_PRODUCTS, type PurchaseProduct } from "@/lib/pomodoro/purchases"

/**
 * Buying an AI credit pack or more space (uploads-and-sharing task 07): start
 * Stripe's checkout, and confirm it on the way back. See "Buying more" in
 * `workspace/docs/pro-perks.md`.
 */

export const getPurchaseErrorMessage = createErrorMessage(
  {
    BILLING_DISABLED: "Buying more is not open yet.",
    BILLING_NOT_CONFIGURED: "Buying more is not open yet.",
    PRO_REQUIRED: "Buying more is for Pro members. Get Pro first.",
    CHECKOUT_FAILED: "Stripe's checkout could not be opened. Please try again.",
    PURCHASE_NOT_FOUND: "That purchase could not be found.",
    RATE_LIMITED: "That is a lot of tries at once. Please wait a few minutes.",
  },
  "That purchase did not go through. Please try again."
)

/** The page Stripe sends the member back to: the tab they bought from. */
const pageSchema = z.enum(["background", "sound"])

const startFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ product: z.enum(PURCHASE_PRODUCTS), page: pageSchema }))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`pomodoro-purchase:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 10 * 60,
    })
    // A fixed page of this app, never an address from the browser.
    return startPurchase(context.user, data.product, MEDIA_PAGE[data.page])
  })

const confirmFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ sessionId: z.string().regex(/^cs_[A-Za-z0-9_]{10,250}$/) }))
  .handler(async ({ data, context }) => confirmPurchase(context.user.id, data.sessionId))

export const buyPomodoroProduct = (product: PurchaseProduct, page: "background" | "sound") =>
  startFn({ data: { product, page } })

export const confirmPomodoroPurchase = (sessionId: string) =>
  confirmFn({ data: { sessionId } })
