import { afterEach, beforeEach, expect, it } from "vitest"
import type { PGlite } from "@electric-sql/pglite"
import { createTestDatabase } from "@/server/test-support"
import { recordMarketFirstSeen } from "./market-first-seen"
let client: PGlite
beforeEach(async () => {
  client = (await createTestDatabase()).client
})
afterEach(async () => {
  await client.close()
})
it("stamps each key once, including concurrent writers", async () => {
  const first = new Date("2026-09-01T00:00:00Z")
  expect(
    await recordMarketFirstSeen(
      ["aster:mainnet:BTC", "aster:mainnet:BTC"],
      first
    )
  ).toEqual({ "aster:mainnet:BTC": first.getTime() })
  const results = await Promise.all([
    recordMarketFirstSeen(["aster:mainnet:BTC"], new Date()),
    recordMarketFirstSeen(["aster:mainnet:BTC"], new Date()),
  ])
  for (const result of results)
    expect(result["aster:mainnet:BTC"]).toBe(first.getTime())
  expect(await recordMarketFirstSeen([])).toEqual({})
})
