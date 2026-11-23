import { z } from "zod"

import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import { edgexPong, num } from "@/lib/protocols/edgex/translate"
import { edgexMarketIdOf } from "@/server/protocols/edgex/catalogue"
import {
  edgexAuthHeaders,
  edgexNow,
  edgexPrivate,
  edgexWsBase,
  parseEdgexCredential,
  type EdgexCredential,
} from "@/server/protocols/edgex/client"
import {
  createPrivateFeed,
  createPrivateFillState,
  type PrivateFeedContext,
} from "@/server/protocols/private-feed"
import { venueTouchedAt } from "@/server/protocols/touched"

/**
 * edgeX's private socket: one signed-in line per account that says the
 * moment an order fills, is cancelled, or the account changes.
 *
 * - **Signed in by the handshake, not by a message.** edgeX's page and both
 *   SDKs put the same four headers a private REST request carries on the
 *   socket's opening request, with `accountId` and `timestamp` on the
 *   address, and sign `GET`, the path and `accountId=…&timestamp=…`. Node's
 *   own WebSocket sends those headers; checked against a local server on
 *   24 Sep 2026.
 * - **No subscribe.** edgeX answers `connected`, then a `Snapshot` of the
 *   whole account, then an `ORDER_UPDATE` (and the like) whenever something
 *   changes.
 * - **edgeX pings, the app pongs** with the same time, as on the public line.
 *
 * One line per account, never one per reader: the Lighter lesson.
 */

const PRIVATE_PATH = "/api/v1/private/ws"

type Connection = { close: () => void }

function send(socket: WebSocket, frame: unknown): void {
  try {
    socket.send(JSON.stringify(frame))
  } catch {
    // The manager replaces a socket that cannot accept a frame.
  }
}

/** The address and headers one account's socket opens with. */
export function edgexPrivateHandshake(
  base: string,
  credential: EdgexCredential,
  timestamp: number
): { url: string; headers: Record<string, string> } {
  const query = `accountId=${credential.accountId}&timestamp=${timestamp}`
  return {
    url: `${base}${PRIVATE_PATH}?${query}`,
    headers: edgexAuthHeaders({
      credential,
      timestamp,
      method: "GET",
      path: PRIVATE_PATH,
      body: query,
    }),
  }
}

const numeric = z.union([z.string(), z.number()])

const fillSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    orderId: z.union([z.string(), z.number()]),
    contractId: z.union([z.string(), z.number()]).optional(),
    orderSide: z.string().optional(),
    fillPrice: numeric,
    fillSize: numeric,
    fillValue: numeric.optional(),
    fillFee: numeric.optional(),
    realizePnl: numeric.optional(),
    isLiquidate: z.boolean().optional(),
    matchTime: numeric.optional(),
    createdTime: numeric.optional(),
  })
  .passthrough()

/** What the order behind a fill says, for a pushed fill that leaves it out. */
type OrderFacts = { side?: string; contractId?: string }

/**
 * One edgeX fill as a Journal row, or null when it cannot be one.
 *
 * - **The key is edgeX's own fill id**, so the same fill pushed and then read
 *   back in a recovery is one row: the database key removes the repeat.
 * - **Profit is edgeX's `realizePnl` with the fee put back.** edgeX folds the
 *   fee into it: its fill-page example shows an opening fill with
 *   `fillFee` 0.017540 and `realizePnl` -0.017540. Every other venue here
 *   keeps the fee apart, so the row's profit is `realizePnl + fillFee` and
 *   its fee is `fillFee`. An opening fill then banks zero, as it should.
 * - **No profit, no row.** edgeX's page says its socket example leaves
 *   `realizePnl` out. A row without it is not made at all (`null`), because
 *   `profitPerSale` is true and a zero would read as "made nothing". The
 *   caller reads that fill back from the fill page instead.
 * - A pushed fill names no side or contract in edgeX's example; they come
 *   from the order the same push carries.
 */
