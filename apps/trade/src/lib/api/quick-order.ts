import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  quickOrderPrefsSchema,
  type QuickOrderPrefs,
} from "@/lib/trade/quick-order"
import { ORDER_STYLES, type OrderStyle } from "@/lib/trade/order-style"
import { userGet, userPost } from "@/server/guards"
import {
  loadOrderStyle,
  loadQuickOrder,
  saveOrderStyle,
  saveQuickOrder,
} from "@/server/trade/prefs"

/**
 * What the right-click order window remembers between orders.
 *
 * Its own pair of endpoints rather than a passenger on the order itself: an
 * order goes to one of two places depending on whether the wallet is real, and
 * how the window was set up is the same answer either way.
 */

const saveSchema = z.object({ prefs: quickOrderPrefsSchema })

const loadQuickOrderFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ prefs: QuickOrderPrefs }> => ({
    prefs: await loadQuickOrder(context.user.id),
  }))

const saveQuickOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveQuickOrder(context.user.id, data.prefs)
    return { saved: true }
  })

export function loadQuickOrderPrefs() {
  return loadQuickOrderFn()
}

export function saveQuickOrderPrefs(prefs: QuickOrderPrefs) {
  return saveQuickOrderFn({ data: { prefs } })
}

const styleSchema = z.object({ orderStyle: z.enum(ORDER_STYLES) })

/**
 * How a plain order waits, read and written from the Trading engine settings.
 *
 * Its own pair of doors rather than a field on the order window's remembered
 * settings: those are saved when an order is placed, and this one has to be
 * changeable without placing anything.
 */
const loadOrderStyleFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ orderStyle: OrderStyle }> => {
    return { orderStyle: await loadOrderStyle(context.user.id) }
  })

const saveOrderStyleFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(styleSchema)
  .handler(async ({ context, data }): Promise<{ saved: true }> => {
    await saveOrderStyle(context.user.id, data.orderStyle)
    return { saved: true }
  })

export function loadRememberedOrderStyle() {
  return loadOrderStyleFn()
}

export function saveRememberedOrderStyle(orderStyle: OrderStyle) {
  return saveOrderStyleFn({ data: { orderStyle } })
}
