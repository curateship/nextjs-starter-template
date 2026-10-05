import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The front page is built from blocks and `/pricing` is a coded page that is
// not. Every other address belongs to no coded page at all, which is what lets
// a page an admin added claim one. Mocked so the test says what it depends on
// rather than inheriting it from the real route files.
vi.mock("@/lib/pages/page-registry", () => ({
  pageForPath: (path: string) => {
    if (path === "/") return { path: "/", blocks: true }
    if (path === "/pricing") return { path: "/pricing", blocks: false }
    return undefined
  },
}))

// Every picture belongs to the admin unless a test says otherwise.
const media = vi.hoisted(() => ({ owned: true }))
vi.mock("@/server/media/library", () => ({
  isOwnedImageUrl: async () => media.owned,
}))

import type { CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import {
  deletePageBlock,
  readPageBlockCounts,
  readPageBlocks,
  readVisiblePageBlocks,
  writePageBlock,
  writePageBlockOrder,
} from "@/server/content/page-blocks"
import {
  createWrittenPage,
  deleteWrittenPage,
  updateWrittenPage,
} from "@/server/content/written-pages"
import type { FrontPageRow } from "@/lib/pages/front-page"

let client: PGlite
let database: TestDatabase

const ADMIN = "admin-1"

/** A plain text block, which is the shortest thing the normaliser will keep. */
function textBlock(id: string, heading: string, hidden = false) {
  return { id, kind: "text", heading, hidden } as unknown as FrontPageRow
}

beforeEach(async () => {
  media.owned = true
  const made = await createTestDatabase()
  client = made.client
  database = made.db
})

afterEach(async () => {
  await client.close()
})

async function site() {
  const workspace = await insertWorkspace(database as unknown as CustomShellDb)
  return workspace.id
}

describe("page blocks", () => {
  it("keeps a page's blocks in the order they were added", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb

    for (const [id, heading] of [
      ["one", "First"],
      ["two", "Second"],
      ["three", "Third"],
    ]) {
      await writePageBlock(
        ADMIN,
        workspaceId,
        { path: "/", block: textBlock(id, heading) },
        db
      )
    }

    expect((await readPageBlocks(workspaceId, "/", db)).map((r) => r.id)).toEqual(
      ["one", "two", "three"]
    )
  })

  it("writes one block and leaves its neighbours alone", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    await writePageBlock(ADMIN, workspaceId, { path: "/", block: textBlock("one", "First") }, db)
    await writePageBlock(ADMIN, workspaceId, { path: "/", block: textBlock("two", "Second") }, db)

    // The same id again is an edit, not a second block, and it keeps its place.
    await writePageBlock(
      ADMIN,
      workspaceId,
      { path: "/", block: textBlock("one", "First, reworded") },
      db
    )

    const rows = await readPageBlocks(workspaceId, "/", db)
    expect(rows.map((r) => `${r.id}:${r.heading}`)).toEqual([
      "one:First, reworded",
      "two:Second",
    ])
  })

  it("never serves a hidden block to a visitor, but still lists it for an admin", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    await writePageBlock(ADMIN, workspaceId, { path: "/", block: textBlock("shown", "Shown") }, db)
    await writePageBlock(
      ADMIN,
      workspaceId,
      { path: "/", block: textBlock("staged", "Staged", true) },
      db
    )

    const visitor = await readVisiblePageBlocks(workspaceId, "/", db)
    expect(visitor.map((r) => r.heading)).toEqual(["Shown"])
    // Not hidden with a class: the words are not in the answer at all.
    expect(JSON.stringify(visitor)).not.toContain("Staged")

    const admin = await readPageBlocks(workspaceId, "/", db)
    expect(admin.map((r) => r.heading)).toEqual(["Shown", "Staged"])
  })

  it("gives each site its own blocks under the same ids", async () => {
    const alpha = await site()
    const beta = await site()
    const db = database as unknown as CustomShellDb

    await writePageBlock(ADMIN, alpha, { path: "/", block: textBlock("hero", "Alpha") }, db)
    await writePageBlock(ADMIN, beta, { path: "/", block: textBlock("hero", "Beta") }, db)

    expect((await readPageBlocks(alpha, "/", db)).map((r) => r.heading)).toEqual(["Alpha"])
    expect((await readPageBlocks(beta, "/", db)).map((r) => r.heading)).toEqual(["Beta"])
  })

  it("reorders a page without losing a block the request left out", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    for (const id of ["one", "two", "three"]) {
      await writePageBlock(ADMIN, workspaceId, { path: "/", block: textBlock(id, id) }, db)
    }

    // A list from a tab that never saw "three" still cannot drop it.
    await writePageBlockOrder(workspaceId, "/", ["two", "one"], db)

    expect((await readPageBlocks(workspaceId, "/", db)).map((r) => r.id)).toEqual(
      ["two", "one", "three"]
    )
  })

  it("deletes one block of one site and nothing else", async () => {
    const alpha = await site()
    const beta = await site()
    const db = database as unknown as CustomShellDb
    await writePageBlock(ADMIN, alpha, { path: "/", block: textBlock("hero", "Alpha") }, db)
    await writePageBlock(ADMIN, beta, { path: "/", block: textBlock("hero", "Beta") }, db)

    await deletePageBlock(alpha, "hero", db)

    expect(await readPageBlocks(alpha, "/", db)).toEqual([])
    expect((await readPageBlocks(beta, "/", db)).map((r) => r.heading)).toEqual(["Beta"])
  })

  it("takes a page's blocks with it when the page moves", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    const page = await createWrittenPage(
      workspaceId,
      { path: "/about", title: "About" },
      db
    )
    await writePageBlock(
      ADMIN,
      workspaceId,
      { path: "/about", block: textBlock("one", "First") },
      db
    )

    await updateWrittenPage(workspaceId, page.id, { path: "/about-us" }, db)

    expect(await readPageBlocks(workspaceId, "/about", db)).toEqual([])
    expect(
      (await readPageBlocks(workspaceId, "/about-us", db)).map((r) => r.heading)
    ).toEqual(["First"])
  })

  it("takes a page's blocks away when the page is deleted", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    const page = await createWrittenPage(
      workspaceId,
      { path: "/about", title: "About" },
      db
    )
    await writePageBlock(
      ADMIN,
      workspaceId,
      { path: "/about", block: textBlock("one", "First") },
      db
    )

    await deleteWrittenPage(workspaceId, page.id, db)

    // Nothing left to be inherited by whoever makes a page there next.
    expect(await readPageBlocks(workspaceId, "/about", db)).toEqual([])
  })

  it("refuses a block on a page that is not built from blocks", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb

    await expect(
      writePageBlock(
        ADMIN,
        workspaceId,
        { path: "/pricing", block: textBlock("hero", "Nope") },
        db
      )
    ).rejects.toThrow("not built from blocks")
  })

  it("refuses a block the page could not draw", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb

    await expect(
      writePageBlock(
        ADMIN,
        workspaceId,
        { path: "/", block: textBlock("blank", "") },
        db
      )
    ).rejects.toThrow("missing something")
  })

  it("keeps a words block's document, and only the parts a page may hold", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    const words = {
      id: "words",
      kind: "words",
      heading: "About us",
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "We sell things." }] },
          { type: "iframe", attrs: { src: "//evil" } },
        ],
      },
    } as unknown as FrontPageRow

    await writePageBlock(ADMIN, workspaceId, { path: "/", block: words }, db)

    const [saved] = await readPageBlocks(workspaceId, "/", db)
    expect(saved.kind).toBe("words")
    if (saved.kind !== "words") throw new Error("the block changed kind")
    // The paragraph survives and the iframe does not: a words block is checked
    // by the same cleaner a written page always used.
    expect(saved.body.content).toHaveLength(1)
    expect(JSON.stringify(saved.body)).toContain("We sell things.")
    expect(JSON.stringify(saved.body)).not.toContain("iframe")
  })

  it("counts the blocks of each page for the Pages screen", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    await writePageBlock(ADMIN, workspaceId, { path: "/", block: textBlock("one", "First") }, db)
    await writePageBlock(ADMIN, workspaceId, { path: "/", block: textBlock("two", "Second") }, db)

    expect(await readPageBlockCounts(workspaceId, db)).toEqual({ "/": 2 })
  })

  it("refuses a picture that is not the admin's own", async () => {
    const workspaceId = await site()
    const db = database as unknown as CustomShellDb
    const logos = {
      id: "logos",
      kind: "logos",
      heading: "Customers",
      items: [{ id: "one", image: "https://files.example.test/stranger.png", alt: "One" }],
    } as unknown as FrontPageRow

    media.owned = false
    await expect(
      writePageBlock(ADMIN, workspaceId, { path: "/", block: logos }, db)
    ).rejects.toThrow("media library")

    // The same picture is fine once it is theirs, and stays fine on the next
    // save even if the library check would now refuse it — it is already on
    // the block.
    media.owned = true
    await writePageBlock(ADMIN, workspaceId, { path: "/", block: logos }, db)
    media.owned = false
    await writePageBlock(ADMIN, workspaceId, { path: "/", block: logos }, db)
    expect((await readPageBlocks(workspaceId, "/", db)).map((r) => r.id)).toEqual(
      ["logos"]
    )
  })
})
