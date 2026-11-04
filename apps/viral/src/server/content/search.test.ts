import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setPageVisibility } from "@/server/content/pages"
import { createWrittenPage } from "@/server/content/written-pages"
import { writePageBlock } from "@/server/content/page-blocks"
import { createFrontPageRowDraft } from "@/lib/pages/front-page"
import { customShellWorkspaces } from "@/server/schema"
import { searchWrittenPages } from "@/server/content/search"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

const body = (words: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: words }] }],
})

/**
 * A page and the words on it. The words are a block now, so a test that wants
 * a page with something written on it makes both, the way the app does.
 */
async function writePage(
  workspaceId: string,
  input: { path: string; title: string; words?: string }
) {
  const { words, ...page } = input
  const created = await createWrittenPage(workspaceId, page, database)
  if (words !== undefined) {
    await writePageBlock(
      "admin",
      workspaceId,
      {
        path: created.path,
        block: {
          ...createFrontPageRowDraft("words"),
          id: `words-${created.id}`,
          heading: created.title,
          body: body(words),
        },
      }
    )
  }
  return created
}

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
    await writePage(
      alpha,
      {
        path: "/parking",
        title: "Parking guide",
        words: "Where to leave your car.",
      },
    )
    await writePage(
      alpha,
      {
        path: "/visit",
        title: "Plan your visit",
        words: "Parking is behind the building.",
      },
    )

    const results = await searchWrittenPages(alpha, "parking", 40)

    expect(results.map((result) => result.path)).toEqual(["/parking", "/visit"])
    expect(results[1]).toMatchObject({
      type: "Page",
      snippet: "Parking is behind the building.",
    })
  })

  it("never returns another site's words", async () => {
    await writePage(
      alpha,
      {
        path: "/about",
        title: "Alpha",
        words: "Shared parking phrase",
      },
    )
    await writePage(
      beta,
      {
        path: "/about",
        title: "Beta",
        words: "Shared parking phrase",
      },
    )

    const results = await searchWrittenPages(alpha, "parking", 40)

    expect(results.map((result) => result.title)).toEqual(["Alpha"])
  })

  it("keeps switched-off and members-only pages out of the query", async () => {
    for (const [path, title] of [
      ["/open", "Open page"],
      ["/hidden", "Hidden page"],
      ["/members", "Members page"],
    ] as const) {
      await writePage(
        alpha,
        {
          path,
          title,
          words: "Unmistakable parking words",
        }
      )
    }
    await setPageVisibility(alpha, { path: "/hidden", visibility: "off" })
    await setPageVisibility(alpha, { path: "/members", visibility: "members" })

    const results = await searchWrittenPages(alpha, "unmistakable", 40)

    expect(results.map((result) => result.path)).toEqual(["/open"])
  })

  it("treats a malformed saved visibility as the public default", async () => {
    await writePage(
      alpha,
      { path: "/public", title: "Public page", words: "Parking" },
    )
    await database
      .update(customShellWorkspaces)
      .set({ settings: { pages: { "/public": { visibility: "broken" } } } })
      .where(eq(customShellWorkspaces.id, alpha))

    const results = await searchWrittenPages(alpha, "parking", 40)

    expect(results.map((result) => result.path)).toEqual(["/public"])
  })

  it("returns no more than the requested bound", async () => {
    for (let index = 0; index < 4; index += 1) {
      await writePage(
        alpha,
        {
          path: `/page-${index}`,
          title: `Match ${index}`,
          words: "Bounded phrase",
        }
      )
    }

    await expect(searchWrittenPages(alpha, "match", 2, database)).resolves.toHaveLength(2)
  })

  it("treats database wildcard characters as ordinary search text", async () => {
    await writePage(
      alpha,
      { path: "/ordinary", title: "Ordinary page", words: "Words" },
    )

    await expect(searchWrittenPages(alpha, "%", 40, database)).resolves.toEqual([])
    await expect(searchWrittenPages(alpha, "_", 40, database)).resolves.toEqual([])
  })
})
