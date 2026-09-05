import type { NetworkId } from "@/lib/protocols/contracts"
import { reconnectDelay } from "@/lib/protocols/timing"

const TRUST_MS = 30_000
const IDLE_MS = 10 * 60_000
const WATCHDOG_EVERY_MS = 3_000
const STEADY_AFTER_MS = 30_000
const FILL_RECOVERY_FLOOR_MS = 30_000
const FILL_RECONCILE_MS = 2 * 60_000

type Line<Connection> = {
  network: NetworkId
  keyId: string
  credential: () => string | null
  connection: Connection | null
  generation: number
  connecting: boolean
  watchdog: ReturnType<typeof setInterval> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  openedAt: number
  lastMessageAt: number
  watchingSince: number
  changedAt: number
  attempts: number
  askedAt: number
}

export type PrivateFeedContext = {
  network: NetworkId
  keyId: string
  credential: () => string | null
  opened: () => void
  alive: () => void
  watching: () => void
  changed: () => void
  fail: () => void
}

type PrivateFeedConfig<Connection> = {
  storageKey: string
  touchedAt: () => number
  connect: (context: PrivateFeedContext) => Connection | Promise<Connection>
  close: (connection: Connection) => void
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === "function"
}

export type PrivateFeed = {
  quietSince: (
    network: NetworkId,
    keyId: string,
    credential: () => string | null,
    at: number
  ) => boolean
  dropIdle: (now?: number) => void
  close: () => void
}

export type PrivateFillState<Push> = {
  watch: (
    network: NetworkId,
    keyId: string,
    listenerId: string,
    credential: () => string | null,
    listener: (push: Push) => void
  ) => void
  push: (network: NetworkId, keyId: string, value: Push) => void
  needsRecovery: (
    network: NetworkId,
    keyId: string,
    credential: () => string | null
  ) => boolean
  recovered: (
    network: NetworkId,
    keyId: string,
    coveredThrough?: number
  ) => void
  dropIdle: (now?: number) => void
  close: () => void
}

type PrivateFillLine<Push> = {
  askedAt: number
  recoveryAskedAt: number
  recoveredAt: number
  listeners: Map<string, (push: Push) => void>
}

const scope = globalThis as {
  __tradePrivateFeedLines?: Map<string, Map<string, unknown>>
  __tradePrivateFillLines?: Map<string, Map<string, unknown>>
}

function storedLines<Connection>(
  storageKey: string
): Map<string, Line<Connection>> {
  const stores = (scope.__tradePrivateFeedLines ??= new Map())
  const found = stores.get(storageKey)
  if (found) return found as Map<string, Line<Connection>>
  const made = new Map<string, Line<Connection>>()
  stores.set(storageKey, made as Map<string, unknown>)
  return made
}

function storedFillLines<Push>(
  storageKey: string
): Map<string, PrivateFillLine<Push>> {
  const stores = (scope.__tradePrivateFillLines ??= new Map())
  const found = stores.get(storageKey)
  if (found) return found as Map<string, PrivateFillLine<Push>>
  const made = new Map<string, PrivateFillLine<Push>>()
  stores.set(storageKey, made as Map<string, unknown>)
  return made
}

