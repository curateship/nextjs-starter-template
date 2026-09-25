import { createHmac } from "node:crypto"

import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import { phemexWsUrl } from "@/lib/protocols/phemex/translate"
import { parsePhemexCredential } from "@/server/protocols/phemex/client"
import {
  createPrivateFeed,
  createPrivateFillState,
  type PrivateFeedContext,
} from "@/server/protocols/private-feed"
import { readPhemexFill } from "@/server/protocols/phemex/fill"
import { venueTouchedAt } from "@/server/protocols/touched"

/**
 * Phemex's private line is a doorbell, not an account reader. It says only
 * whether an order changed while it was continuously signed in and watching.
 * Every gap falls back to the existing REST read.
 */

type Connection = {
  close: () => void
}

function send(socket: WebSocket, frame: unknown): void {
  try {
    socket.send(JSON.stringify(frame))
  } catch {
    // The shared watchdog replaces a socket that cannot accept a frame.
  }
}

function authMessage(context: PrivateFeedContext): unknown | null {
  const blob = context.credential()
  if (!blob) return null
  let secret: string
  try {
    secret = parsePhemexCredential(blob).secret
  } catch {
    return null
  }
  const expiry = Math.floor(Date.now() / 1_000) + 120
  const signature = createHmac("sha256", secret)
    .update(`${context.keyId}${expiry}`)
    .digest("hex")
  return {
    id: 1,
    method: "user.auth",
    params: ["API", context.keyId, signature, expiry],
  }
}

function saysSomethingHappened(message: unknown): boolean {
  const orders = (message as { orders_p?: unknown }).orders_p
  return Array.isArray(orders) && orders.length > 0
}

function pushFills(context: PrivateFeedContext, message: unknown): void {
  const orders = (message as { orders_p?: unknown }).orders_p
  if (!Array.isArray(orders)) return
  for (const raw of orders) {
    const fill = readPhemexFill(raw)
    if (!fill) continue
    fillState.push(context.network, context.keyId, fill)
  }
}

function connect(context: PrivateFeedContext): Connection {
  const socket = new WebSocket(phemexWsUrl(context.network))
  let pinger: ReturnType<typeof setInterval> | null = null

  socket.addEventListener("open", () => {
    context.opened()
    const auth = authMessage(context)
    if (!auth) {
      context.fail()
      return
    }
    send(socket, auth)
    pinger = setInterval(
      () => send(socket, { id: 9, method: "server.ping", params: [] }),
      5_000
    )
    pinger.unref?.()
  })

  socket.addEventListener("message", (event) => {
    context.alive()
    let message: unknown
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    const reply = message as { id?: unknown; error?: unknown }
    if (reply.id === 1) {
      if (reply.error) context.fail()
      else send(socket, { id: 2, method: "aop_p.subscribe", params: [] })
      return
    }
    if (reply.id === 2) {
      if (reply.error) context.fail()
      else context.watching()
      return
    }
    if (reply.id === 9) return
    if (saysSomethingHappened(message)) {
      context.changed()
      pushFills(context, message)
    }
  })

  socket.addEventListener("close", context.fail)
  socket.addEventListener("error", context.fail)

  return {
    close: () => {
      if (pinger) clearInterval(pinger)
      pinger = null
      socket.close()
    },
  }
}

const feed = createPrivateFeed<Connection>({
  storageKey: "phemex",
  touchedAt: () => venueTouchedAt("phemex"),
  connect,
  close: (connection) => connection.close(),
})
const fillState = createPrivateFillState<WalletOrderFill>(
  feed,
  "phemex",
  "Phemex"
)

export function phemexQuietSince(
  network: NetworkId,
  keyId: string,
  credential: () => string | null,
  at: number
): boolean {
  return feed.quietSince(network, keyId, credential, at)
}

/** Keep the private line open and hand its complete execution rows to Trade. */
export function watchPhemexFills(
  network: NetworkId,
  keyId: string,
  listenerId: string,
  credential: () => string | null,
  onFill: (fill: WalletOrderFill) => void
): void {
  fillState.watch(network, keyId, listenerId, credential, onFill)
}

/** Startup, a pushed change, and a reconnect each require one REST recovery. */
export function phemexFillsNeedRecovery(
  network: NetworkId,
  keyId: string,
  credential: () => string | null
): boolean {
  return fillState.needsRecovery(network, keyId, credential)
}

/** Said only after the exchange's fill history completed successfully. */
export function phemexFillsRecovered(
  network: NetworkId,
  keyId: string,
  coveredThrough: number = Date.now()
): void {
  fillState.recovered(network, keyId, coveredThrough)
}

export function dropIdlePhemexPrivateFeeds(now?: number): void {
  feed.dropIdle(now)
  fillState.dropIdle(now)
}

export function closePhemexPrivateFeeds(): void {
  feed.close()
  fillState.close()
}
