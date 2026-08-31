import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import { adminGet, userPost } from "@/server/guards"
import {
  loadTradePanelLayouts,
  saveHeaderProfitVisibility as saveHeaderProfitVisibilityForUser,
} from "@/server/trade/prefs"
import { loadActiveTradesSnapshot } from "@/server/trade/trading-overview"

export type ActiveTradesHeaderSnapshot = {
  snapshot: ActiveTradesSnapshot
  headerProfitVisible: boolean
}

const loadActiveTradesHeaderFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ActiveTradesHeaderSnapshot> => {
    const [snapshot, layouts] = await Promise.all([
      loadActiveTradesSnapshot(context.user.id),
      loadTradePanelLayouts(context.user.id),
    ])
    return {
      snapshot,
      headerProfitVisible: layouts.headerProfitVisible,
    }
  })

const saveHeaderProfitVisibilityFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ visible: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveHeaderProfitVisibilityForUser(context.user.id, data.visible)
    return { saved: true }
  })

export function loadActiveTradesHeader() {
  return loadActiveTradesHeaderFn()
}

export function saveHeaderProfitVisibility(visible: boolean) {
  return saveHeaderProfitVisibilityFn({ data: { visible } })
}
