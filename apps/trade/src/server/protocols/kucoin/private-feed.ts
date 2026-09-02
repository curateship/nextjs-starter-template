import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import {
  kucoinSigned,
  parseKucoinCredential,
} from "@/server/protocols/kucoin/client"
import {
  createPrivateFeed,
  type PrivateFeedContext,
} from "@/server/protocols/private-feed"
import { venueTouchedAt } from "@/server/protocols/touched"

/**
 * KuCoin's private line is a doorbell, not an account reader. It says only
 * whether an order changed while it was continuously subscribed. Every gap
 * falls back to the existing REST read.
 */

const ORDERS_TOPIC = "/contractMarket/tradeOrders"

const bulletSchema = z.object({
  token: z.string(),
  instanceServers: z
    .array(
      z.object({
        endpoint: z.string(),
        pingInterval: z.number().optional(),
      })
    )
    .min(1),
})

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

async function connect(context: PrivateFeedContext): Promise<Connection> {
  const blob = context.credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const answer = bulletSchema.parse(
    await kucoinSigned(
      context.network,
      parseKucoinCredential(blob),
      "POST",
      "/api/v1/bullet-private"
    )
  )
  const server = answer.instanceServers[0]
  const pingEveryMs = Math.max(
    2_000,
    Math.floor((server.pingInterval ?? 18_000) * 0.66)
  )
  const socket = new WebSocket(
    `${server.endpoint}?token=${encodeURIComponent(answer.token)}&connectId=trade-${Date.now()}`
  )
  let pinger: ReturnType<typeof setInterval> | null = null

  socket.addEventListener("open", () => {
    context.opened()
    send(socket, {
      id: "sub-orders",
      type: "subscribe",
      topic: ORDERS_TOPIC,
      privateChannel: true,
      response: true,
    })
    pinger = setInterval(
      () => send(socket, { id: `p${Date.now()}`, type: "ping" }),
      pingEveryMs
    )
    pinger.unref?.()
  })

  socket.addEventListener("message", (event) => {
    context.alive()
    let message: { type?: unknown; topic?: unknown }
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (message.type === "ack") {
      context.watching()
      return
    }
    if (message.type === "error") {
      context.fail()
      return
    }
    if (message.type === "message" && message.topic === ORDERS_TOPIC) {
      context.changed()
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
  storageKey: "kucoin",
  touchedAt: () => venueTouchedAt("kucoin"),
  connect,
  close: (connection) => connection.close(),
})

export function kucoinQuietSince(
  network: NetworkId,
  keyId: string,
  credential: () => string | null,
  at: number
): boolean {
  return feed.quietSince(network, keyId, credential, at)
}

export function dropIdleKucoinPrivateFeeds(now?: number): void {
  feed.dropIdle(now)
}

export function closeKucoinPrivateFeeds(): void {
  feed.close()
}
