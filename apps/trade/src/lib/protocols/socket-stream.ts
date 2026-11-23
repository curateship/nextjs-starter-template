import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import { reconnectDelay } from "@/lib/protocols/timing"

const IDLE_CLOSE_MS = 5_000

type FiguresListener = (updates: ReadonlyMap<string, LiveFigures>) => void
type CandleListener = (bar: CandleBar) => void
type Cleanup = () => void
type Subscription = void | Cleanup | Promise<void | Cleanup>

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === "function"
}

type CandleWant = {
  marketId: string
  interval: CandleInterval
  listeners: Set<CandleListener>
  cleanup: Cleanup | null
}

type Line<State, Connection> = {
  network: NetworkId
  state: State
  connection: Connection | null
  pendingConnection: Connection | null
  generation: number
  connecting: boolean
  attempts: number
  lastMessageAt: number
  everConnected: boolean
  recovering: boolean
  watchdog: ReturnType<typeof setInterval> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  idleTimer: ReturnType<typeof setTimeout> | null
  figures: Set<FiguresListener>
  figureCleanup: Cleanup | null
  candles: Map<string, CandleWant>
  catchUp: Set<Cleanup>
}

export type SocketStreamContext<State> = {
  network: NetworkId
  state: State
  figuresWatched: () => boolean
  candleWants: () => ReadonlyArray<{
    marketId: string
    interval: CandleInterval
  }>
  markAlive: () => void
  fail: () => void
  publishFigures: (updates: ReadonlyMap<string, LiveFigures>) => void
  publishCandle: (
    marketId: string,
    interval: CandleInterval,
    bar: CandleBar
  ) => void
}

export type SocketStreamConfig<State, Connection> = {
  staleAfterMs: number
  watchdogEveryMs: number
  createState: (network: NetworkId) => State
  connect: (
    context: SocketStreamContext<State>,
    ready: (connection: Connection) => void
  ) => Connection | Promise<Connection>
  /** Native sockets become ready on their open event, not when constructed. */
  readyOnReturn?: boolean
  close: (connection: Connection) => void
  figures?: "watched" | "always"
  subscribeFigures?: (
    context: SocketStreamContext<State>,
    connection: Connection
  ) => Subscription
  subscribeCandle: (
    context: SocketStreamContext<State>,
    connection: Connection,
    marketId: string,
    interval: CandleInterval
  ) => Subscription
  /** Replays the current set in one exchange-native frame when batching matters. */
  resubscribe?: (
    context: SocketStreamContext<State>,
    connection: Connection
  ) => void
  unsubscribeFigures?: (
    context: SocketStreamContext<State>,
    connection: Connection
  ) => void
  unsubscribeCandle?: (
    context: SocketStreamContext<State>,
    connection: Connection,
    marketId: string,
    interval: CandleInterval
  ) => void
  onConnected?: (
    context: SocketStreamContext<State>,
    connection: Connection
  ) => void
  onWatchdog?: (
    context: SocketStreamContext<State>,
    connection: Connection,
    now: number
  ) => void
  resetState?: (state: State, reason: "idle" | "close") => void
  replayFigures?: (state: State, listener: FiguresListener) => void
  acceptCandle?: (interval: CandleInterval) => boolean
  recoveryOn?: "connect" | "data"
  catchUpKeepsAlive?: boolean
}

export type SocketStream = {
  watchFigures: (network: NetworkId, listener: FiguresListener) => Cleanup
  watchCandle: (
    network: NetworkId,
    marketId: string,
    interval: CandleInterval,
    listener: CandleListener
  ) => Cleanup
  watchCatchUp: (network: NetworkId, listener: Cleanup) => Cleanup
  close: (network: NetworkId) => void
  setVisible: (visible: boolean) => void
}

export function candleKey(marketId: string, interval: CandleInterval): string {
  return `${marketId}:${interval}`
}

export function splitCandleKey(key: string): [string, CandleInterval] {
  const at = key.lastIndexOf(":")
  return [key.slice(0, at), key.slice(at + 1) as CandleInterval]
}

export function sendJson(socket: WebSocket, frame: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(frame))
  } catch {
    // The connection manager replaces a socket that cannot accept a frame.
  }
}

