import { z } from "zod"

import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import { APEX_PING_EVERY_MS, num } from "@/lib/protocols/apex/translate"
import { apexMarketIdOf } from "@/server/protocols/apex/catalogue"
import {
  apexNow,
  apexPrivate,
  apexSignature,
  apexWsBase,
  parseApexCredential,
} from "@/server/protocols/apex/client"
import {
  createPrivateFeed,
  createPrivateFillState,
  type PrivateFeedContext,
} from "@/server/protocols/private-feed"
import { venueTouchedAt } from "@/server/protocols/touched"

/**
 * ApeX Omni's private socket: one signed-in line per wallet that says the
 * moment an order fills, is cancelled, or the account changes.
 *
 * The login frame is ApeX's Node connector's (`WSClient.authenticate`):
 * `{"op":"login","args":["<json>"]}`, the JSON naming the topic
 * `ws_zk_accounts_v3`, the key and passphrase, a timestamp, and the same
 * HMAC as a REST request over `timestamp + "GET" + "/ws/accounts"`. The
 * task's own notes said `/realtime_private`; the connector is ApeX's code
 * and signs `/ws/accounts`, so that is what is signed.
 *
 * Pushes come under that topic as a snapshot and then deltas, each with
 * `contents` holding `fills`, `orders`, `positions` and the wallets. A fill
 * becomes a Journal row; any change tells the account read to look again.
 */

const TOPIC = "ws_zk_accounts_v3"
const SIGNED_PATH = "/ws/accounts"

type Connection = { close: () => void }

function send(socket: WebSocket, frame: unknown): void {
  try {
    socket.send(JSON.stringify(frame))
  } catch {
    // The manager replaces a socket that cannot accept a frame.
  }
}

/** The login frame, or null when the stored credential does not read. */
export async function apexLoginFrame(
  network: NetworkId,
  blob: string | null,
  timestamp?: number
): Promise<{ op: "login"; args: [string] } | null> {
  let credential
  try {
    credential = parseApexCredential(blob)
  } catch {
    return null
  }
  const stamp = timestamp ?? (await apexNow(network))
  return {
    op: "login",
    args: [
      JSON.stringify({
        type: "login",
        topics: [TOPIC],
        httpMethod: "GET",
        requestPath: SIGNED_PATH,
        apiKey: credential.key,
        passphrase: credential.passphrase,
        timestamp: stamp,
        signature: apexSignature({
          timestamp: stamp,
          method: "GET",
          path: SIGNED_PATH,
          data: "",
          secret: credential.secret,
        }),
      }),
    ],
  }
}

const fillSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    orderId: z.union([z.string(), z.number()]).optional(),
    symbol: z.string(),
    side: z.string(),
    price: z.union([z.string(), z.number()]),
    size: z.union([z.string(), z.number()]),
    fee: z.union([z.string(), z.number()]).optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
    isOpen: z.boolean().optional(),
    isLiquidate: z.boolean().optional(),
    direction: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough()

/**
 * One ApeX fill as a Journal row.
 *
 * - **The key is ApeX's own fill id**, so the same fill pushed and then read
 *   back in a recovery is one row: the database key removes the repeat.
 * - **`closedPnl` is 0, meaning "not stated".** ApeX's fill carries its fee
 *   but no profit figure in its docs or its connector's types; profit is only
 *   stated per whole close (`/v3/historical-pnl`). The registry says so with
 *   `profitPerSale: false`, so no screen counts that zero as breaking even.
 * - **The direction** comes from `isOpen` and the side: a buy that opens is
 *   "Open Long", a sell that does not is "Close Long".
 */
export async function toApexFill(
  network: NetworkId,
  raw: unknown
): Promise<WalletOrderFill | null> {
  const parsed = fillSchema.safeParse(raw)
  if (!parsed.success) return null
  const row = parsed.data
  // A fill ApeX has not settled yet is not money moved.
  if (row.status !== undefined && row.status !== "SUCCESS") return null
  const px = num(row.price)
  const sz = num(row.size)
  const side = row.side.toUpperCase()
  if (px === null || sz === null || !(sz > 0) || (side !== "BUY" && side !== "SELL")) return null
  const marketId = await apexMarketIdOf(network, row.symbol)
  if (marketId === null) return null
  const buy = side === "BUY"
  const opens = row.isOpen
  const dir =
    opens === undefined
      ? buy
        ? "Buy"
        : "Sell"
      : opens
        ? buy
          ? "Open Long"
          : "Open Short"
        : buy
          ? "Close Short"
          : "Close Long"
  return {
    fillId: String(row.id),
    orderId: String(row.orderId ?? row.id),
    marketId,
    side: buy ? "buy" : "sell",
    px,
    sz,
    at: row.createdAt ?? row.updatedAt ?? Date.now(),
    closedPnl: 0,
    fee: num(row.fee) ?? 0,
    dir,
    liquidation: row.isLiquidate === true,
  }
}