export async function toEdgexFill(
  network: NetworkId,
  raw: unknown,
  order: OrderFacts = {}
): Promise<WalletOrderFill | null> {
  const parsed = fillSchema.safeParse(raw)
  if (!parsed.success) return null
  const row = parsed.data
  const px = num(row.fillPrice)
  const sz = num(row.fillSize)
  const realized = num(row.realizePnl)
  const side = (row.orderSide ?? order.side ?? "").toUpperCase()
  const contractId = String(row.contractId ?? order.contractId ?? "")
  if (
    px === null ||
    sz === null ||
    !(sz > 0) ||
    realized === null ||
    (side !== "BUY" && side !== "SELL") ||
    !contractId
  ) {
    return null
  }
  const marketId = await edgexMarketIdOf(network, contractId)
  if (marketId === null) return null
  const fee = num(row.fillFee) ?? 0
  return {
    fillId: String(row.id),
    orderId: String(row.orderId),
    marketId,
    side: side === "BUY" ? "buy" : "sell",
    px,
    sz,
    at: num(row.matchTime) ?? num(row.createdTime) ?? Date.now(),
    closedPnl: realized + fee,
    fee,
    // edgeX's fill does not say whether it opened or closed.
    dir: side === "BUY" ? "Buy" : "Sell",
    liquidation: row.isLiquidate === true,
  }
}

type TradeEvent = {
  type?: unknown
  content?: {
    event?: unknown
    data?: { order?: unknown[]; orderFillTransaction?: unknown[] }
  }
}

/** The order records a push carries, by order id. */
function ordersIn(message: TradeEvent): Map<string, OrderFacts> {
  const orders = new Map<string, OrderFacts>()
  for (const raw of message.content?.data?.order ?? []) {
    const one = raw as { id?: unknown; side?: unknown; contractId?: unknown }
    if (one?.id === undefined) continue
    orders.set(String(one.id), {
      side: typeof one.side === "string" ? one.side : undefined,
      contractId: one.contractId === undefined ? undefined : String(one.contractId),
    })
  }
  return orders
}

/**
 * The fills in one push, as Journal rows. A fill whose profit the push left
 * out is read back from the fill page by its order id, one request, so the
 * Journal still has it within a second rather than at the next recovery.
 */
export async function edgexPushedFills(
  network: NetworkId,
  message: TradeEvent,
  readOrderFills: (orderId: string) => Promise<unknown[]>
): Promise<WalletOrderFill[]> {
  const orders = ordersIn(message)
  const fills: WalletOrderFill[] = []
  const lookedUp = new Map<string, Promise<unknown[]>>()
  for (const raw of message.content?.data?.orderFillTransaction ?? []) {
    const orderId = String((raw as { orderId?: unknown })?.orderId ?? "")
    const order = orders.get(orderId) ?? {}
    const direct = await toEdgexFill(network, raw, order)
    if (direct) {
      fills.push(direct)
      continue
    }
    if (!orderId) continue
    let page = lookedUp.get(orderId)
    if (!page) {
      page = readOrderFills(orderId)
      lookedUp.set(orderId, page)
    }
    const fillId = String((raw as { id?: unknown })?.id ?? "")
    const match = (await page).find(
      (one) => String((one as { id?: unknown })?.id ?? "") === fillId
    )
    const read = match ? await toEdgexFill(network, match, order) : null
    if (read) fills.push(read)
  }
  return fills
}

const FILL_PAGE = "/api/v2/private/order/getHistoryOrderFillTransactionPage"

async function readFillsOfOrder(
  network: NetworkId,
  credential: EdgexCredential,
  orderId: string
): Promise<unknown[]> {
  const answer = (await edgexPrivate(
    network,
    credential,
    "GET",
    FILL_PAGE,
    { filterOrderIdList: orderId, size: 100 },
    { priority: "order" }
  )) as { dataList?: unknown[] } | null
  return Array.isArray(answer?.dataList) ? answer.dataList : []
}

