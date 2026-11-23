import type { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"

/**
 * The pool has to survive losing a connection nobody was using.
 *
 * Connections wait in the pool between queries, and the other end eventually
 * hangs one up — a database restart, a container's network blinking, an idle
 * timeout somewhere along the wire. The pool throws that connection away and
 * announces it, both correct. What is not correct is nobody listening: Node
 * turns an announced error with no listener into an uncaught exception, so a
 * spare connection being dropped took the entire server down with a bare
 * "read ECONNRESET" and no application code in the trace at all.
 *
 * Long jobs are where it showed up, which is the tell rather than bad luck —
 * a pass that works for minutes leaves its spare connections untouched for
 * exactly that long.
 *
 * It cannot be shown against the in-memory database the rest of the tests use,
 * so it is proved here against a stand-in pool that behaves the way the real
 * one does: an `error` nobody hears is thrown.
 */

// Hoisted, because `vi.mock` runs before the imports above it and a plain
// module-level list is not there yet when the factory asks for it.
const made = vi.hoisted(() => ({ pools: [] as unknown[] }))

vi.mock("pg", async () => {
  const { EventEmitter } = await import("node:events")
  class Pool extends EventEmitter {
    constructor() {
      super()
      made.pools.push(this)
    }
  }
  return { Pool, Client: class {} }
})

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({}),
}))

describe("the shared database pool", () => {
  it("survives a connection being dropped while it sat idle", async () => {
    await import("@/server/db")

    expect(made.pools).toHaveLength(1)
    const pool = made.pools[0] as EventEmitter

    // The proof, and the reason this test is not just `listenerCount > 0`:
    // this is exactly what the pool does when a spare connection is hung up
    // on, and before the listener existed this line took the process out.
    expect(() =>
      pool.emit("error", new Error("read ECONNRESET"))
    ).not.toThrow()
  })

  it("says so rather than swallowing it", async () => {
    await import("@/server/db")
    const pool = made.pools[0] as EventEmitter
    const said = vi.spyOn(console, "error").mockImplementation(() => {})

    pool.emit("error", new Error("read ECONNRESET"))

    // A connection dying quietly is how you end up hunting a ghost later.
    expect(said).toHaveBeenCalledOnce()
    expect(String(said.mock.calls[0]?.[0])).toContain("connection")
    said.mockRestore()
  })
})
