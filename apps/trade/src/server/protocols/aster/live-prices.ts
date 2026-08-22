import type { NetworkId } from "@/lib/protocols/contracts"
import {
  asterReconnectDelay,
  asterWsUrl,
  num,
} from "@/lib/protocols/aster/translate"

const STALE_AFTER_MS = 12_000
const WATCHDOG_EVERY_MS = 4_000

type Hub = {
  network: NetworkId
  prices: Map<string, number>
  socket: WebSocket | null
  generation: number
  lastMessageAt: number
  reconnectAt: number
  attempts: number
  watchdog: ReturnType<typeof setInterval> | null
}

const scope = globalThis as { __tradeAsterPriceHubs?: Map<NetworkId, Hub> }

function hubFor(network: NetworkId): Hub {
  const hubs = (scope.__tradeAsterPriceHubs ??= new Map())
  const found = hubs.get(network)
  if (found) return found
  const made: Hub = {
    network,
    prices: new Map(),
    socket: null,
    generation: 0,
    lastMessageAt: 0,
    reconnectAt: 0,
    attempts: 0,
    watchdog: null,
  }
  hubs.set(network, made)
  return made
}

export function openAsterLivePrices(network: NetworkId): void {
  const hub = hubFor(network)
  if (!hub.socket && hub.reconnectAt === 0) connect(hub)
}

export function readAsterLivePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
  ageMs: number
} {
  const hub = hubFor(network)
  return {
    prices: hub.prices,
    ageMs: hub.lastMessageAt === 0 ? Infinity : Date.now() - hub.lastMessageAt,
  }
}

export function asterLivePricesFresh(network: NetworkId): boolean {
  return readAsterLivePrices(network).ageMs <= STALE_AFTER_MS
}

export function closeAsterLivePrices(network: NetworkId): void {
  const hub = hubFor(network)
  hub.generation += 1
  teardown(hub)
  if (hub.watchdog) clearInterval(hub.watchdog)
  hub.watchdog = null
  hub.prices.clear()
  hub.lastMessageAt = 0
  hub.reconnectAt = 0
  hub.attempts = 0
}

function applyMarks(hub: Hub, packet: unknown): void {
  const rows = Array.isArray(packet)
    ? packet
    : Array.isArray((packet as { data?: unknown })?.data)
      ? (packet as { data: unknown[] }).data
      : []
  let sawOne = false
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    if (row.e !== "markPriceUpdate" || typeof row.s !== "string") continue
    const price = num(row.p)
    if (price === null || !(price > 0)) continue
    hub.prices.set(row.s, price)
    sawOne = true
  }
  if (sawOne) hub.lastMessageAt = Date.now()
}

function teardown(hub: Hub): void {
  const socket = hub.socket
  hub.socket = null
  if (socket) {
    try {
      socket.close()
    } catch {
      // The socket is already gone.
    }
  }
}

function scheduleReconnect(hub: Hub): void {
  hub.reconnectAt = Date.now() + asterReconnectDelay(hub.attempts)
  hub.attempts += 1
}

function connect(hub: Hub): void {
  const generation = (hub.generation += 1)
  teardown(hub)
  let socket: WebSocket
  try {
    socket = new WebSocket(asterWsUrl(hub.network))
  } catch {
    scheduleReconnect(hub)
    return
  }
  hub.socket = socket
  socket.addEventListener("open", () => {
    if (generation !== hub.generation) return
    socket.send(JSON.stringify({ method: "SUBSCRIBE", params: ["!markPrice@arr@1s"], id: 1 }))
  })
  socket.addEventListener("message", (event) => {
    if (generation !== hub.generation) return
    hub.attempts = 0
    try {
      applyMarks(hub, JSON.parse(String(event.data)))
    } catch {
      // A malformed frame carries no usable price.
    }
  })
  const gone = () => {
    if (generation !== hub.generation) return
    teardown(hub)
    scheduleReconnect(hub)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)

  if (!hub.watchdog) {
    hub.watchdog = setInterval(() => {
      if (hub.reconnectAt > 0 && Date.now() >= hub.reconnectAt) {
        hub.reconnectAt = 0
        connect(hub)
        return
      }
      if (!hub.socket || hub.reconnectAt > 0) return
      if (Date.now() - hub.lastMessageAt <= STALE_AFTER_MS) return
      teardown(hub)
      scheduleReconnect(hub)
    }, WATCHDOG_EVERY_MS)
    hub.watchdog.unref?.()
  }
}
