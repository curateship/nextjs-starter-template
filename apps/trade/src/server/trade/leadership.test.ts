import { beforeEach, describe, expect, it, vi } from "vitest"

const pg = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  query: vi.fn(),
}))

vi.mock("pg", () => ({
  Client: vi.fn(function Client() {
    return pg
  }),
}))

vi.mock("@/server/db", () => ({
  getDatabaseUrl: () => "postgresql://trade.example/trade",
}))

import {
  tryBecomeLeader,
  waitToBecomeLeader,
} from "@/server/trade/leadership"

describe("trade engine leadership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pg.connect.mockResolvedValue(undefined)
    pg.end.mockResolvedValue(undefined)
    pg.query.mockResolvedValue({ rows: [] })
  })

  it("queues the dedicated engine for the advisory lock", async () => {
    const leadership = await waitToBecomeLeader()

    expect(pg.query).toHaveBeenCalledWith("select pg_advisory_lock($1)", [
      8_140_233,
    ])
    expect(leadership.held).toBe(true)

    await leadership.release()
    expect(pg.query).toHaveBeenCalledWith("select pg_advisory_unlock($1)", [
      8_140_233,
    ])
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
})
