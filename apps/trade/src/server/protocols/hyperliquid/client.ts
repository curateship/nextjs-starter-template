import {
  InfoClient,
  HttpTransport,
  SubscriptionClient,
  WebSocketTransport,
  type AllDexsAssetCtxsWsEvent,
} from "@nktkas/hyperliquid"

import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * One read-only client per network, shared by every fetch in this folder and
 * reused across requests like any other app-wide handle. The SDK's transport
 * keeps no session state worth resetting.
 */
const clients = new Map<NetworkId, InfoClient>()

export function infoClient(network: NetworkId): InfoClient {
  let existing = clients.get(network)
  if (!existing) {
    existing = new InfoClient({
      transport: new HttpTransport({ isTestnet: network === "testnet" }),
    })
    clients.set(network, existing)
  }
  return existing
}

/**
 * One complete live-figures snapshot across every venue.
 *
 * Hyperliquid's REST API only offers asset contexts one venue at a time. On
 * testnet that is hundreds of requests and exceeds the exchange's per-IP
 * limit in one page load. The all-venues websocket sends the same figures in
 * one message, so open it long enough to receive that first snapshot and then
 * close it.
 */
export async function allAssetCtxsSnapshot(
  network: NetworkId
): Promise<AllDexsAssetCtxsWsEvent["ctxs"]> {
  const transport = new WebSocketTransport({
    isTestnet: network === "testnet",
  })
  const client = new SubscriptionClient({ transport })
  let timeout: ReturnType<typeof setTimeout> | null = null
  const state: {
    subscription: { unsubscribe(): Promise<unknown> } | null
    finished: boolean
  } = { subscription: null, finished: false }

  try {
    let resolveSnapshot!: (ctxs: AllDexsAssetCtxsWsEvent["ctxs"]) => void
    let rejectSnapshot!: (error: Error) => void
    const snapshot = new Promise<AllDexsAssetCtxsWsEvent["ctxs"]>(
      (resolve, reject) => {
        resolveSnapshot = resolve
        rejectSnapshot = reject
      }
    )
    const subscribed = client
      .allDexsAssetCtxs((event) => resolveSnapshot(event.ctxs), {
        onError: (error) => rejectSnapshot(error),
      })
      .then(async (next) => {
        // A connection can finish opening after the deadline closed its
        // transport. It still owns a subscription handle and must release it.
        if (state.finished) await next.unsubscribe().catch(() => {})
        else state.subscription = next
      })
    // Attach to both promises immediately. An error event can arrive before
    // the subscription acknowledgement, and must never become an unhandled
    // rejection while that acknowledgement is still pending.
    const ready = Promise.all([subscribed, snapshot]).then(
      ([, ctxs]) => ctxs
    )
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Hyperliquid snapshot timed out.")),
        10_000
      )
    })
    return await Promise.race([ready, deadline])
  } finally {
    state.finished = true
    if (timeout) clearTimeout(timeout)
    if (state.subscription) {
      await state.subscription.unsubscribe().catch(() => {})
    }
    transport.close()
  }
}