/** Opens a JSON websocket and routes its lifetime back through the manager. */
export function openJsonSocket<State>(
  url: string,
  context: SocketStreamContext<State>,
  onMessage: (packet: unknown, socket: WebSocket) => void,
  onOpen: (socket: WebSocket) => void
): WebSocket {
  const socket = new WebSocket(url)
  socket.addEventListener("open", () => onOpen(socket))
  socket.addEventListener("message", (event) => {
    try {
      onMessage(JSON.parse(String(event.data)), socket)
    } catch {
      // Acknowledgements and malformed frames carry no market data.
    }
  })
  socket.addEventListener("close", context.fail)
  socket.addEventListener("error", context.fail)
  return socket
}

export function createSocketStream<State, Connection>(
  config: SocketStreamConfig<State, Connection>
): SocketStream {
  const lines = new Map<NetworkId, Line<State, Connection>>()
  let visible = typeof document === "undefined" || !document.hidden
  let visibilityWired = false

  function lineFor(network: NetworkId): Line<State, Connection> {
    const found = lines.get(network)
    if (found) return found
    const made: Line<State, Connection> = {
      network,
      state: config.createState(network),
      connection: null,
      pendingConnection: null,
      generation: 0,
      connecting: false,
      attempts: 0,
      lastMessageAt: 0,
      everConnected: false,
      recovering: false,
      watchdog: null,
      reconnectTimer: null,
      idleTimer: null,
      figures: new Set(),
      figureCleanup: null,
      candles: new Map(),
      catchUp: new Set(),
    }
    lines.set(network, made)
    return made
  }

  function hasConsumers(line: Line<State, Connection>): boolean {
    return (
      line.figures.size > 0 ||
      line.candles.size > 0 ||
      (config.catchUpKeepsAlive === true && line.catchUp.size > 0)
    )
  }

  function contextFor(
    line: Line<State, Connection>,
    generation: number
  ): SocketStreamContext<State> {
    return {
      network: line.network,
      state: line.state,
      figuresWatched: () => line.figures.size > 0,
      candleWants: () =>
        [...line.candles.values()].map(({ marketId, interval }) => ({
          marketId,
          interval,
        })),
      markAlive: () => {
        if (generation !== line.generation) return
        line.lastMessageAt = Date.now()
        line.attempts = 0
        if (line.recovering && config.recoveryOn === "data") {
          line.recovering = false
          for (const listener of line.catchUp) listener()
        }
      },
      fail: () => {
        if (generation !== line.generation) return
        fail(line)
      },
      publishFigures: (updates) => {
        if (generation !== line.generation || updates.size === 0) return
        for (const listener of line.figures) listener(updates)
      },
      publishCandle: (marketId, interval, bar) => {
        if (generation !== line.generation) return
        const want = line.candles.get(candleKey(marketId, interval))
        if (!want) return
        for (const listener of want.listeners) listener(bar)
      },
    }
  }

  function runCleanup(cleanup: Cleanup | null): void {
    try {
      cleanup?.()
    } catch {
      // Closing a subscription is best effort; the connection closes next.
    }
  }

  function clearConnection(line: Line<State, Connection>): void {
    line.figureCleanup = null
    for (const want of line.candles.values()) {
      want.cleanup = null
    }
    const connection = line.connection
    line.connection = null
    if (connection) {
      try {
        config.close(connection)
      } catch {
        // A connection that refuses to close is already unusable.
      }
    }
    const pending = line.pendingConnection
    line.pendingConnection = null
    if (pending && pending !== connection) {
      try {
        config.close(pending)
      } catch {
        // A connection that refuses to close is already unusable.
      }
    }
    if (line.watchdog) clearInterval(line.watchdog)
    line.watchdog = null
  }

  function cancelReconnect(line: Line<State, Connection>): void {
    if (line.reconnectTimer) clearTimeout(line.reconnectTimer)
    line.reconnectTimer = null
  }

  function fail(line: Line<State, Connection>): void {
    line.recovering = line.everConnected
    line.generation += 1
    line.connecting = false
    clearConnection(line)
    scheduleReconnect(line)
  }

  function scheduleReconnect(line: Line<State, Connection>): void {
    if (line.reconnectTimer || !visible || !hasConsumers(line)) return
    const delay = reconnectDelay(line.attempts)
    line.attempts += 1
    line.reconnectTimer = setTimeout(() => {
      line.reconnectTimer = null
      connect(line)
    }, delay)
  }

  function setSubscription(
    line: Line<State, Connection>,
    generation: number,
    subscription: Subscription,
    keep: (cleanup: Cleanup | null) => void
  ): void {
    if (!subscription || typeof subscription === "function") {
      keep(typeof subscription === "function" ? subscription : null)
      return
    }
    void subscription.then(
      (result) => {
        const cleanup = typeof result === "function" ? result : null
        if (generation !== line.generation || !line.connection) {
          runCleanup(cleanup)
          return
        }
        keep(cleanup)
      },
      () => {
        if (generation === line.generation) keep(null)
      }
    )
  }

  function figuresWanted(line: Line<State, Connection>): boolean {
    if (!config.subscribeFigures || !config.figures) return false
    return config.figures === "always"
      ? hasConsumers(line)
      : line.figures.size > 0
  }

  function subscribeFigures(
    line: Line<State, Connection>,
    context: SocketStreamContext<State>,
    connection: Connection,
    generation: number
  ): void {
    if (!figuresWanted(line) || line.figureCleanup) return
    line.figureCleanup = () => {}
    setSubscription(
      line,
      generation,
      config.subscribeFigures?.(context, connection),
      (cleanup) => {
        line.figureCleanup = cleanup ?? (() => {})
      }
    )
  }

  function subscribeCandle(
    line: Line<State, Connection>,
    context: SocketStreamContext<State>,
    connection: Connection,
    want: CandleWant,
    generation: number
  ): void {
    if (want.cleanup) return
    want.cleanup = () => {}
    setSubscription(
      line,
      generation,
      config.subscribeCandle(context, connection, want.marketId, want.interval),
      (cleanup) => {
        want.cleanup = cleanup ?? (() => {})
      }
    )
  }

  function subscribeAll(
    line: Line<State, Connection>,
    context: SocketStreamContext<State>,
    connection: Connection,
    generation: number
  ): void {
    if (config.resubscribe) {
      config.resubscribe(context, connection)
      if (figuresWanted(line)) {
        line.figureCleanup = config.unsubscribeFigures
          ? () => config.unsubscribeFigures?.(context, connection)
          : () => {}
      }
      for (const want of line.candles.values()) {
        want.cleanup = config.unsubscribeCandle
          ? () =>
              config.unsubscribeCandle?.(
                context,
                connection,
                want.marketId,
                want.interval
              )
          : () => {}
      }
      return
    }
    subscribeFigures(line, context, connection, generation)
    for (const want of line.candles.values()) {
      subscribeCandle(line, context, connection, want, generation)
    }
  }

  function startWatchdog(
    line: Line<State, Connection>,
    context: SocketStreamContext<State>,
    generation: number
  ): void {
    if (line.watchdog) return
    line.watchdog = setInterval(() => {
      if (generation !== line.generation || !line.connection || !visible) return
      const now = Date.now()
      config.onWatchdog?.(context, line.connection, now)
      if (now - line.lastMessageAt <= config.staleAfterMs) return
      fail(line)
    }, config.watchdogEveryMs)
  }

  function connect(line: Line<State, Connection>): void {
    if (
      line.connecting ||
      line.connection ||
      line.pendingConnection ||
      line.reconnectTimer ||
      !visible ||
      !hasConsumers(line)
    ) {
      return
    }
    line.connecting = true
    const generation = (line.generation += 1)
    const context = contextFor(line, generation)

    const ready = (connection: Connection) => {
      if (generation !== line.generation || !hasConsumers(line) || !visible) {
        if (generation === line.generation) {
          line.pendingConnection = null
          line.connecting = false
        }
        try {
          config.close(connection)
        } catch {
          // The connection became obsolete while it was opening.
        }
        return
      }
      line.connection = connection
      line.pendingConnection = null
      line.connecting = false
      line.lastMessageAt = Date.now()
      const recovered = line.recovering && config.recoveryOn !== "data"
      line.everConnected = true
      if (recovered) {
        line.recovering = false
        for (const listener of line.catchUp) listener()
      }
      config.onConnected?.(context, connection)
      subscribeAll(line, context, connection, generation)
      startWatchdog(line, context, generation)
    }

    let opening: Connection | Promise<Connection>
    try {
      opening = config.connect(context, ready)
    } catch {
      line.connecting = false
      line.recovering = line.everConnected
      scheduleReconnect(line)
      return
    }

    if (!isPromiseLike(opening)) {
      if (config.readyOnReturn === false) line.pendingConnection = opening
      else ready(opening)
      return
    }
    void opening.then(
      (connection) => {
        if (generation !== line.generation) {
          try {
            config.close(connection)
          } catch {
            // The connection became obsolete while it was opening.
          }
          return
        }
        if (config.readyOnReturn === false) {
          line.pendingConnection = connection
        } else {
          ready(connection)
        }
      },
      () => {
        if (generation !== line.generation) return
        line.connecting = false
        line.recovering = line.everConnected
        scheduleReconnect(line)
      }
    )
  }

  function ensureOpen(line: Line<State, Connection>): void {
    if (line.idleTimer) clearTimeout(line.idleTimer)
    line.idleTimer = null
    wireVisibility()
    connect(line)
  }

  function closeIfIdle(line: Line<State, Connection>): void {
    if (hasConsumers(line) || line.idleTimer) return
    line.idleTimer = setTimeout(() => {
      line.idleTimer = null
      if (hasConsumers(line)) return
      line.generation += 1
      line.connecting = false
      cancelReconnect(line)
      clearConnection(line)
      line.attempts = 0
      line.recovering = false
      config.resetState?.(line.state, "idle")
    }, IDLE_CLOSE_MS)
  }

  function syncFigures(line: Line<State, Connection>): void {
    const connection = line.connection
    if (!connection) return
    if (!figuresWanted(line)) {
      runCleanup(line.figureCleanup)
      line.figureCleanup = null
      return
    }
    subscribeFigures(
      line,
      contextFor(line, line.generation),
      connection,
      line.generation
    )
  }

  function setVisible(nextVisible: boolean): void {
    visible = nextVisible
    for (const line of lines.values()) {
      if (!visible) {
        if (line.connection || line.connecting) {
          line.recovering = line.everConnected
          line.generation += 1
          line.connecting = false
          cancelReconnect(line)
          clearConnection(line)
        }
      } else if (hasConsumers(line)) {
        connect(line)
      }
    }
  }

  function wireVisibility(): void {
    if (visibilityWired || typeof document === "undefined") return
    visibilityWired = true
    document.addEventListener("visibilitychange", () => {
      setVisible(!document.hidden)
    })
  }

  return {
    watchFigures(network, listener) {
      const line = lineFor(network)
      line.figures.add(listener)
      config.replayFigures?.(line.state, listener)
      ensureOpen(line)
      syncFigures(line)
      return () => {
        line.figures.delete(listener)
        syncFigures(line)
        closeIfIdle(line)
      }
    },
    watchCandle(network, marketId, interval, listener) {
      if (config.acceptCandle && !config.acceptCandle(interval)) return () => {}
      const line = lineFor(network)
      const key = candleKey(marketId, interval)
      const want = line.candles.get(key) ?? {
        marketId,
        interval,
        listeners: new Set<CandleListener>(),
        cleanup: null,
      }
      const first = want.listeners.size === 0
      want.listeners.add(listener)
      line.candles.set(key, want)
      ensureOpen(line)
      syncFigures(line)
      if (first && line.connection) {
        subscribeCandle(
          line,
          contextFor(line, line.generation),
          line.connection,
          want,
          line.generation
        )
      }
      return () => {
        want.listeners.delete(listener)
        if (want.listeners.size === 0) {
          runCleanup(want.cleanup)
          want.cleanup = null
          line.candles.delete(key)
        }
        syncFigures(line)
        closeIfIdle(line)
      }
    },
    watchCatchUp(network, listener) {
      const line = lineFor(network)
      line.catchUp.add(listener)
      if (config.catchUpKeepsAlive) ensureOpen(line)
      return () => {
        line.catchUp.delete(listener)
        closeIfIdle(line)
      }
    },
    close(network) {
      const line = lineFor(network)
      line.generation += 1
      line.connecting = false
      cancelReconnect(line)
      if (line.idleTimer) clearTimeout(line.idleTimer)
      line.idleTimer = null
      clearConnection(line)
      line.attempts = 0
      line.recovering = false
      line.figures.clear()
      line.candles.clear()
      line.catchUp.clear()
      config.resetState?.(line.state, "close")
    },
    setVisible,
  }
}
