import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  loadTradePanelLayouts,
  saveHeaderProfitVisibility,
} from "@/server/trade/prefs"

/**
 * Whether this person's profit and loss figures are hidden.
 *
 * Kept in the same saved field the header's own eye button used, under its
 * original name: the switch grew from "hide the figure in the header" into
 * "hide every figure", and the answer is the same yes or no. Renaming the
 * stored field would have thrown away everybody's saved choice for nothing.
 * A saved layout carries the same field, so applying one still sets it.
 */
const loadHidePnlFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ hidden: boolean }> => {
    const layouts = await loadTradePanelLayouts(context.user.id)
    return { hidden: !layouts.headerProfitVisible }
  })

const saveHidePnlFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ hidden: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveHeaderProfitVisibility(context.user.id, !data.hidden)
    return { saved: true }
  })

export function loadHidePnl() {
  return loadHidePnlFn()
}

export function saveHidePnl(hidden: boolean) {
  return saveHidePnlFn({ data: { hidden } })
}