function connect(context: PrivateFeedContext): Connection {
  let socket: WebSocket | null = null
  let closed = false

  void (async () => {
    let credential: EdgexCredential
    let handshake: { url: string; headers: Record<string, string> }
    try {
      credential = parseEdgexCredential(context.credential())
      handshake = edgexPrivateHandshake(
        edgexWsBase(context.network),
        credential,
        await edgexNow(context.network)
      )
    } catch {
      context.fail()
      return
    }
    if (closed) return
    try {
      // Node's WebSocket takes the handshake's headers in its second
      // argument; the browser's does not, and this never runs there.
      socket = new WebSocket(
        handshake.url,
        { headers: handshake.headers } as unknown as string[]
      )
    } catch {
      context.fail()
      return
    }
    const line = socket
    line.addEventListener("open", () => context.opened())
    line.addEventListener("message", (event) => {
      context.alive()
      let message: Record<string, unknown>
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>
      } catch {
        return
      }
      const pong = edgexPong(message)
      if (pong) {
        send(line, pong)
        return
      }
      if (message.type === "connected") {
        // edgeX says `connected` only after the handshake's signature is
        // accepted; a refused one never opens.
        context.watching()
        return
      }
      if (message.type !== "trade-event") return
      context.changed()
      // A fill whose market cannot be named (the catalogue did not load) is
      // left to the REST recovery the change just asked for, rather than
      // becoming an unhandled rejection.
      edgexPushedFills(context.network, message as TradeEvent, (orderId) =>
        readFillsOfOrder(context.network, credential, orderId)
      )
        .then((fills) => {
          for (const fill of fills) fillState.push(context.network, context.keyId, fill)
        })
        .catch(() => {})
    })
    line.addEventListener("close", context.fail)
    line.addEventListener("error", context.fail)
  })()

  return {
    close: () => {
      closed = true
      socket?.close()
    },
  }
}

const feed = createPrivateFeed<Connection>({
  storageKey: "edgex",
  touchedAt: () => venueTouchedAt("edgex"),
  connect,
  close: (connection) => connection.close(),
})
const fillState = createPrivateFillState<WalletOrderFill>(feed, "edgex", "edgeX")

/** Whether the private line vouches that nothing changed since `at`. */
export function edgexQuietSince(
  network: NetworkId,
  accountId: string,
  credential: () => string | null,
  at: number
): boolean {
  return feed.quietSince(network, accountId, credential, at)
}

/** Keeps the private line open and hands its fill rows to Trade. */
export function watchEdgexFills(
  network: NetworkId,
  address: string,
  listenerId: string,
  credential: () => string | null,
  onFill: (fill: WalletOrderFill) => void
): void {
  fillState.watch(network, address.trim(), listenerId, credential, onFill)
}

/** Startup, a pushed change and a reconnect each ask for one REST read. */
export function edgexFillsNeedRecovery(
  network: NetworkId,
  address: string,
  credential: () => string | null
): boolean {
  return fillState.needsRecovery(network, address.trim(), credential)
}

/**
 * The account's fills since `since`, from the fill page, 100 a page, at most
 * ten pages, newest first. Said recovered only when the read finished, so a
 * failed one is asked again on the next pass.
 */
export async function fetchEdgexOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credential: () => string | null,
  priority: "background" | "order" = "background"
): Promise<WalletOrderFill[]> {
  const edgex = parseEdgexCredential(credential())
  const fills: WalletOrderFill[] = []
  const startedAt = Date.now()
  let offsetData = ""
  for (let page = 0; page < 10; page += 1) {
    const answer = (await edgexPrivate(
      network,
      edgex,
      "GET",
      FILL_PAGE,
      {
        size: 100,
        filterStartCreatedTimeInclusive: Math.max(0, Math.floor(since)),
        offsetData,
      },
      { priority }
    )) as { dataList?: unknown[]; nextPageOffsetData?: unknown } | null
    const rows = Array.isArray(answer?.dataList) ? answer.dataList : []
    for (const raw of rows) {
      const fill = await toEdgexFill(network, raw)
      if (fill && fill.at >= since) fills.push(fill)
    }
    offsetData = typeof answer?.nextPageOffsetData === "string" ? answer.nextPageOffsetData : ""
    if (!offsetData || rows.length === 0) break
  }
  fillState.recovered(network, address.trim(), startedAt)
  return fills
}
