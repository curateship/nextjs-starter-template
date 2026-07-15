import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"

import {
  getWorkerControl,
  listWorkerControls,
  setWorkerEnabled,
  setWorkerPaused,
} from "./control"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../../drizzle/0000_custom_shell_baseline.sql",
    "../../../drizzle/0004_trading.sql",
    "../../../drizzle/0007_scanner_control.sql",
    "../../../drizzle/0008_backtests.sql",
    "../../../drizzle/0042_market_scanner_runtime_control.sql",
    "../../../drizzle/0043_dedicated_workers.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

describe("worker controls", () => {
  it("seeds one durable control for every dedicated worker", async () => {
    const controls = await listWorkerControls(
      database as unknown as CustomShellDb
    )
    expect(controls.map((control) => control.kind).sort()).toEqual([
      "backtest",
      "bot",
      "market-scanner",
      "whale-scanner",
    ])
  })

  it("keeps off and paused as separate states", async () => {
    await setWorkerPaused(
      "whale-scanner",
      true,
      database as unknown as CustomShellDb
    )
    expect(
      await getWorkerControl(
        "whale-scanner",
        database as unknown as CustomShellDb
      )
    ).toMatchObject({ enabled: true, paused: true })

    await setWorkerEnabled(
      "whale-scanner",
      false,
      database as unknown as CustomShellDb
    )
    expect(
      await getWorkerControl(
        "whale-scanner",
        database as unknown as CustomShellDb
      )
    ).toMatchObject({ enabled: false, paused: false })

    await expect(
      setWorkerPaused(
        "whale-scanner",
        true,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("Turn the worker on")
  })
})
