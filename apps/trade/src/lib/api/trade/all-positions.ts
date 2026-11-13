import { createServerFn } from "@tanstack/react-start"

import type { TradePosition } from "@/lib/trade/paper"
import { userGet } from "@/server/guards"
import { loadAllOpenPositions } from "@/server/trade/trading-overview"

export type AllOpenPositions = {
  positions: TradePosition[]
  marks: Record<string, number>
  /** Wallets that did not answer, so the list may be short. */
  unavailable: string[]
}

/**
 * Every open position on every exchange, for the All protocols tab of the
 * Positions glance. A member reads it too: the Trade dashboard is theirs as
 * well, and this only ever reads the asker's own wallets.
 */
const loadAllPositionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<AllOpenPositions> =>
    loadAllOpenPositions(context.user.id)
  )

export function loadAllPositions() {
  return loadAllPositionsFn()
}
