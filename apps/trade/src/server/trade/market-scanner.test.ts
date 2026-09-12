import { afterEach, beforeEach, it, expect } from "vitest"
import type { PGlite } from "@electric-sql/pglite"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { defaultScannerSettings } from "@/lib/trade/market-scanner"
import { loadScannerSettings, saveScannerSettings } from "./market-scanner"
import { loadExplorerPrefs, saveExplorerPrefs } from "./market-explorer"
import { defaultExplorerPrefs } from "@/lib/trade/market-explorer"
let client: PGlite
beforeEach(async () => {
  const test = await createTestDatabase()
  client = test.client
  await insertUser(test.db, { id: "scanner-one" })
  await insertUser(test.db, { id: "scanner-two" })
})
afterEach(async () => {
  await client.close()
})
it("migrates and saves scanner settings without changing Discovery or another account", async () => {
  await saveExplorerPrefs("scanner-one", defaultExplorerPrefs())
  const settings = {
    ...defaultScannerSettings(),
    mode: "both" as const,
    interval: "15m" as const,
    volumeMultiple: 3,
  }
  await saveScannerSettings("scanner-one", settings)
  expect(await loadScannerSettings("scanner-one")).toEqual(settings)
  expect(await loadScannerSettings("scanner-two")).toEqual(
    defaultScannerSettings()
  )
  expect((await loadExplorerPrefs("scanner-one")).prefs).toEqual(
    defaultExplorerPrefs()
  )
})
