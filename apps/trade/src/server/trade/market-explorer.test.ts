import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { PGlite } from "@electric-sql/pglite"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { defaultExplorerPrefs } from "@/lib/trade/market-explorer"
import { loadExplorerPrefs, saveExplorerPrefs } from "./market-explorer"

let client: PGlite
beforeEach(async () => {
  const test = await createTestDatabase()
  client = test.client
  await insertUser(test.db, { id: "explorer-one" })
  await insertUser(test.db, { id: "explorer-two" })
})
afterEach(async () => {
  await client.close()
})
describe("account-owned market explorer settings", () => {
  it("migrates the column and keeps two accounts' settings separate", async () => {
    const prefs = defaultExplorerPrefs()
    prefs.current.search = "BTC"
    await saveExplorerPrefs("explorer-one", prefs)
    expect((await loadExplorerPrefs("explorer-one")).prefs.current.search).toBe(
      "BTC"
    )
    expect((await loadExplorerPrefs("explorer-two")).prefs.current.search).toBe(
      ""
    )
  })
})