export function createPrivateFeed<Connection>(
  config: PrivateFeedConfig<Connection>
): PrivateFeed {
  const lines = storedLines<Connection>(config.storageKey)

  function closeConnection(connection: Connection): void {
    try {
      config.close(connection)
    } catch {
      // A connection that refuses to close is already gone.
    }
  }

  function keyFor(network: NetworkId, keyId: string): string {
    return `${network}:${keyId}`
  }

  function clearConnection(line: Line<Connection>): void {
    const connection = line.connection
    line.connection = null
    if (connection) closeConnection(connection)
    line.watchingSince = 0
  }

  function scheduleReconnect(line: Line<Connection>): void {
    if (line.reconnectTimer) return
    const wait = reconnectDelay(line.attempts)
    line.attempts += 1
    line.reconnectTimer = setTimeout(() => {
      line.reconnectTimer = null
      connect(line)
    }, wait)
    line.reconnectTimer.unref?.()
  }

  function fail(line: Line<Connection>): void {
    line.generation += 1
    line.connecting = false
    clearConnection(line)
    scheduleReconnect(line)
  }

  function contextFor(
    line: Line<Connection>,
    generation: number
  ): PrivateFeedContext {
    return {
      network: line.network,
      keyId: line.keyId,
      credential: () => line.credential(),
      opened: () => {
        if (generation !== line.generation) return
        line.openedAt = Date.now()
        line.lastMessageAt = Date.now()
      },
      alive: () => {
        if (generation !== line.generation) return
        line.lastMessageAt = Date.now()
        if (line.attempts > 0 && Date.now() - line.openedAt > STEADY_AFTER_MS) {
          line.attempts = 0
        }
      },
      watching: () => {
        if (generation === line.generation) line.watchingSince = Date.now()
      },
      changed: () => {
        if (generation === line.generation) line.changedAt = Date.now()
      },
      fail: () => {
        if (generation === line.generation) fail(line)
      },
    }
  }

  function startWatchdog(line: Line<Connection>): void {
    if (line.watchdog) return
    line.watchdog = setInterval(() => {
      if (!line.connection) return
      if (Date.now() - line.lastMessageAt <= TRUST_MS) return
      fail(line)
    }, WATCHDOG_EVERY_MS)
    line.watchdog.unref?.()
  }

  function connect(line: Line<Connection>): void {
    if (line.connecting || line.connection) return
    line.connecting = true
    const generation = (line.generation += 1)
    clearConnection(line)
    const context = contextFor(line, generation)
    let opening: Connection | Promise<Connection>
    try {
      opening = config.connect(context)
    } catch {
      line.connecting = false
      scheduleReconnect(line)
      startWatchdog(line)
      return
    }
    if (!isPromiseLike(opening)) {
      line.connection = opening
      line.connecting = false
      line.lastMessageAt = Date.now()
      startWatchdog(line)
      return
    }
    void opening.then(
      (connection) => {
        if (generation !== line.generation) {
          closeConnection(connection)
          return
        }
        line.connection = connection
        line.connecting = false
        line.lastMessageAt = Date.now()
        startWatchdog(line)
      },
      () => {
        if (generation !== line.generation) return
        line.connecting = false
        scheduleReconnect(line)
        startWatchdog(line)
      }
    )
  }

  function lineFor(
    network: NetworkId,
    keyId: string,
    credential: () => string | null
  ): Line<Connection> {
    const key = keyFor(network, keyId)
    const found = lines.get(key)
    if (found) {
      found.askedAt = Date.now()
      found.credential = credential
      return found
    }
    const made: Line<Connection> = {
      network,
      keyId,
      credential,
      connection: null,
      generation: 0,
      connecting: false,
      watchdog: null,
      reconnectTimer: null,
      openedAt: 0,
      lastMessageAt: 0,
      watchingSince: 0,
      changedAt: 0,
      attempts: 0,
      askedAt: Date.now(),
    }
    lines.set(key, made)
    connect(made)
    return made
  }

  function dropIdle(now: number = Date.now()): void {
    for (const [key, line] of lines) {
      if (now - line.askedAt < IDLE_MS) continue
      line.generation += 1
      line.connecting = false
      clearConnection(line)
      if (line.watchdog) clearInterval(line.watchdog)
      if (line.reconnectTimer) clearTimeout(line.reconnectTimer)
      line.watchdog = null
      line.reconnectTimer = null
      lines.delete(key)
    }
  }

  return {
    quietSince(network, keyId, credential, at) {
      const line = lineFor(network, keyId, credential)
      if (line.watchingSince === 0 || !line.connection) return false
      if (Date.now() - line.lastMessageAt >= TRUST_MS) return false
      if (line.watchingSince > at) return false
      if (config.touchedAt() > at) return false
      return line.changedAt <= at
    },
    dropIdle,
    close() {
      dropIdle(Infinity)
    },
  }
}

/** The listener and recovery state shared by signed private fill feeds. */
export function createPrivateFillState<Push>(
  feed: PrivateFeed,
  storageKey: string,
  listenerErrorLabel: string
): PrivateFillState<Push> {
  // The socket survives a development reload, so its listener book must live
  // in the same global store. Otherwise the old socket pushes into the old
  // module while callers register on the new one, and the line looks healthy
  // while every fill is missed.
  const lines = storedFillLines<Push>(storageKey)
  const keyFor = (network: NetworkId, keyId: string) => `${network}:${keyId}`
  const lineFor = (
    network: NetworkId,
    keyId: string
  ): PrivateFillLine<Push> => {
    const key = keyFor(network, keyId)
    const found = lines.get(key)
    if (found) return found
    const made: PrivateFillLine<Push> = {
      askedAt: Date.now(),
      recoveryAskedAt: 0,
      recoveredAt: 0,
      listeners: new Map(),
    }
    lines.set(key, made)
    return made
  }

  return {
    watch(network, keyId, listenerId, credential, listener) {
      const line = lineFor(network, keyId)
      line.askedAt = Date.now()
      line.listeners.set(listenerId, listener)
      feed.quietSince(network, keyId, credential, Date.now())
    },
    push(network, keyId, value) {
      const line = lines.get(keyFor(network, keyId))
      if (!line) return
      for (const listener of line.listeners.values()) {
        try {
          listener(value)
        } catch (error) {
          console.error(`${listenerErrorLabel} fill listener failed`, error)
        }
      }
    },
    needsRecovery(network, keyId, credential) {
      const line = lineFor(network, keyId)
      const now = Date.now()
      line.askedAt = now
      // Smart-order reconciliation also asks this every second. Start the
      // floor when recovery is requested, not only after it succeeds, so a
      // failed or disconnected exchange stays on the old 30-second cadence.
      if (now - line.recoveryAskedAt < FILL_RECOVERY_FLOOR_MS) return false
      const quiet = feed.quietSince(
        network,
        keyId,
        credential,
        line.recoveredAt
      )
      const due = now - line.recoveredAt >= FILL_RECONCILE_MS || !quiet
      if (due) line.recoveryAskedAt = now
      return due
    },
    recovered(network, keyId, coveredThrough = Date.now()) {
      const line = lineFor(network, keyId)
      line.recoveredAt = coveredThrough
      line.recoveryAskedAt = Date.now()
    },
    dropIdle(now = Date.now()) {
      for (const [key, line] of lines) {
        if (now - line.askedAt >= IDLE_MS) lines.delete(key)
      }
    },
    close() {
      lines.clear()
    },
  }
}
