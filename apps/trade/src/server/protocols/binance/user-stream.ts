import { z } from "zod"

import type {
  NetworkId,
  WalletOrderFill,
  WalletOrderInfo,
} from "@/lib/protocols/contracts"
import { coinNameFor } from "@/lib/protocols/binance/translate"
import { num } from "@/lib/protocols/number"
import { reconnectDelay } from "@/lib/protocols/timing"
import {
  binanceCredentialOf,
  clearBinanceAccountReads,
} from "@/server/protocols/binance/account"
import { binanceSigned } from "@/server/protocols/binance/client"

/**
 * Binance's private account stream: fills pushed the moment they happen.
 *
 * A listen key from `POST /fapi/v1/listenKey` opens the stream and lasts 60
 * minutes unless renewed, so it is renewed every 30. The address is the one
 * Binance's own SDK builds for account streams since the April 2026 split:
 * `/private/stream?streams=<listen key>`. A made-up key opened and stayed
 * silent on 24 Sep 2026, so only a real key proves messages arrive
 * (`binance.md`).
 *
 * Three messages matter:
 * - `ORDER_TRADE_UPDATE` with execution `TRADE` is one fill.
 * - `ALGO_UPDATE` says a stop or target fired and which plain order it
 *   became (`ai`), so a fill on that order can be named as the stop.
 * - `ACCOUNT_UPDATE` says balances or positions moved, so held account reads
 *   are dropped.
 *
 * The REST read in `orders.ts` stays the safety net: at start, after any gap
 * in the stream, and whenever a fill arrived that could not be read.
 */

const PRIVATE_SOCKET = "wss://fstream.binance.com/private/stream?streams="
const KEEP_ALIVE_MS = 30 * 60_000
const WATCHDOG_MS = 3_000
const IDLE_MS = 10 * 60_000
const KEEP_FILLS = 5_000
const KEEP_STOPS = 2_000

type Listener = (fill: WalletOrderFill) => void

type Line = {
  network: NetworkId
  address: string
  credential: () => string | null
  listeners: Map<string, Listener>
  socket: WebSocket | null
  keepAlive: ReturnType<typeof setInterval> | null
  watchdog: ReturnType<typeof setInterval> | null
  generation: number
  attempts: number
  reconnectAt: number
  dialling: boolean
  askedAt: number
  healthy: boolean
  changedAt: number
  needsRecovery: boolean
  recoveryVersion: number
  coveredFrom: number
  fills: Map<string, WalletOrderFill>
  /** The plain order a fired stop or target became, and what it was. */
  stops: Map<string, WalletOrderInfo>
}

const scope = globalThis as { __tradeBinanceUserLines?: Map<string, Line> }

function lines(): Map<string, Line> {
  return (scope.__tradeBinanceUserLines ??= new Map())
}

function keyFor(network: NetworkId, address: string): string {
  return `${network}:${address}`
}

const decimal = z.union([z.string(), z.number()])

const orderUpdateSchema = z.object({
  e: z.literal("ORDER_TRADE_UPDATE"),
  o: z.object({
    s: z.string(),
    S: z.enum(["BUY", "SELL"]),
    x: z.string(),
    i: z.union([z.string(), z.number()]),
    l: decimal,
    L: decimal,
    n: decimal.optional(),
    T: decimal,
    t: z.union([z.string(), z.number()]),
    rp: decimal.optional(),
    o: z.string().optional(),
    ot: z.string().optional(),
  }),
})

const algoUpdateSchema = z.object({
  e: z.literal("ALGO_UPDATE"),
  o: z.object({
    o: z.string().optional(),
    ai: z.union([z.string(), z.number()]).optional(),
    tp: decimal.optional(),
  }),
})

/** Binance's account stream wraps each message as `{ stream, data }`. */
function unwrap(message: unknown): unknown {
  const data = (message as { data?: unknown } | null)?.data
  return data && typeof data === "object" ? data : message
}

/** One pushed fill in the app's shape, or null. Exported for tests. */
export function binanceStreamFill(message: unknown): WalletOrderFill | null {
  const parsed = orderUpdateSchema.safeParse(unwrap(message))
  if (!parsed.success) return null
  const row = parsed.data.o
  const sz = num(row.l)
  const px = num(row.L)
  const at = num(row.T)
  const marketId = coinNameFor(row.s)
  if (
    row.x !== "TRADE" ||
    marketId === null ||
    sz === null ||
    !(sz > 0) ||
    px === null ||
    !(px > 0) ||
    at === null ||
    at < 0
  ) {
    return null
  }
  const pnl = num(row.rp) ?? 0
  return {
    fillId: String(row.t),
    orderId: String(row.i),
    marketId,
    side: row.S === "BUY" ? "buy" : "sell",
    px,
    sz,
    at,
    closedPnl: pnl,
    fee: num(row.n) ?? 0,
    dir:
      pnl === 0
        ? row.S === "BUY"
          ? "Open long"
          : "Open short"
        : row.S === "BUY"
          ? "Close short"
          : "Close long",
    liquidation: row.o === "LIQUIDATION" || row.ot === "LIQUIDATION",
  }
}

