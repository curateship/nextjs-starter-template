import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createDefaultBrandKit } from "@/lib/video/brand-kit"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import { getVideoBrandKit, saveVideoBrandKit } from "@/server/video/settings"

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

describe("the brand kit", () => {
  it("hands back the built-in kit before anything is saved", async () => {
    const kit = await getVideoBrandKit(database)
    expect(kit).toEqual(createDefaultBrandKit())
  })

  it("saves once and updates in place after that — there is only ever one kit", async () => {
    await saveVideoBrandKit(
      {
        ...createDefaultBrandKit(),
        colors: [{ name: "Brand", value: "#ff0000" }],
      },
      database
    )
    await saveVideoBrandKit(
      {
        ...createDefaultBrandKit(),
        colors: [{ name: "Brand", value: "#00ff00" }],
      },
      database
    )
    const kit = await getVideoBrandKit(database)
    expect(kit.colors).toEqual([{ name: "Brand", value: "#00ff00" }])
  })

  it("drops a colour nobody could draw and keeps the rest", async () => {
    await saveVideoBrandKit(
      {
        ...createDefaultBrandKit(),
        colors: [
          { name: "Good", value: "#123456" },
          { name: "", value: "#123456" },
          { name: "Bad", value: "rgb(1,2,3)" },
        ],
      },
      database
    )
    const kit = await getVideoBrandKit(database)
    expect(kit.colors).toEqual([{ name: "Good", value: "#123456" }])
  })

  it("keeps the logo that was picked", async () => {
    await saveVideoBrandKit(
      { ...createDefaultBrandKit(), logoUrl: "https://media.test/logo.png" },
      database
    )
    const kit = await getVideoBrandKit(database)
    expect(kit.logoUrl).toBe("https://media.test/logo.png")
  })

  it("reads a saved kit written before a field existed", async () => {
    // Only colours were saved; everything else takes its default rather than
    // arriving as undefined and breaking the screen that draws it.
    await saveVideoBrandKit({ colors: [{ name: "One", value: "#000000" }] }, database)
    const kit = await getVideoBrandKit(database)
    expect(kit.colors).toEqual([{ name: "One", value: "#000000" }])
    expect(kit.logoUrl).toBe("")
  })
})
