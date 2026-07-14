import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { hyperliquidMarketSchema } from "@/lib/hl/market-symbol"

export type PaperWalletItem = {
  id: string
  label: string
  starting_equity: number
  cash: number
  created_at: string
}

export type PaperPositionItem = {
  coin: string
  szi: string
  entry_px: string
  mark_px: string
  unrealized_pnl: number
}

export type PaperOrderItem = {
  id: string
  coin: string
  side: string
  order_type: string
  px: string | null
  sz: string
  tif: string
  reduce_only: boolean
  status: string
  created_at: string
}

export type PaperFillItem = {
  id: string
  coin: string
  side: string
  px: string
  sz: string
  fee: string
  closed_pnl: string
  fill_time: string
}

export type PaperAccountResponse = {
  wallet: PaperWalletItem
  equity: number
  unrealized: number
  positions: PaperPositionItem[]
  openOrders: PaperOrderItem[]
  fills: PaperFillItem[]
}

const decimalString = z.string().regex(/^\d+(\.\d+)?$/)

const createSchema = z.object({
  label: z.string().min(1).max(255),
  startingEquity: z.number().positive().max(1_000_000_000),
})

const walletIdSchema = z.object({ paperWalletId: z.string().min(1) })

const placeSchema = z.object({
  paperWalletId: z.string().min(1),
  coin: hyperliquidMarketSchema,
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit"]),
  px: decimalString.optional(),
  sz: decimalString,
  tif: z.enum(["Gtc", "Ioc", "Alo"]),
  reduceOnly: z.boolean(),
})

const cancelSchema = z.object({
  paperWalletId: z.string().min(1),
  orderId: z.string().min(1),
})

const moveSchema = z.object({
  paperWalletId: z.string().min(1),
  orderId: z.string().min(1),
  px: decimalString,
})

export function getPaperErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Paper wallet request failed."
}

const createPaperWalletFn = createServerFn({ method: "POST" })
  .inputValidator(createSchema)
  .handler(async ({ data }): Promise<{ paperWalletId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createPaperWallet } = await import("@/server/paper")
    const wallet = await createPaperWallet(user.id, data)
    return { paperWalletId: wallet.id }
  })

const resetPaperWalletFn = createServerFn({ method: "POST" })
  .inputValidator(walletIdSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { resetPaperWallet } = await import("@/server/paper")
    await resetPaperWallet(user.id, data.paperWalletId)
    return { ok: true }
  })

const deletePaperWalletFn = createServerFn({ method: "POST" })
  .inputValidator(walletIdSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { deletePaperWallet } = await import("@/server/paper")
    await deletePaperWallet(user.id, data.paperWalletId)
    return { ok: true }
  })

const placePaperOrderFn = createServerFn({ method: "POST" })
  .inputValidator(placeSchema)
  .handler(async ({ data }): Promise<{ orderId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { placePaperOrder } = await import("@/server/paper")
    const order = await placePaperOrder(user.id, data)
    return { orderId: order?.id ?? "" }
  })

const cancelPaperOrderFn = createServerFn({ method: "POST" })
  .inputValidator(cancelSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { cancelPaperOrder } = await import("@/server/paper")
    await cancelPaperOrder(user.id, data.paperWalletId, data.orderId)
    return { ok: true }
  })

const movePaperOrderFn = createServerFn({ method: "POST" })
  .inputValidator(moveSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { movePaperOrder } = await import("@/server/paper")
    await movePaperOrder(user.id, data.paperWalletId, data.orderId, data.px)
    return { ok: true }
  })

const loadPaperAccountFn = createServerFn({ method: "POST" })
  .inputValidator(walletIdSchema)
  .handler(async ({ data }): Promise<PaperAccountResponse> => {
    const user = await requireUser()
    const { getPaperAccount } = await import("@/server/paper")
    const account = await getPaperAccount(user.id, data.paperWalletId)
    return {
      wallet: serializePaperWallet(account.wallet),
      equity: account.equity,
      unrealized: account.unrealized,
      positions: account.positions,
      openOrders: account.openOrders.map((order) => ({
        id: order.id,
        coin: order.coin,
        side: order.side,
        order_type: order.orderType,
        px: order.px,
        sz: order.sz,
        tif: order.tif,
        reduce_only: order.reduceOnly,
        status: order.status,
        created_at: order.createdAt.toISOString(),
      })),
      fills: account.fills.map((fill) => ({
        id: fill.id,
        coin: fill.coin,
        side: fill.side,
        px: fill.px,
        sz: fill.sz,
        fee: fill.fee,
        closed_pnl: fill.closedPnl,
        fill_time: fill.fillTime.toISOString(),
      })),
    }
  })

export function createPaperWallet(label: string, startingEquity: number) {
  return createPaperWalletFn({ data: { label, startingEquity } })
}

export function resetPaperWallet(paperWalletId: string) {
  return resetPaperWalletFn({ data: { paperWalletId } })
}

export function deletePaperWallet(paperWalletId: string) {
  return deletePaperWalletFn({ data: { paperWalletId } })
}

export function placePaperOrder(input: z.infer<typeof placeSchema>) {
  return placePaperOrderFn({ data: input })
}

export function cancelPaperOrder(paperWalletId: string, orderId: string) {
  return cancelPaperOrderFn({ data: { paperWalletId, orderId } })
}

export function movePaperOrder(
  paperWalletId: string,
  orderId: string,
  px: string
) {
  return movePaperOrderFn({ data: { paperWalletId, orderId, px } })
}

export function loadPaperAccount(paperWalletId: string) {
  return loadPaperAccountFn({ data: { paperWalletId } })
}

export function serializePaperWallet(wallet: {
  id: string
  label: string
  startingEquity: string
  cash: string
  createdAt: Date
}): PaperWalletItem {
  return {
    id: wallet.id,
    label: wallet.label,
    starting_equity: Number(wallet.startingEquity),
    cash: Number(wallet.cash),
    created_at: wallet.createdAt.toISOString(),
  }
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
