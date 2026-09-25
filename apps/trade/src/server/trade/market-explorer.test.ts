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

it("keeps sound preferences independent from a stale view save", async () => {
  const { saveExplorerSound } = await import("./market-explorer")
  const stale = defaultExplorerPrefs()
  await saveExplorerSound("explorer-one", true)
  stale.current.search = "ETH"
  await saveExplorerPrefs("explorer-one", stale)
  const loaded = await loadExplorerPrefs("explorer-one")
  expect(loaded.prefs.discoverySound).toBe(true)
  expect(loaded.prefs.current.search).toBe("ETH")
  expect((await loadExplorerPrefs("explorer-two")).prefs.discoverySound).toBe(
    false
  )
})

it("does not let an older tab overwrite a more recent visit", async () => {
  const older = { ...defaultExplorerPrefs(), lastVisit: 100 }
  await saveExplorerPrefs("explorer-one", { ...older, lastVisit: 200 })
  await saveExplorerPrefs("explorer-one", older)
  expect((await loadExplorerPrefs("explorer-one")).prefs.lastVisit).toBe(200)
})
