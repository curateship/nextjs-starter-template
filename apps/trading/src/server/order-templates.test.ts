import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import * as schema from "@/server/schema"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  await client.exec(
    await readFile(
      new URL("../../drizzle/0000_custom_shell_baseline.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL(
        "../../drizzle/0026_one_click_order_templates.sql",
        import.meta.url
      ),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL(
        "../../drizzle/0030_one_click_limit_entries.sql",
        import.meta.url
      ),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0034_one_click_risk_sizing.sql", import.meta.url),
      "utf8"
    )
  )
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

describe("order template defaults", () => {
  it("defaults existing templates to market entries", async () => {
    const userId = uuid()
    const createdAt = now()
    await database.insert(schema.customShellUsers).values({
      id: userId,
      email: "limit-defaults@example.test",
      name: "Template Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    const [template] = await database
      .insert(schema.tradingOrderTemplates)
      .values({
        id: uuid(),
        userId,
        name: "Market",
        orderSizePct: "10",
        leverage: 5,
        stopLossPct: "2",
        takeProfitPct: "5",
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    expect(template?.useLimitOrder).toBe(false)
  })

  it("allows only one default template per user", async () => {
    const userId = uuid()
    const createdAt = now()
    await database.insert(schema.customShellUsers).values({
      id: userId,
      email: "templates@example.test",
      name: "Template Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    const template = (name: string) => ({
      id: uuid(),
      userId,
      name,
      orderSizePct: "10",
      leverage: 5,
      stopLossPct: "2",
      takeProfitPct: "5",
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    })

    await database.insert(schema.tradingOrderTemplates).values(template("First"))
    await expect(
      database.insert(schema.tradingOrderTemplates).values(template("Second"))
    ).rejects.toThrow()
  })
})
