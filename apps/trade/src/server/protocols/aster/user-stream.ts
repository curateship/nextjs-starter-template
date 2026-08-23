import { z } from "zod"

import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import {
  asterReconnectDelay,
  asterWsUrl,
  num,
} from "@/lib/protocols/aster/translate"
import { clearAsterAccountCache } from "@/server/protocols/aster/account"
import {
  asterSigned,
  parseAsterCredential,
} from "@/server/protocols/aster/client"

const listenKeySchema = z.object({ listenKey: z.string().min(1) })
const KEEP_ALIVE_MS = 30 * 60_000
const WATCHDOG_MS = 3_000
const IDLE_MS = 10 * 60_000

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
}

const scope = globalThis as {
  __tradeAsterUserLines?: Map<string, Line>
}

function lines(): Map<string, Line> {
  return (scope.__tradeAsterUserLines ??= new Map())
}

function keyFor(network: NetworkId, address: string): string {
  return `${network}:${address.toLowerCase()}`
}

function schedule(line: Line): void {
  line.healthy = false
  line.needsRecovery = true
  line.reconnectAt = Date.now() + asterReconnectDelay(line.attempts)
  line.attempts += 1
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

function credentialOf(line: Line) {
  const blob = line.credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  return parseAsterCredential(blob)
}

async function renew(line: Line): Promise<void> {
  await asterSigned(
    line.network,
    line.address,
    credentialOf(line),
    "PUT",
    "/fapi/v3/listenKey",
    1,
    {},
    { countsAsOrder: false }
  )
}

function fillOf(message: unknown): WalletOrderFill | null {
  const parsed = z
    .object({
      e: z.string(),
      o: z.object({
        s: z.string(),
        S: z.string(),
        x: z.string(),
        X: z.string(),
        i: z.union([z.string(), z.number()]),
        l: z.union([z.string(), z.number()]),
        L: z.union([z.string(), z.number()]),
        n: z.union([z.string(), z.number()]).optional(),
        T: z.union([z.string(), z.number()]),
        t: z.union([z.string(), z.number()]),
        rp: z.union([z.string(), z.number()]).optional(),
        ot: z.string().optional(),
      }),
    })
    .safeParse(message)
  if (!parsed.success || parsed.data.e !== "ORDER_TRADE_UPDATE") return null
  const row = parsed.data.o
  const sz = num(row.l)
  const px = num(row.L)
  const at = num(row.T)
  if (
    row.x !== "TRADE" ||
    sz === null ||
    !(sz > 0) ||
    px === null ||
    at === null
  ) {
    return null
  }
  const pnl = num(row.rp) ?? 0
  return {
    fillId: String(row.t),
    orderId: String(row.i),
    marketId: row.s,
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
    liquidation: row.ot === "LIQUIDATION",
  }
}

async function connect(line: Line): Promise<void> {
  if (line.dialling) return
  line.dialling = true
  const generation = (line.generation += 1)
  teardown(line)
  let listenKey: string
  try {
    const answer = await asterSigned(
      line.network,
      line.address,
      credentialOf(line),
      "POST",
      "/fapi/v3/listenKey",
      1,
      {},
      { countsAsOrder: false }
    )
    listenKey = listenKeySchema.parse(answer).listenKey
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
    socket = new WebSocket(
      `${asterWsUrl(line.network)}/${encodeURIComponent(listenKey)}`
    )
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
      void renew(line).catch(() => {
        if (generation !== line.generation) return
        line.generation += 1
        teardown(line)
        schedule(line)
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
    const eventName = (message as { e?: unknown }).e
    if (eventName === "ORDER_TRADE_UPDATE" || eventName === "ACCOUNT_UPDATE") {
      line.changedAt = Date.now()
      clearAsterAccountCache()
    }
    const fill = fillOf(message)
    if (fill) for (const listener of line.listeners.values()) listener(fill)
    if (eventName === "listenKeyExpired") {
      line.generation += 1
      teardown(line)
      schedule(line)
    }
  })
  const dropped = () => {
    if (generation !== line.generation) return
    line.generation += 1
    teardown(line)
    schedule(line)
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

export function watchAsterFills(
  network: NetworkId,
  address: string,
  listenerId: string,
  credential: () => string | null,
  onFill: Listener
): void {
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
    }
    lines().set(key, line)
    void connect(line)
  }
  line.credential = credential
  line.askedAt = Date.now()
  line.listeners.set(listenerId, onFill)
}

export function closeAsterUserStreams(): void {
  for (const line of lines().values()) {
    line.generation += 1
    teardown(line)
    if (line.watchdog) clearInterval(line.watchdog)
  }
  lines().clear()
}

export function asterUserStreamState(
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

export function asterFillsNeedRecovery(
  network: NetworkId,
  address: string
): boolean {
  const line = lines().get(keyFor(network, address))
  return Boolean(line?.healthy && line.needsRecovery)
}

export function markAsterFillsRecovered(
  network: NetworkId,
  address: string
): void {
  const line = lines().get(keyFor(network, address))
  if (line?.healthy) line.needsRecovery = false
}

export { fillOf as asterStreamFill }
