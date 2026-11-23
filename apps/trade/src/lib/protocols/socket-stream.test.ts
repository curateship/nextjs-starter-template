import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createSocketStream,
  type SocketStream,
} from "@/lib/protocols/socket-stream"

type Connection = { id: number; closed: boolean }

const streams: SocketStream[] = []

function makeStream() {
  let nextId = 1
  const contexts: Array<{
    markAlive: () => void
    fail: () => void
  }> = []
  const connections: Connection[] = []
  const subscribe = vi.fn()
  const unsubscribe = vi.fn()
  const stream = createSocketStream({
    staleAfterMs: 10_000,
    watchdogEveryMs: 1_000,
    createState: () => ({}),
    connect: (context) => {
      contexts.push(context)
      const connection = { id: nextId++, closed: false }
      connections.push(connection)
      return connection
    },
    close: (connection: Connection) => {
      connection.closed = true
    },
    subscribeCandle: (_context, connection, marketId, interval) => {
      subscribe(connection.id, marketId, interval)
      return () => unsubscribe(connection.id, marketId, interval)
    },
    catchUpKeepsAlive: true,
  })
  streams.push(stream)
  return { stream, contexts, connections, subscribe, unsubscribe }
}

afterEach(() => {
  for (const stream of streams.splice(0)) stream.close("mainnet")
  vi.useRealTimers()
})

describe("the shared socket stream", () => {
  it("shares one connection and one market subscription", async () => {
    const { stream, connections, subscribe, unsubscribe } = makeStream()
    const stopOne = stream.watchCandle("mainnet", "BTC", "1m", () => {})
    const stopTwo = stream.watchCandle("mainnet", "BTC", "1m", () => {})
    await Promise.resolve()
    expect(connections).toHaveLength(1)
    expect(subscribe).toHaveBeenCalledOnce()
    stopOne()
    expect(unsubscribe).not.toHaveBeenCalled()
    stopTwo()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it("keeps the connection across a quick listener handoff", async () => {
    vi.useFakeTimers()
    const { stream, connections, unsubscribe } = makeStream()
    const stop = stream.watchCandle("mainnet", "BTC", "1m", () => {})
    await Promise.resolve()
    stop()
    vi.advanceTimersByTime(4_000)
    const stopAgain = stream.watchCandle("mainnet", "ETH", "1m", () => {})
    await Promise.resolve()
    expect(connections).toHaveLength(1)
    expect(unsubscribe).toHaveBeenCalledOnce()
    stopAgain()
    vi.advanceTimersByTime(5_000)
    expect(connections[0].closed).toBe(true)
  })

  it("reconnects on the shared backoff and announces recovery", async () => {
    vi.useFakeTimers()
    const { stream, contexts, connections } = makeStream()
    const caughtUp = vi.fn()
    stream.watchCatchUp("mainnet", caughtUp)
    stream.watchCandle("mainnet", "BTC", "1m", () => {})
    await Promise.resolve()
    contexts[0].fail()
    vi.advanceTimersByTime(999)
    expect(connections).toHaveLength(1)
    vi.advanceTimersByTime(1)
    await Promise.resolve()
    expect(connections).toHaveLength(2)
    expect(caughtUp).toHaveBeenCalledOnce()
  })

  it("closes while hidden and reconnects when visible", async () => {
    const { stream, connections, unsubscribe } = makeStream()
    stream.watchCandle("mainnet", "BTC", "1m", () => {})
    await Promise.resolve()
    stream.setVisible(false)
    expect(connections[0].closed).toBe(true)
    expect(unsubscribe).not.toHaveBeenCalled()
    stream.setVisible(true)
    await Promise.resolve()
    expect(connections).toHaveLength(2)
  })
})