/** A fired stop or target and the plain order it became. Exported for tests. */
export function binanceStreamStop(
  message: unknown
): { orderId: string; info: WalletOrderInfo } | null {
  const parsed = algoUpdateSchema.safeParse(unwrap(message))
  if (!parsed.success) return null
  const row = parsed.data.o
  const orderId = row.ai === undefined ? "" : String(row.ai)
  if (!orderId || orderId === "0") return null
  const type = row.o?.toUpperCase()
  const kind =
    type === "STOP_MARKET" ? "stop" : type === "TAKE_PROFIT_MARKET" ? "target" : null
  if (!kind) return null
  return { orderId, info: { kind, triggerPx: num(row.tp) } }
}

function forgetOld(line: Line): void {
  if (line.fills.size > KEEP_FILLS) {
    const fills = [...line.fills.values()].sort((a, b) => a.at - b.at)
    const dropped = fills.slice(0, fills.length - KEEP_FILLS)
    for (const fill of dropped) line.fills.delete(fill.fillId)
    const oldest = fills[dropped.length]
    if (oldest) line.coveredFrom = Math.max(line.coveredFrom, oldest.at)
  }
  while (line.stops.size > KEEP_STOPS) {
    const first = line.stops.keys().next().value
    if (first === undefined) break
    line.stops.delete(first)
  }
}

function needRecovery(line: Line): void {
  line.needsRecovery = true
  line.recoveryVersion += 1
}

function teardown(line: Line): void {
  if (line.keepAlive) {
    clearInterval(line.keepAlive)
    line.keepAlive = null
  }
  const socket = line.socket
  line.socket = null
  line.healthy = false
  try {
    socket?.close()
  } catch {
    // A socket that cannot close is already gone.
  }
}

function schedule(line: Line): void {
  line.healthy = false
  needRecovery(line)
  line.reconnectAt = Date.now() + reconnectDelay(line.attempts)
  line.attempts += 1
}

function drop(line: Line): void {
  line.generation += 1
  teardown(line)
  schedule(line)
}

function listenKeyCall(line: Line, method: "POST" | "PUT"): Promise<unknown> {
  return binanceSigned(
    line.network,
    binanceCredentialOf(line.credential),
    method,
    "/fapi/v1/listenKey",
    {},
    { acting: false, priority: "order" }
  )
}

function onMessage(line: Line, raw: unknown): void {
  const message = unwrap(raw) as { e?: unknown }
  const eventName = message?.e
  if (eventName === "listenKeyExpired") {
    drop(line)
    return
  }
  if (
    eventName === "ORDER_TRADE_UPDATE" ||
    eventName === "ACCOUNT_UPDATE" ||
    eventName === "ALGO_UPDATE"
  ) {
    line.changedAt = Date.now()
    clearBinanceAccountReads()
  }
  const stop = binanceStreamStop(message)
  if (stop) {
    line.stops.set(stop.orderId, stop.info)
    forgetOld(line)
  }
  const fill = binanceStreamFill(message)
  if (fill) {
    line.fills.set(fill.fillId, fill)
    forgetOld(line)
    for (const listener of line.listeners.values()) {
      try {
        listener(fill)
      } catch (error) {
        console.error("Binance fill listener failed", error)
      }
    }
    return
  }
  // A trade that could not be read is a fill the stream missed.
  const execution = (message as { o?: { x?: unknown } }).o?.x
  if (eventName === "ORDER_TRADE_UPDATE" && execution === "TRADE") {
    needRecovery(line)
  }
}

