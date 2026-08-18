import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  quickOrderPrefsSchema,
  type QuickOrderPrefs,
} from "@/lib/trade/quick-order"
import { userGet, userPost } from "@/server/guards"
import { loadQuickOrder, saveQuickOrder } from "@/server/trade/prefs"

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