type Push = { contents?: { fills?: unknown[] } }

async function pushFills(context: PrivateFeedContext, message: Push): Promise<void> {
  for (const raw of message.contents?.fills ?? []) {
    const fill = await toApexFill(context.network, raw)
    if (fill) fillState.push(context.network, context.keyId, fill)
  }
}

function connect(context: PrivateFeedContext): Connection {
  let socket: WebSocket | null = null
  let pinger: ReturnType<typeof setInterval> | null = null
  let closed = false

  void (async () => {
    const login = await apexLoginFrame(context.network, context.credential()).catch(() => null)
    if (closed) return
    if (!login) {
      context.fail()
      return
    }
    try {
      socket = new WebSocket(
        `${apexWsBase(context.network)}/realtime_private?v=2&timestamp=${JSON.parse(login.args[0]).timestamp}`
      )
    } catch {
      // A malformed TRADE_APEX_WS, or a network ApeX is not carried on.
      // Thrown out of this unawaited block it would end the process.
      context.fail()
      return
    }
    const line = socket
    line.addEventListener("open", () => {
      context.opened()
      send(line, login)
      pinger = setInterval(
        () => send(line, { op: "ping", args: [String(Date.now())] }),
        APEX_PING_EVERY_MS
      )
      pinger.unref?.()
    })
    line.addEventListener("message", (event) => {
      context.alive()
      let message: Record<string, unknown>
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>
      } catch {
        return
      }
      if (message.op === "ping") {
        send(line, { op: "pong", args: Array.isArray(message.args) ? message.args : [String(Date.now())] })
        return
      }
      const request = message.request as { op?: unknown } | undefined
      if (request?.op === "login") {
        // ApeX answers `success` as a boolean or the text "true". Its docs
        // subscribe to the topic again after logging in, and a snapshot of
        // the whole account follows.
        if (message.success === true || message.success === "true") {
          send(line, { op: "subscribe", args: [TOPIC] })
          context.watching()
        } else {
          context.fail()
        }
        return
      }
      if (message.topic !== TOPIC) return
      context.changed()
      // A fill whose market cannot be named (the catalogue did not load) is
      // left to the REST recovery the change just asked for, rather than
      // becoming an unhandled rejection.
      pushFills(context, message as Push).catch(() => {})
    })
    line.addEventListener("close", context.fail)
    line.addEventListener("error", context.fail)
  })()

  return {
    close: () => {
      closed = true
      if (pinger) clearInterval(pinger)
      pinger = null
      socket?.close()
    },
  }
}

const feed = createPrivateFeed<Connection>({
  storageKey: "apex",
  touchedAt: () => venueTouchedAt("apex"),
  connect,
  close: (connection) => connection.close(),
})
const fillState = createPrivateFillState<WalletOrderFill>(feed, "apex", "ApeX Omni")

/** Whether the private line vouches that nothing changed since `at`. */
export function apexQuietSince(
  network: NetworkId,
  keyId: string,
  credential: () => string | null,
  at: number
): boolean {
  return feed.quietSince(network, keyId, credential, at)
}

/** Keeps the private line open and hands its fill rows to Trade. */
export function watchApexFills(
  network: NetworkId,
  address: string,
  listenerId: string,
  credential: () => string | null,
  onFill: (fill: WalletOrderFill) => void
): void {
  fillState.watch(network, address.toLowerCase(), listenerId, credential, onFill)
}

/** Startup, a pushed change and a reconnect each ask for one REST read. */
export function apexFillsNeedRecovery(
  network: NetworkId,
  address: string,
  credential: () => string | null
): boolean {
  return fillState.needsRecovery(network, address.toLowerCase(), credential)
}

/**
 * The account's fills since `since`, read from `GET /v3/fills`, newest pages
 * first, 100 a page, at most ten pages. Said recovered only when the read
 * finished, so a failed one is asked again on the next pass.
 */
export async function fetchApexOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credential: () => string | null,
  priority: "background" | "order" = "background"
): Promise<WalletOrderFill[]> {
  const apex = parseApexCredential(credential())
  const fills: WalletOrderFill[] = []
  const startedAt = Date.now()
  for (let page = 0; page < 10; page += 1) {
    const answer = (await apexPrivate(
      network,
      apex,
      "GET",
      "/fills",
      { beginTimeInclusive: Math.max(0, Math.floor(since)), limit: 100, page },
      { priority }
    )) as { orders?: unknown[] } | unknown[] | null
    const rows = Array.isArray(answer) ? answer : (answer?.orders ?? [])
    for (const raw of rows) {
      const fill = await toApexFill(network, raw)
      if (fill && fill.at >= since) fills.push(fill)
    }
    if (rows.length < 100) break
  }
  fillState.recovered(network, address.toLowerCase(), startedAt)
  return fills
}