async function connect(line: Line): Promise<void> {
  if (line.dialling) return
  line.dialling = true
  const generation = (line.generation += 1)
  teardown(line)
  let listenKey: string
  try {
    listenKey = z
      .object({ listenKey: z.string().min(1) })
      .parse(await listenKeyCall(line, "POST")).listenKey
  } catch {
    line.dialling = false
    schedule(line)
    startWatchdog(line)
    return
  }
  if (generation !== line.generation) {
    line.dialling = false
    return
  }
  let socket: WebSocket
  try {
    socket = new WebSocket(`${PRIVATE_SOCKET}${encodeURIComponent(listenKey)}`)
  } catch {
    line.dialling = false
    schedule(line)
    startWatchdog(line)
    return
  }
  line.socket = socket
  line.dialling = false
  socket.addEventListener("open", () => {
    if (generation !== line.generation) return
    line.healthy = true
    line.attempts = 0
    line.keepAlive = setInterval(() => {
      // A renewal Binance refuses means the key is gone, so the stream is.
      void listenKeyCall(line, "PUT").catch(() => {
        if (generation === line.generation) drop(line)
      })
    }, KEEP_ALIVE_MS)
    line.keepAlive.unref?.()
  })
  socket.addEventListener("message", (event) => {
    if (generation !== line.generation) return
    let message: unknown
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    onMessage(line, message)
  })
  const dropped = () => {
    if (generation === line.generation) drop(line)
  }
  socket.addEventListener("close", dropped)
  socket.addEventListener("error", dropped)
  startWatchdog(line)
}

function startWatchdog(line: Line): void {
  if (line.watchdog) return
  line.watchdog = setInterval(() => {
    const now = Date.now()
    if (now - line.askedAt >= IDLE_MS) {
      line.generation += 1
      teardown(line)
      if (line.watchdog) clearInterval(line.watchdog)
      line.watchdog = null
      lines().delete(keyFor(line.network, line.address))
      return
    }
    if (!line.socket && !line.dialling && now >= line.reconnectAt) {
      void connect(line)
    }
  }, WATCHDOG_MS)
  line.watchdog.unref?.()
}

export function watchBinanceFills(
  network: NetworkId,
  address: string,
  listenerId: string,
  credential: () => string | null,
  onFill: Listener
): void {
  if (network !== "mainnet") return
  const key = keyFor(network, address)
  let line = lines().get(key)
  if (!line) {
    line = {
      network,
      address,
      credential,
      listeners: new Map(),
      socket: null,
      keepAlive: null,
      watchdog: null,
      generation: 0,
      attempts: 0,
      reconnectAt: 0,
      dialling: false,
      askedAt: Date.now(),
      healthy: false,
      changedAt: 0,
      needsRecovery: true,
      recoveryVersion: 0,
      coveredFrom: Date.now(),
      fills: new Map(),
      stops: new Map(),
    }
    lines().set(key, line)
    void connect(line)
  }
  line.credential = credential
  line.askedAt = Date.now()
  line.listeners.set(listenerId, onFill)
}

export function binanceFillsNeedRecovery(
  network: NetworkId,
  address: string
): boolean {
  return lines().get(keyFor(network, address))?.needsRecovery ?? true
}

export function binanceFillsRecoveryVersion(
  network: NetworkId,
  address: string
): number {
  return lines().get(keyFor(network, address))?.recoveryVersion ?? 0
}

export function markBinanceFillsRecovered(
  network: NetworkId,
  address: string,
  since: number,
  fills: readonly WalletOrderFill[],
  recoveryVersion: number
): void {
  const line = lines().get(keyFor(network, address))
  if (!line?.healthy || recoveryVersion !== line.recoveryVersion) return
  for (const fill of fills) line.fills.set(fill.fillId, fill)
  line.coveredFrom = Math.min(line.coveredFrom, since)
  line.needsRecovery = false
  forgetOld(line)
}

/**
 * Fills the stream has seen since a moment, or null when the stream cannot
 * vouch for the whole stretch and the REST read must answer instead.
 */
export function binanceFillsFromStream(
  network: NetworkId,
  address: string,
  since: number,
  credential: () => string | null
): WalletOrderFill[] | null {
  watchBinanceFills(network, address, "__binance_fill_cache__", credential, () => {})
  const line = lines().get(keyFor(network, address))
  if (!line?.healthy || line.needsRecovery || since < line.coveredFrom) {
    return null
  }
  return [...line.fills.values()]
    .filter((fill) => fill.at >= since)
    .sort((a, b) => a.at - b.at)
}

/** What a plain order was, when the stream saw a stop or target become it. */
export function binanceStopKindOf(
  network: NetworkId,
  address: string,
  orderId: string
): WalletOrderInfo | null {
  return lines().get(keyFor(network, address))?.stops.get(orderId) ?? null
}

export function binanceUserStreamState(
  network: NetworkId,
  address: string
): { healthy: boolean; attempts: number; changedAt: number } {
  const line = lines().get(keyFor(network, address))
  return {
    healthy: line?.healthy ?? false,
    attempts: line?.attempts ?? 0,
    changedAt: line?.changedAt ?? 0,
  }
}
