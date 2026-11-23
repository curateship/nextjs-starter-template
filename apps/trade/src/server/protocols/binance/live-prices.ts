import type { NetworkId } from "@/lib/protocols/contracts"
import {
  BINANCE_MARKET_SOCKET,
  coinNameFor,
} from "@/lib/protocols/binance/translate"
import { num } from "@/lib/protocols/number"
import { reconnectDelay } from "@/lib/protocols/timing"

/**
 * Binance's mark prices, pushed once a second for every market down one
 * socket, for the engine to read instead of asking. Keyed by the app's coin
 * name, the same id every Binance market row carries.
 *
 * Mainnet only, like everything Binance here. A testnet caller gets nothing
 * rather than a real price under a practice label.
 */

const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000

type Hub = {
  prices: Map<string, number>
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  /** When the current socket was opened, so a silent one can be timed. */
  dialledAt: number
  reconnectAt: number
  attempts: number
  watchdog: ReturnType<typeof setInterval> | null
}

const scope = globalThis as { __tradeBinancePriceHub?: Hub }

function hub(): Hub {
  return (scope.__tradeBinancePriceHub ??= {
    prices: new Map(),
    socket: null,
    generation: 0,
    lastMessageAt: 0,
    dialledAt: 0,
    reconnectAt: 0,
    attempts: 0,
    watchdog: null,
  })
}

export function openBinanceLivePrices(network: NetworkId): void {
  if (network !== "mainnet") return
  const one = hub()
  if (!one.socket && one.reconnectAt === 0) connect(one)
}

export function readBinanceLivePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
  ageMs: number
} {
  if (network !== "mainnet") return { prices: new Map(), ageMs: Infinity }
  const one = hub()
  return {
    prices: one.prices,
    ageMs: one.lastMessageAt === 0 ? Infinity : Date.now() - one.lastMessageAt,
  }
}

export function binanceLivePricesFresh(network: NetworkId): boolean {
  return readBinanceLivePrices(network).ageMs <= STALE_AFTER_MS
}

/** One pushed frame's marks, by coin name. Exported for its test. */
export function binanceMarksOf(packet: unknown): Map<string, number> {
  const marks = new Map<string, number>()
  const rows = Array.isArray(packet)
    ? packet
    : Array.isArray((packet as { data?: unknown } | null)?.data)
      ? (packet as { data: unknown[] }).data
      : []
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    if (row.e !== "markPriceUpdate" || typeof row.s !== "string") continue
    const coin = coinNameFor(row.s)
    const price = num(row.p)
    if (coin === null || price === null || !(price > 0)) continue
    marks.set(coin, price)
  }
  return marks
}

function teardown(one: Hub): void {
  const socket = one.socket
  one.socket = null
  try {
    socket?.close()
  } catch {
    // The socket is already gone.
  }
}

function scheduleReconnect(one: Hub): void {
  one.reconnectAt = Date.now() + reconnectDelay(one.attempts)
  one.attempts += 1
}

function connect(one: Hub): void {
  const generation = (one.generation += 1)
  teardown(one)
  let socket: WebSocket
  try {
    socket = new WebSocket(BINANCE_MARKET_SOCKET)
  } catch {
    scheduleReconnect(one)
    return
  }
  one.socket = socket
  one.dialledAt = Date.now()
  socket.addEventListener("open", () => {
    if (generation !== one.generation) return
    socket.send(
      JSON.stringify({ method: "SUBSCRIBE", params: ["!markPrice@arr@1s"], id: 1 })
    )
  })
  socket.addEventListener("message", (event) => {
    if (generation !== one.generation) return
    let marks: Map<string, number>
    try {
      marks = binanceMarksOf(JSON.parse(String(event.data)))
    } catch {
      return
    }
    if (marks.size === 0) return
    one.attempts = 0
    for (const [coin, price] of marks) one.prices.set(coin, price)
    one.lastMessageAt = Date.now()
  })
  const gone = () => {
    if (generation !== one.generation) return
    teardown(one)
    scheduleReconnect(one)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)

  if (!one.watchdog) {
    one.watchdog = setInterval(() => {
      if (one.reconnectAt > 0 && Date.now() >= one.reconnectAt) {
        one.reconnectAt = 0
        connect(one)
        return
      }
      if (!one.socket || one.reconnectAt > 0) return
      // A socket that stays open and sends nothing is the failure Binance's
      // old address showed. It counts as down.
      const heardAt = Math.max(one.lastMessageAt, one.dialledAt)
      if (Date.now() - heardAt <= STALE_AFTER_MS) return
      teardown(one)
      scheduleReconnect(one)
    }, WATCHDOG_EVERY_MS)
    one.watchdog.unref?.()
  }
}
