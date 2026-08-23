import { beforeEach, describe, expect, it, vi } from "vitest"

const pg = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  query: vi.fn(),
}))

const pooled = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}))

const pool = vi.hoisted(() => ({
  connect: vi.fn(),
  on: vi.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
}))

vi.mock("pg", () => ({
  Client: vi.fn(function Client() {
    return pg
  }),
  Pool: vi.fn(function Pool() {
    return pool
  }),
}))

vi.mock("@/server/db", () => ({
  getDatabaseUrl: () => "postgresql://trade.example/trade",
}))

import {
  tryBecomeLeader,
  tryBecomeLeaderForOnePass,
  waitToBecomeLeader,
} from "@/server/trade/leadership"

describe("trade engine leadership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pg.connect.mockResolvedValue(undefined)
    pg.end.mockResolvedValue(undefined)
    pg.query.mockResolvedValue({ rows: [] })
    pool.connect.mockResolvedValue(pooled)
    pooled.query.mockResolvedValue({ rows: [] })
    pool.totalCount = 0
    pool.idleCount = 0
    pool.waitingCount = 0
  })

  it("queues the dedicated engine for the advisory lock", async () => {
    const leadership = await waitToBecomeLeader()

    expect(pg.query).toHaveBeenCalledWith(
      "select pg_advisory_lock($1)",
      [8_140_233]
    )
    expect(leadership.held).toBe(true)

    await leadership.release()
    expect(pg.query).toHaveBeenCalledWith(
      "select pg_advisory_unlock($1)",
      [8_140_233]
    )
    expect(pg.end).toHaveBeenCalledOnce()
  })

  it("lets the website check the lock without waiting", async () => {
    pg.query.mockResolvedValueOnce({ rows: [{ locked: false }] })

    const leadership = await tryBecomeLeader()

    expect(pg.query).toHaveBeenCalledWith(
      "select pg_try_advisory_lock($1) as locked",
      [8_140_233]
    )
    expect(leadership.held).toBe(false)
    expect(pg.end).toHaveBeenCalledOnce()
  })

  it("holds the lock for one pass on a kept connection", async () => {
    pooled.query.mockResolvedValueOnce({ rows: [{ locked: true }] })

    const leadership = await tryBecomeLeaderForOnePass()

    expect(pooled.query).toHaveBeenCalledWith(
      "select pg_try_advisory_lock($1) as locked",
      [8_140_233]
    )
    expect(leadership.held).toBe(true)
    // No connection of its own was opened.
    expect(pg.connect).not.toHaveBeenCalled()

    await leadership.release()
    expect(pooled.query).toHaveBeenCalledWith(
      "select pg_advisory_unlock($1)",
      [8_140_233]
    )
    // Back to the pool, not closed: the next pass reuses it.
    expect(pooled.release).toHaveBeenCalledWith()
  })

  it("hands the connection back at once when the lock is taken", async () => {
    pooled.query.mockResolvedValueOnce({ rows: [{ locked: false }] })

    const leadership = await tryBecomeLeaderForOnePass()

    expect(leadership.held).toBe(false)
    expect(pooled.release).toHaveBeenCalledWith()
  })

  it("answers 'not held' at once while another pass has the connection", async () => {
    pool.totalCount = 1
    pool.idleCount = 0

    const leadership = await tryBecomeLeaderForOnePass()

    expect(leadership.held).toBe(false)
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it("destroys the connection when the unlock fails", async () => {
    pooled.query.mockResolvedValueOnce({ rows: [{ locked: true }] })
    const leadership = await tryBecomeLeaderForOnePass()
    pooled.query.mockRejectedValueOnce(new Error("line dropped"))

    await leadership.release()

    expect(pooled.release).toHaveBeenCalledWith(true)
  })
})
