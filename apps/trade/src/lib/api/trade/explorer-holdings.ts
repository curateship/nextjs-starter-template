import { createServerFn } from "@tanstack/react-start"
import { userGet } from "@/server/guards"
import { loadExplorerHoldings } from "@/server/trade/explorer-holdings"

const loadExplorerHoldingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => loadExplorerHoldings(context.user.id))

export function loadMarketHoldings() {
  return loadExplorerHoldingsFn()
}
