import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  HEARTBEAT_STALE_MS,
  heartbeatAgeMs,
  heartbeatFile,
  writeHeartbeat,
} from "@/server/worker-heartbeat"

/**
 * The heartbeat, and every way reading it can go wrong.
 *
 * This is what a container health check acts on, so each failure has to read
 * as "not healthy" rather than as an exception or, worse, as a number that
 * quietly passes. The clock-going-backwards case is the one to keep: a
 * negative age would sail straight past the staleness check and report a dead
 * worker as fine.
 */

let folder: string
let previous: string | undefined

beforeEach(async () => {
  previous = process.env.CUSTOM_SHELL_WORKER_HEARTBEAT
  folder = await mkdtemp(path.join(tmpdir(), "shell-heartbeat-"))
  process.env.CUSTOM_SHELL_WORKER_HEARTBEAT = path.join(folder, "beat")
})

afterEach(async () => {
  if (previous === undefined) delete process.env.CUSTOM_SHELL_WORKER_HEARTBEAT
  else process.env.CUSTOM_SHELL_WORKER_HEARTBEAT = previous
  await rm(folder, { recursive: true, force: true })
})

describe("the worker heartbeat", () => {
  it("reads back as just written", async () => {
    const at = new Date("2026-08-12T10:00:00.000Z")
    await writeHeartbeat(at)

    await expect(heartbeatAgeMs(at.getTime() + 4_000)).resolves.toBe(4_000)
  })

  it("has no age at all before the worker has ever written one", async () => {
    // A missing file is a worker that has not reported, not an age of zero.
    await expect(heartbeatAgeMs()).resolves.toBeNull()
  })

  it("has no age when the file holds something that is not a time", async () => {
    await writeFile(heartbeatFile(), "not a date\n", "utf8")

    await expect(heartbeatAgeMs()).resolves.toBeNull()
  })

  it("reads a beat from the future as just now", async () => {
    const at = new Date("2026-08-12T10:00:00.000Z")
    await writeHeartbeat(at)

    // The clock moved backwards. A negative age would pass every staleness
    // check there is, which is the opposite of what a dead worker deserves.
    await expect(heartbeatAgeMs(at.getTime() - 60_000)).resolves.toBe(0)
  })

  it("goes stale well after a slow pass but well before anyone would wonder", async () => {
    // Eight passes of headroom: enough that a batch of fifty emails through a
    // slow provider is never mistaken for a stopped loop.
    expect(HEARTBEAT_STALE_MS).toBeGreaterThan(15_000 * 4)
    expect(HEARTBEAT_STALE_MS).toBeLessThanOrEqual(5 * 60_000)
  })
})
