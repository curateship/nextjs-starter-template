import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { parseMarketKey } from "@/lib/protocols/contracts"
import { invalidateDashboardBootstrap } from "@/lib/trade/dashboard-bootstrap-cache"
import {
  MAX_ARMED_PRICE_ALERTS,
  PRICE_ALERTS_FULL,
  firedPriceAlertSchema,
  priceAlertSchema,
} from "@/lib/trade/price-alerts"
import { userGet, userPost } from "@/server/guards"
import {
  createPriceAlert,
  deleteFiredPriceAlert,
  deletePriceAlert,
  loadArmedPriceAlerts,
  loadRecentFiredPriceAlerts,
  movePriceAlert as moveOwnedPriceAlert,
} from "@/server/trade/price-alerts"

const marketKeySchema = z
  .string()
  .min(1)
  .max(180)
  .refine((key) => parseMarketKey(key) !== null, "Not a market key.")

const createPriceAlertSchema = z.object({
  id: z.string().uuid(),
  marketKey: marketKeySchema,
  price: z.number().positive().finite(),
  currentPrice: z.number().positive().finite(),
})

const deletePriceAlertSchema = z.object({ id: z.string().uuid() })
const movePriceAlertSchema = z.object({
  id: z.string().uuid(),
  price: z.number().positive().finite(),
  currentPrice: z.number().positive().finite(),
})
const priceAlertListSchema = z.object({ alerts: z.array(priceAlertSchema) })
const firedPriceAlertListSchema = z.object({
  alerts: z.array(firedPriceAlertSchema),
})
const deletedPriceAlertSchema = z.object({ deleted: z.boolean() })

const loadPriceAlertsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) =>
    priceAlertListSchema.parse({
      alerts: await loadArmedPriceAlerts(context.user.id),
    })
  )

const loadFiredPriceAlertsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) =>
    firedPriceAlertListSchema.parse({
      alerts: await loadRecentFiredPriceAlerts(context.user.id),
    })
  )

const createPriceAlertFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createPriceAlertSchema)
  .handler(async ({ data, context }) =>
    priceAlertSchema.parse(await createPriceAlert(context.user.id, data))
  )

const movePriceAlertFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(movePriceAlertSchema)
  .handler(async ({ data, context }) =>
    priceAlertSchema.parse(await moveOwnedPriceAlert(context.user.id, data))
  )

const deletePriceAlertFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deletePriceAlertSchema)
  .handler(async ({ data, context }) =>
    deletedPriceAlertSchema.parse({
      deleted: await deletePriceAlert(context.user.id, data.id),
    })
  )

const deleteFiredPriceAlertFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deletePriceAlertSchema)
  .handler(async ({ data, context }) =>
    deletedPriceAlertSchema.parse({
      deleted: await deleteFiredPriceAlert(context.user.id, data.id),
    })
  )

export function loadPriceAlerts() {
  return loadPriceAlertsFn()
}

export function loadFiredPriceAlerts() {
  return loadFiredPriceAlertsFn()
}

export async function savePriceAlert(
  input: z.infer<typeof createPriceAlertSchema>
) {
  const answer = await createPriceAlertFn({ data: input })
  invalidateDashboardBootstrap()
  return answer
}

export async function movePriceAlert(
  input: z.infer<typeof movePriceAlertSchema>
) {
  const answer = await movePriceAlertFn({ data: input })
  invalidateDashboardBootstrap()
  return answer
}

export async function removePriceAlert(id: string) {
  const answer = await deletePriceAlertFn({ data: { id } })
  invalidateDashboardBootstrap()
  return answer
}

export async function removeFiredPriceAlert(id: string) {
  const answer = await deleteFiredPriceAlertFn({ data: { id } })
  invalidateDashboardBootstrap()
  return answer
}

export const getPriceAlertErrorMessage = createErrorMessage(
  {
    [PRICE_ALERTS_FULL]: `You can have at most ${MAX_ARMED_PRICE_ALERTS} active price alerts. Delete one before adding another.`,
  },
  "That price alert could not be saved. Try again."
)

export const getPriceAlertLoadErrorMessage = createErrorMessage(
  {},
  "Your price alerts could not be loaded. Try again."
)

export const getFiredPriceAlertLoadErrorMessage = createErrorMessage(
  {},
  "Your fired alerts could not be loaded. Try again."
)

export const getFiredPriceAlertDeleteErrorMessage = createErrorMessage(
  {},
  "That fired alert could not be deleted. Try again."
)
