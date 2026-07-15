import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { getScannerAlertsPoll } from "@/server/notification-feed"
import * as schema from "@/server/schema"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0006_scanner.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

describe("notification feed polling", () => {
  it("returns only the five newest unread scanner alerts", async () => {
    const createdAt = now()
    await database.insert(schema.scannerAlerts).values(
      Array.from({ length: 7 }, (_, index) => ({
        id: uuid(),
        type: "large_trade",
        title: `Alert ${index}`,
        createdAt: new Date(createdAt.getTime() + index * 1_000),
        readAt: index === 0 ? createdAt : null,
      }))
    )

    const result = await getScannerAlertsPoll(
      database as unknown as CustomShellDb
    )

    expect(result.unreadCount).toBe(6)
    expect(result.latest).toHaveLength(5)
    expect(result.latest[0]?.title).toBe("Alert 6")
    expect(result.latest.at(-1)?.title).toBe("Alert 2")
  })
})
