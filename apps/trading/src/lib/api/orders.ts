import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a positive decimal")

const placeOrderSchema = z.object({
  walletId: z.string().min(1),
  market: z.string().min(1).max(20),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit"]),
  px: decimalString.optional(),
  sz: decimalString,
  reduceOnly: z.boolean(),
  tif: z.enum(["Gtc", "Ioc", "Alo"]),
  leverage: z.number().min(1).max(100),
})

const cancelOrderSchema = z.object({
  walletId: z.string().min(1),
  market: z.string().min(1).max(20),
  oid: z.number().int().positive(),
})

const modifyOrderSchema = z.object({
  walletId: z.string().min(1),
  market: z.string().min(1).max(20),
  oid: z.number().int().positive(),
  side: z.enum(["buy", "sell"]),
  px: decimalString,
  sz: decimalString,
  reduceOnly: z.boolean(),
})

const updateLeverageSchema = z.object({
  walletId: z.string().min(1),
  market: z.string().min(1).max(20),
  leverage: z.number().int().min(1).max(100),
  isCross: z.boolean(),
})

export type PlaceOrderResponse = {
  kind: "resting" | "filled"
  oid: number
  px: string
  sz: string
  avgPx?: string
  totalSz?: string
}

export function getOrderErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Order request failed."
}

const placeOrderFn = createServerFn({ method: "POST" })
  .inputValidator(placeOrderSchema)
  .handler(async ({ data }): Promise<PlaceOrderResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { submitManualOrder } = await import("@/server/trading")
    requireAppOrigin()
    const user = await requireUser()
    const result = await submitManualOrder(user.id, data)
    return {
      kind: result.status.kind,
      oid: result.status.oid,
      px: result.px,
      sz: result.sz,
      ...(result.status.kind === "filled"
        ? { avgPx: result.status.avgPx, totalSz: result.status.totalSz }
        : {}),
    }
  })

const cancelOrderFn = createServerFn({ method: "POST" })
  .inputValidator(cancelOrderSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { cancelManualOrder } = await import("@/server/trading")
    requireAppOrigin()
    const user = await requireUser()
    await cancelManualOrder(user.id, data)
    return { ok: true }
  })

const modifyOrderFn = createServerFn({ method: "POST" })
  .inputValidator(modifyOrderSchema)
  .handler(async ({ data }): Promise<{ px: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { modifyManualOrder } = await import("@/server/trading")
    requireAppOrigin()
    const user = await requireUser()
    return modifyManualOrder(user.id, data)
  })

const updateLeverageFn = createServerFn({ method: "POST" })
  .inputValidator(updateLeverageSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { updateManualLeverage } = await import("@/server/trading")
    requireAppOrigin()
    const user = await requireUser()
    await updateManualLeverage(user.id, data)
    return { ok: true }
  })

export function placeOrder(input: z.infer<typeof placeOrderSchema>) {
  return placeOrderFn({ data: input })
}

export function cancelOrder(input: z.infer<typeof cancelOrderSchema>) {
  return cancelOrderFn({ data: input })
}

export function modifyOrder(input: z.infer<typeof modifyOrderSchema>) {
  return modifyOrderFn({ data: input })
}

export function updateLeverage(input: z.infer<typeof updateLeverageSchema>) {
  return updateLeverageFn({ data: input })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
