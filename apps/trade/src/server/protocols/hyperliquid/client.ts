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
    existing = counted(
      new InfoClient({
        transport: new HttpTransport({ isTestnet: network === "testnet" }),
      }),
      network
    )
    clients.set(network, existing)
  }
  return existing
}

/**
 * How many requests the app has made, by kind, per network.
 *
 * **Because "why are we being rate-limited" was unanswerable.** Hyperliquid
 * allows 1,200 request-weight a minute per address and refuses everything over
 * it, and every guess at which call was spending it cost an hour. Counting is
 * cheap and settles it.
 *
 * Reported when `TRADE_COUNT_EXCHANGE_CALLS` is set, and silent otherwise —
 * this is a thing to switch on while chasing something, not noise in every log.
 */
const counts = new Map<string, number>()
let reportAt = 0

function counted(client: InfoClient, network: NetworkId): InfoClient {
  if (process.env.TRADE_COUNT_EXCHANGE_CALLS !== "true") return client
  return new Proxy(client, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      if (typeof value !== "function" || typeof key !== "string") return value
      return (...args: unknown[]) => {
        const name = `${network}:${key}`
        counts.set(name, (counts.get(name) ?? 0) + 1)
        report()
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })
}

function report(): void {
  const now = Date.now()
  if (reportAt === 0) reportAt = now
  if (now - reportAt < 30_000) return
  const seconds = Math.round((now - reportAt) / 1000)
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name}=${n}`)
  console.log(`Hyperliquid calls in ${seconds}s: ${lines.join(" ")}`)
  counts.clear()
  reportAt = now
}

/**
 * One long-lived subscription client per network, for feeds that stay open.
 *
 * Separate from the snapshot below on purpose: that one opens a transport,
 * takes its single answer and closes it, which is right for a one-off. A feed
 * the app listens to for hours must not be torn down between messages, and the
 * exchange allows ten connections — so there is one per network, shared.
 */
const subscribers = new Map<NetworkId, SubscriptionClient>()

export function subscriptionClient(network: NetworkId): SubscriptionClient {
  let existing = subscribers.get(network)
  if (!existing) {
    existing = new SubscriptionClient({
      transport: new WebSocketTransport({ isTestnet: network === "testnet" }),
    })
    subscribers.set(network, existing)
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
