import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  COLOUR_LOOK_NAME_MESSAGE,
  COLOUR_LOOKS_FULL_MESSAGE,
  MAX_COLOUR_LOOKS,
} from "@/lib/video/colour-looks"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { deleteColourLook, listColourLooks, saveColourLook } from "@/server/video/colour-looks"

let client: PGlite
let database: CustomShellDb
let me: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  me = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

const look = { look: "warm" as const, brightness: 0.1, contrast: 1.2, saturation: 0.9 }

describe("your own looks", () => {
  it("are saved under a name and listed in name order, yours only", async () => {
    await saveColourLook(me.id, { name: "  Kitchen   evening ", ...look }, database)
    await saveColourLook(me.id, { name: "Beach", ...look, look: null }, database)
    const stranger = await insertUser(database)
    await saveColourLook(stranger.id, { name: "Theirs", ...look }, database)

    const mine = await listColourLooks(me.id, database)
    expect(mine.map((one) => one.name)).toEqual(["Beach", "Kitchen evening"])
    expect(mine[1]).toMatchObject({ look: "warm", brightness: 0.1, contrast: 1.2, saturation: 0.9 })
    expect(mine[0].look).toBeNull()
  })

  it("replace a look of the same name", async () => {
    await saveColourLook(me.id, { name: "Kitchen", ...look }, database)
    await saveColourLook(me.id, { name: "Kitchen", ...look, look: "noir" }, database)
    const mine = await listColourLooks(me.id, database)
    expect(mine).toHaveLength(1)
    expect(mine[0].look).toBe("noir")
  })

  it("keep the sliders inside their limits, and need a name", async () => {
    const saved = await saveColourLook(
      me.id,
      { name: "Wild", look: null, brightness: 9, contrast: -1, saturation: 5 },
      database
    )
    expect(saved).toMatchObject({ brightness: 0.5, contrast: 0.5, saturation: 2 })
    await expect(saveColourLook(me.id, { name: "   ", ...look }, database)).rejects.toThrow(
      COLOUR_LOOK_NAME_MESSAGE
    )
  })

  it(`stop at ${MAX_COLOUR_LOOKS}`, async () => {
    for (let index = 0; index < MAX_COLOUR_LOOKS; index++) {
      await saveColourLook(me.id, { name: `Look ${index}`, ...look }, database)
    }
    await expect(saveColourLook(me.id, { name: "One more", ...look }, database)).rejects.toThrow(
      COLOUR_LOOKS_FULL_MESSAGE
    )
  })

  it("are deleted only by their owner", async () => {
    const saved = await saveColourLook(me.id, { name: "Kitchen", ...look }, database)
    const stranger = await insertUser(database)
    await deleteColourLook(stranger.id, saved.id, database)
    expect(await listColourLooks(me.id, database)).toHaveLength(1)
    await deleteColourLook(me.id, saved.id, database)
    expect(await listColourLooks(me.id, database)).toHaveLength(0)
  })
})
