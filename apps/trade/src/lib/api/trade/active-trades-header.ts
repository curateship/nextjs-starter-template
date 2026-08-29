import { createServerFn } from "@tanstack/react-start"

import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import { adminGet } from "@/server/guards"
import { loadActiveTradesSnapshot } from "@/server/trade/trading-overview"

const loadActiveTradesHeaderFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ActiveTradesSnapshot> =>
    loadActiveTradesSnapshot(context.user.id)
  )

export function loadActiveTradesHeader() {
  return loadActiveTradesHeaderFn()
}
