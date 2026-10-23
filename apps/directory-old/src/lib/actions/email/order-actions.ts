import { createServerFn } from "@tanstack/react-start"
import { getOrderIdsActionImpl, getOrdersWithProductsImpl, deleteOrdersImpl } from "./order-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./order-actions.server"

export const getOrderIdsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getOrderIdsActionImpl(data.siteId))

export const getOrdersWithProducts = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getOrdersWithProductsImpl(data.siteId, data.options))

export const deleteOrders = createServerFn({ method: "POST" })
  .inputValidator((data: { orderIds: string[] }) => data)
  .handler(async ({ data }) => deleteOrdersImpl(data.orderIds))
