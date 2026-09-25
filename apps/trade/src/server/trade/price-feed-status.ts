import { listProtocols } from "@/server/protocols/registry"

/**
 * Every pushed-price line as the worker heartbeat describes it.
 *
 * One feed is one answer. A broken status reader must not hide the other
 * exchanges or prevent the worker from writing a heartbeat at all.
 */
export function priceFeedStatus(): string {
  return listProtocols()
    .flatMap((protocol) => {
      const hub = protocol.livePrices
      if (!hub) return []
      try {
        const state = hub.fresh("mainnet")
          ? `live, ${hub.read("mainnet").prices.size} markets`
          : "asking"
        return [`${protocol.label}: ${state}`]
      } catch {
        return [`${protocol.label}: unavailable`]
      }
    })
    .join(" · ")
}
