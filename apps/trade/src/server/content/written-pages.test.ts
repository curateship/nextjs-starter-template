import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { writtenPageText } from "@/lib/pages/written-page-body"
import {
  loadPagesOverview,
  readPageVisibility,
  readWrittenPageForViewer,
  setPageVisibility,
} from "@/server/content/pages"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"
import {
  createWrittenPage,
  deleteWrittenPage,
  findWrittenPage,
  listWrittenPages,
  normalizeWrittenPagePath,
  updateWrittenPage,
  writtenPagePathProblem,
} from "@/server/content/written-pages"

/**
 * Pages an admin writes. Two things have to hold: an address can only ever
 * belong to one page, and a written page is an ordinary page once it exists —
 * the same switch, the same list, the same not-found when it goes.
 */

let client: PGlite
let database: TestDatabase

const at = new Date("2026-08-06T12:00:00Z")

const body = (words: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: words }] }],
})

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

describe("tidying an address", () => {
  it("makes one address out of the ways somebody might type it", () => {
    for (const typed of ["about", "/about", "/About ", "/about/", "//about"]) {
      expect(normalizeWrittenPagePath(typed), typed).toBe("/about")
    }
  })
})

describe("which addresses may be claimed", () => {
  it("refuses an address a coded page already answers on", () => {
    // The registry is the only list that knows the coded pages, which is why
    // this check is here and not in the database's unique index.
    expect(writtenPagePathProblem("/pricing")).toContain("already answers")
    expect(writtenPagePathProblem("/login")).toContain("already answers")
  })

  it("refuses the app's own machinery", () => {
    for (const path of ["/admin", "/admin/users", "/api", "/api/v1/media"]) {
      expect(writtenPagePathProblem(path), path).toContain("the app itself")
    }
  })

  it("refuses an address that is not one", () => {
    expect(writtenPagePathProblem("/")).toContain("something after the slash")
    expect(writtenPagePathProblem("/what is this")).toContain("letters, numbers")
    expect(writtenPagePathProblem("/about.php")).toContain("letters, numbers")
  })

  it("allows a plain free address", () => {
    expect(writtenPagePathProblem("/about")).toBeNull()
    expect(writtenPagePathProblem("/about-us")).toBeNull()
    expect(writtenPagePathProblem("/help/delivery")).toBeNull()
  })
})

describe("writing a page", () => {
  it("creates one and serves it by address", async () => {
    const page = await createWrittenPage(
      { path: "About", title: "About us", body: body("We sell things.") },
      database
    )

    expect(page.path).toBe("/about")
    const found = await findWrittenPage("/about", database)
    expect(found?.title).toBe("About us")
    expect(writtenPageText(found!.body)).toBe("We sell things.")
  })

  it("refuses a second page on the same address", async () => {
    await createWrittenPage(
      { path: "/about", title: "About", body: body("One") },
      database
    )

    await expect(
      createWrittenPage(
        { path: "/about", title: "Another", body: body("Two") },
        database
      )
    ).rejects.toThrow("already answers on /about")
  })

  it("refuses an address a coded page holds", async () => {
    await expect(
      createWrittenPage(
        { path: "/pricing", title: "My pricing", body: body("Cheap") },
        database
      )
    ).rejects.toThrow("already answers on /pricing")
  })

  it("insists on a title", async () => {
    await expect(
      createWrittenPage({ path: "/about", title: "   ", body: body("Hi") }, database)
    ).rejects.toThrow("needs a title")
  })

  it("stores only what a page is allowed to hold", async () => {
    const page = await createWrittenPage(
      {
        path: "/about",
        title: "About",
        body: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Kept" }] },
            { type: "iframe", attrs: { src: "//evil" } },
          ],
        },
      },
      database
    )

    expect(page.body.content).toHaveLength(1)
  })
})

