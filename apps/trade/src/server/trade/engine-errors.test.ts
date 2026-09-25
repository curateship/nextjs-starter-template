import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ENGINE_ERROR_FOLD_MS,
  ENGINE_ERROR_KEEP,
} from "@/lib/trade/engine-errors"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import {
  listEngineErrors,
  recordEngineError,
  saveEngineError,
} from "@/server/trade/engine-errors"
import { tradeEngineErrors } from "@/server/trade/schema"

let database: CustomShellDb
let close: () => Promise<void>

const at = new Date("2026-09-05T03:12:00.000Z")

beforeEach(async () => {
  const test = await createTestDatabase()
  database = test.db
  close = () => test.client.close()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await close()
})

function save(parts: unknown[], { when = at, source = "ladder-worker" } = {}) {
  return saveEngineError("error", source, parts, { at: when, database })
}

describe("keeping the engine's errors", () => {
  it("writes one row with the words that were printed and the time", async () => {
    await save(["Ladder loop failed", new Error("fetch failed")])

    expect(await listEngineErrors(database)).toEqual([
      {
        id: expect.any(String),
        kind: "error",
        source: "ladder-worker",
        message: "Ladder loop failed: fetch failed",
        times: 1,
        firstSeenAt: at.toISOString(),
        lastSeenAt: at.toISOString(),
      },
    ])
  })

  it("keeps a warning apart from an error", async () => {
    await saveEngineError("warning", "candles", ["fill failed"], {
      at,
      database,
    })

    const [row] = await listEngineErrors(database)
    expect(row.kind).toBe("warning")
  })

  it("describes a value that is neither a string nor an error", async () => {
    await save(["could not advance", { code: 429 }, 7])

    const [row] = await listEngineErrors(database)
    expect(row.message).toBe('could not advance: {"code":429}: 7')
  })

  it("writes nothing when there is nothing to say", async () => {
    await save([null, undefined])

    expect(await listEngineErrors(database)).toEqual([])
  })

  it("strikes out anything key-shaped before it is stored", async () => {
    const key = `0x${"ab".repeat(32)}`
    await save([`Signing failed with ${key}`])

    const [row] = await listEngineErrors(database)
    expect(row.message).toBe("Signing failed with 0x…")
    expect(row.message).not.toContain("abab")
  })

  it("cuts a runaway message off where the live journal cuts its own", async () => {
    await save(["x".repeat(900)])

    const [row] = await listEngineErrors(database)
    expect(row.message).toBe(`${"x".repeat(300)}…`)
  })

  it("folds a repeat inside the minute into one row with a count", async () => {
    await save(["Ladder loop failed"])
    await save(["Ladder loop failed"], {
      when: new Date(at.getTime() + 30_000),
    })
    await save(["Ladder loop failed"], {
      when: new Date(at.getTime() + 59_000),
    })

    const rows = await listEngineErrors(database)
    expect(rows).toHaveLength(1)
    expect(rows[0].times).toBe(3)
    expect(rows[0].firstSeenAt).toBe(at.toISOString())
    expect(rows[0].lastSeenAt).toBe(
      new Date(at.getTime() + 59_000).toISOString()
    )
  })

  it("folds a burst that all fires in the same instant", async () => {
    // Four sites failing at once used to leave four identical rows, because
    // each one looked the table up before any of them had inserted anything.
    await Promise.all([
      save(["Ladder loop failed"]),
      save(["Ladder loop failed"]),
      save(["Ladder loop failed"]),
      save(["Ladder loop failed"]),
    ])

    const rows = await listEngineErrors(database)
    expect(rows).toHaveLength(1)
    expect(rows[0].times).toBe(4)
  })

  it("starts a new row once the fold window has passed", async () => {
    await save(["Ladder loop failed"])
    await save(["Ladder loop failed"], {
      when: new Date(at.getTime() + ENGINE_ERROR_FOLD_MS + 1),
    })

    const rows = await listEngineErrors(database)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.times)).toEqual([1, 1])
  })

  it("does not fold a different message or a different place", async () => {
    await save(["Ladder loop failed"])
    await save(["Ladder lock check failed"])
    await save(["Ladder loop failed"], { source: "live-fills" })

    expect(await listEngineErrors(database)).toHaveLength(3)
  })

  it("keeps the newest 500 and drops the rest", async () => {
    // Each one a minute apart, so nothing folds and the order is the order
    // they were written in.
    for (let index = 0; index < ENGINE_ERROR_KEEP + 25; index += 1) {
      await save([`Pass ${index} failed`], {
        when: new Date(at.getTime() + index * 60_000),
      })
    }

    const rows = await listEngineErrors(database)
    expect(rows).toHaveLength(ENGINE_ERROR_KEEP)
    expect(rows[0].message).toBe(`Pass ${ENGINE_ERROR_KEEP + 24} failed`)
    expect(rows.at(-1)?.message).toBe("Pass 25 failed")

    const kept = await database.select().from(tradeEngineErrors)
    expect(kept).toHaveLength(ENGINE_ERROR_KEEP)
  })

  it("reads back newest first", async () => {
    await save(["First"], { when: at })
    await save(["Second"], { when: new Date(at.getTime() + 120_000) })

    expect(
      (await listEngineErrors(database)).map((row) => row.message)
    ).toEqual(["Second", "First"])
  })

  it("prints exactly what console.error was given and still records it", async () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => {})
    const cause = new Error("boom")

    recordEngineError("ladder-worker", "Ladder pass failed", cause)
    expect(printed).toHaveBeenCalledWith("Ladder pass failed", cause)

    // The write is deliberately not awaited at the call site, so give it the
    // turn of the loop it needs before reading the table.
    await vi.waitFor(async () =>
      expect(await listEngineErrors(database)).toHaveLength(1)
    )
    expect((await listEngineErrors(database))[0].message).toBe(
      "Ladder pass failed: boom"
    )
  })
})
