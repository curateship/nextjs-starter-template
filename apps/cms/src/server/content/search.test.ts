import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setPageVisibility } from "@/server/content/pages"
import { searchWrittenPages } from "@/server/content/search"
import { createWrittenPage } from "@/server/content/written-pages"
import { customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

const body = (words: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: words }] }],
})

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

describe("written pages in whole-site search", () => {
  it("searches titles and stored body words with title matches first", async () => {
    await createWrittenPage(
      alpha,
      {
        path: "/parking",
        title: "Parking guide",
        body: body("Where to leave your car."),
      },
      database
    )
    await createWrittenPage(
      alpha,
      {
        path: "/visit",
        title: "Plan your visit",
        body: body("Parking is behind the building."),
      },
      database
    )

    const results = await searchWrittenPages(alpha, "parking", 40, database)

    expect(results.map((result) => result.path)).toEqual(["/parking", "/visit"])
    expect(results[1]).toMatchObject({
      type: "Page",
      snippet: "Parking is behind the building.",
    })
  })

  it("never returns another site's words", async () => {
    await createWrittenPage(
      alpha,
      {
        path: "/about",
        title: "Alpha",
        body: body("Shared parking phrase"),
      },
      database
    )
    await createWrittenPage(
      beta,
      {
        path: "/about",
        title: "Beta",
        body: body("Shared parking phrase"),
      },
      database
    )

    const results = await searchWrittenPages(alpha, "parking", 40, database)

    expect(results.map((result) => result.title)).toEqual(["Alpha"])
  })

  it("keeps switched-off and members-only pages out of the query", async () => {
    for (const [path, title] of [
      ["/open", "Open page"],
      ["/hidden", "Hidden page"],
      ["/members", "Members page"],
    ] as const) {
      await createWrittenPage(
        alpha,
        {
          path,
          title,
          body: body("Unmistakable parking words"),
        },
        database
      )
    }
    await setPageVisibility(alpha, { path: "/hidden", visibility: "off" }, database)
    await setPageVisibility(alpha, { path: "/members", visibility: "members" }, database)

    const results = await searchWrittenPages(alpha, "unmistakable", 40, database)

    expect(results.map((result) => result.path)).toEqual(["/open"])
  })

  it("treats a malformed saved visibility as the public default", async () => {
    await createWrittenPage(
      alpha,
      { path: "/public", title: "Public page", body: body("Parking") },
      database
    )
    await database
      .update(customShellWorkspaces)
      .set({ settings: { pages: { "/public": { visibility: "broken" } } } })
      .where(eq(customShellWorkspaces.id, alpha))

    const results = await searchWrittenPages(alpha, "parking", 40, database)

    expect(results.map((result) => result.path)).toEqual(["/public"])
  })

  it("returns no more than the requested bound", async () => {
    for (let index = 0; index < 4; index += 1) {
      await createWrittenPage(
        alpha,
        {
          path: `/page-${index}`,
          title: `Match ${index}`,
          body: body("Bounded phrase"),
        },
        database
      )
    }

    await expect(searchWrittenPages(alpha, "match", 2, database)).resolves.toHaveLength(2)
  })

  it("treats database wildcard characters as ordinary search text", async () => {
    await createWrittenPage(
      alpha,
      { path: "/ordinary", title: "Ordinary page", body: body("Words") },
      database
    )

    await expect(searchWrittenPages(alpha, "%", 40, database)).resolves.toEqual([])
    await expect(searchWrittenPages(alpha, "_", 40, database)).resolves.toEqual([])
  })
})