describe("changing and removing a page", () => {
  it("moves a page to a free address", async () => {
    const page = await createWrittenPage(
      { path: "/about", title: "About", body: body("Hi") },
      database
    )

    const moved = await updateWrittenPage(page.id, { path: "/about-us" }, database)

    expect(moved.path).toBe("/about-us")
    expect(await findWrittenPage("/about", database)).toBeNull()
  })

  it("refuses to move onto another page's address", async () => {
    await createWrittenPage(
      { path: "/about", title: "About", body: body("Hi") },
      database
    )
    const other = await createWrittenPage(
      { path: "/help", title: "Help", body: body("Hi") },
      database
    )

    await expect(
      updateWrittenPage(other.id, { path: "/about" }, database)
    ).rejects.toThrow("already answers on /about")
  })

  it("lets a page keep its own address while something else changes", async () => {
    const page = await createWrittenPage(
      { path: "/about", title: "About", body: body("Hi") },
      database
    )

    const saved = await updateWrittenPage(
      page.id,
      { path: "/about", title: "About us" },
      database
    )

    expect(saved.title).toBe("About us")
  })

  it("makes the address stop existing when the page goes", async () => {
    const page = await createWrittenPage(
      { path: "/about", title: "About", body: body("Hi") },
      database
    )

    await deleteWrittenPage(page.id, database)

    // The route asks exactly this, and null is what makes it answer not-found.
    expect(await findWrittenPage("/about", database)).toBeNull()
    expect(await listWrittenPages(database)).toEqual([])
  })

  it("says so when the page is already gone", async () => {
    await expect(deleteWrittenPage("nope", database)).rejects.toThrow(
      "no longer exists"
    )
  })
})

describe("a written page is an ordinary page", () => {
  it("appears in the pages list beside the coded ones, in address order", async () => {
    await createWrittenPage(
      { path: "/about", title: "About us", body: body("Hi") },
      database
    )

    const overview = await loadPagesOverview(database, at)
    const paths = overview.rows.map((row) => row.path)
    const about = overview.rows.find((row) => row.path === "/about")

    expect(about?.name).toBe("About us")
    // Written, so the screen may offer Edit; a coded page carries null here.
    expect(about?.writtenPageId).toBeTruthy()
    expect(overview.rows.find((row) => row.path === "/pricing")?.writtenPageId)
      .toBeNull()
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })

  it("can be switched off like any other page", async () => {
    await createWrittenPage(
      { path: "/about", title: "About", body: body("Hi") },
      database
    )

    expect(await readPageVisibility("/about", database)).toBe("everyone")

    await setPageVisibility({ path: "/about", visibility: "off" }, database)

    expect(await readPageVisibility("/about", database)).toBe("off")
  })

  it("keys the switch off the tidied address, not what was typed", async () => {
    await createWrittenPage(
      { path: "/about", title: "About", body: body("Hi") },
      database
    )

    // Saved under "/About" but read under "/about" — one page, so one key, or
    // the switch would be written somewhere nothing ever looks.
    await setPageVisibility({ path: "/About", visibility: "off" }, database)

    expect(await readPageVisibility("/about", database)).toBe("off")
  })

  it("never hands out the words of a page that is switched off", async () => {
    // The endpoint behind this is public — it has to be, or no written page
    // would be readable — so it is what decides, not the page that draws it.
    // Fetching first and checking second would let a direct call read a hidden
    // page's words, which is the switch working in a browser and nowhere else.
    await createWrittenPage(
      { path: "/about", title: "About", body: body("Our secret plans.") },
      database
    )
    await setPageVisibility({ path: "/about", visibility: "off" }, database)

    for (const signedIn of [false, true]) {
      const view = await readWrittenPageForViewer("/about", signedIn, database)
      // Reported as missing, not as "hidden": a page that admitted to being
      // switched off would be telling the caller it is there.
      expect(view.status, `signedIn=${signedIn}`).toBe("missing")
      expect(JSON.stringify(view)).not.toContain("secret")
    }
  })

  it("asks a signed-out visitor to sign in without showing them the words", async () => {
    await createWrittenPage(
      { path: "/about", title: "About", body: body("Members only text.") },
      database
    )
    await setPageVisibility({ path: "/about", visibility: "members" }, database)

    const visitor = await readWrittenPageForViewer("/about", false, database)
    expect(visitor.status).toBe("signIn")
    expect(JSON.stringify(visitor)).not.toContain("Members only text")

    const member = await readWrittenPageForViewer("/about", true, database)
    expect(member.status).toBe("ok")
  })

  it("hands over a page anybody may see", async () => {
    await createWrittenPage(
      { path: "/about", title: "About", body: body("Open to all.") },
      database
    )

    const view = await readWrittenPageForViewer("/about", false, database)
    expect(view.status).toBe("ok")
    if (view.status === "ok") {
      expect(writtenPageText(view.page.body)).toBe("Open to all.")
    }
  })

  it("answers everyone once the page is deleted", async () => {
    const page = await createWrittenPage(
      { path: "/about", title: "About", body: body("Hi") },
      database
    )
    await setPageVisibility({ path: "/about", visibility: "off" }, database)
    await deleteWrittenPage(page.id, database)

    // Nothing is there to hide any more, and the route answers not-found on
    // its own because no page was found.
    expect(await readPageVisibility("/about", database)).toBe("everyone")
  })
})
