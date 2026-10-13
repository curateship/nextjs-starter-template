import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import {
  getScriptBannedWords,
  saveScriptBannedWords,
} from "@/server/video/settings"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

describe("the script check's banned words", () => {
  it("are the four starter words until a list is saved", async () => {
    expect(await getScriptBannedWords(database)).toEqual([
      "delve",
      "crucial",
      "game-changer",
      "unlock",
    ])
  })

  it("are exactly the saved list once there is one", async () => {
    await saveScriptBannedWords(["delve", "Let's dive in"], database)
    expect(await getScriptBannedWords(database)).toEqual(["delve", "Let's dive in"])
  })

  it("stay empty when every word was taken off on purpose", async () => {
    await saveScriptBannedWords([], database)
    expect(await getScriptBannedWords(database)).toEqual([])
  })
})
