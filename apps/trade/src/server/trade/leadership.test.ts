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

/** The build this copy claims to be; null is a dev server or a test run. */
const build = vi.hoisted(() => ({
  stamp: null as { builtAt: number; commit: string | null } | null,
}))

vi.mock("@/lib/build-stamp", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/build-stamp")>()
  return { ...actual, buildStamp: () => build.stamp }
})

import {
  olderThanLastLeader,
  tryBecomeLeader,
  tryBecomeLeaderForOnePass,
  waitToBecomeLeader,
  nonEngineProcessMayTrade,
} from "@/server/trade/leadership"

describe("trade engine leadership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    build.stamp = null
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

  /**
   * The newest build leads. On 3 Sep and 4 Sep 2026 a container built weeks
   * earlier took the lock while the engine restarted and ran old code over
   * live grids. The lock now remembers the newest build that has held it, and
   * an older copy hands the lock straight back.
   */
  describe("the newest build leads", () => {
    const BUILT_3_SEP = Date.UTC(2026, 8, 3, 12, 0)
    const BUILT_4_SEP = Date.UTC(2026, 8, 4, 12, 55)

    it("hands the lock straight back to a copy older than the last leader", async () => {
      build.stamp = { builtAt: BUILT_3_SEP, commit: "old1234" }
      pg.query
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockResolvedValueOnce({
          rows: [{ leader_build_at: new Date(BUILT_4_SEP) }],
        })

      const leadership = await tryBecomeLeader()

      expect(leadership.held).toBe(false)
      expect(leadership.refused).toContain("has led since")
      expect(pg.query).toHaveBeenCalledWith(
        "select pg_advisory_unlock($1)",
        [8_140_233]
      )
      expect(pg.end).toHaveBeenCalledOnce()
    })

    it("lets a copy at least as new as the last leader through, and writes itself down", async () => {
      build.stamp = { builtAt: BUILT_4_SEP, commit: "new5678" }
      pg.query
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockResolvedValueOnce({
          rows: [{ leader_build_at: new Date(BUILT_3_SEP) }],
        })

      const leadership = await tryBecomeLeader()

      expect(leadership.held).toBe(true)
      const wrote = pg.query.mock.calls.find(([text]) =>
        String(text).includes("insert into trade_worker_controls")
      )
      expect(wrote?.[1]).toEqual([new Date(BUILT_4_SEP), "new5678"])
    })

    it("refuses the queued engine the same way", async () => {
      build.stamp = { builtAt: BUILT_3_SEP, commit: null }
      pg.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [{ leader_build_at: new Date(BUILT_4_SEP) }],
      })

      const leadership = await waitToBecomeLeader()

      expect(leadership.held).toBe(false)
      expect(leadership.refused).toContain("Redeploy this container")
      expect(pg.query).toHaveBeenCalledWith(
        "select pg_advisory_unlock($1)",
        [8_140_233]
      )
    })

    it("refuses the website's one pass and hands the connection back", async () => {
      build.stamp = { builtAt: BUILT_3_SEP, commit: null }
      pooled.query
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockResolvedValueOnce({
          rows: [{ leader_build_at: new Date(BUILT_4_SEP) }],
        })

      const leadership = await tryBecomeLeaderForOnePass()

      expect(leadership.held).toBe(false)
      expect(pooled.query).toHaveBeenCalledWith(
        "select pg_advisory_unlock($1)",
        [8_140_233]
      )
      expect(pooled.release).toHaveBeenCalledWith()
    })

    it("lets a copy through when the database has not been migrated yet", async () => {
      build.stamp = { builtAt: BUILT_3_SEP, commit: null }
      const unmigrated = Object.assign(new Error("column does not exist"), {
        code: "42703",
      })
      pg.query
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockRejectedValueOnce(unmigrated)

      const leadership = await tryBecomeLeader()

      expect(leadership.held).toBe(true)
    })

    it("leaves an unstamped dev copy out of the rule entirely", async () => {
      pg.query.mockResolvedValueOnce({ rows: [{ locked: true }] })

      const leadership = await tryBecomeLeader()

      expect(leadership.held).toBe(true)
      expect(pg.query).toHaveBeenCalledTimes(1)
    })

    it("says which build is older, in plain words", () => {
      const mine = { builtAt: BUILT_3_SEP, commit: "abc1234" }
      expect(olderThanLastLeader(mine, null)).toBeNull()
      expect(olderThanLastLeader(mine, new Date(BUILT_3_SEP))).toBeNull()
      expect(olderThanLastLeader(mine, new Date(BUILT_4_SEP))).toBe(
        "this copy was built 2026-09-03 12:00 UTC (abc1234), and a copy built 2026-09-04 12:55 UTC has led since. Redeploy this container so it runs the current build."
      )
    })
  })
})

describe("trading outside the dedicated engine", () => {
  it("is refused in production", () => {
    expect(nonEngineProcessMayTrade({ NODE_ENV: "production" })).toBe(false)
  })

  it("is refused when the environment is not identified", () => {
    expect(nonEngineProcessMayTrade({})).toBe(false)
  })

  it("remains available to local development", () => {
    expect(nonEngineProcessMayTrade({ NODE_ENV: "development" })).toBe(true)
  })
})
