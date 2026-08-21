import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setPageVisibility } from "@/server/content/pages"
import {
  publicRequestOrigin,
  readSitemapEntries,
  renderSitemapIndexXml,
  renderSitemapXml,
} from "@/server/content/sitemap"
import { createWrittenPage } from "@/server/content/written-pages"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

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

describe("one site's sitemap entries", () => {
  it("contains only public pages belonging to that site", async () => {
    await createWrittenPage(
      alpha,
      { path: "/alpha-only", title: "Alpha", body: body("Alpha") },
      database
    )
    await createWrittenPage(
      alpha,
      { path: "/alpha-private", title: "Private", body: body("Private") },
      database
    )
    await createWrittenPage(
      beta,
      { path: "/beta-only", title: "Beta", body: body("Beta") },
      database
    )
    await setPageVisibility(
      alpha,
      { path: "/pricing", visibility: "off" },
      database
    )
    await setPageVisibility(
      alpha,
      { path: "/alpha-private", visibility: "members" },
      database
    )

    const alphaEntries = await readSitemapEntries(alpha, database)
    const betaEntries = await readSitemapEntries(beta, database)
    const alphaPaths = alphaEntries.map((entry) => entry.path)
    const betaPaths = betaEntries.map((entry) => entry.path)

    expect(alphaPaths).toContain("/alpha-only")
    expect(alphaPaths).not.toContain("/alpha-private")
    expect(alphaPaths).not.toContain("/beta-only")
    expect(alphaPaths).not.toContain("/pricing")
    expect(betaPaths).toContain("/beta-only")
    expect(betaPaths).not.toContain("/alpha-only")
    expect(betaPaths).toContain("/pricing")
    expect(
      alphaEntries.find((entry) => entry.path === "/alpha-only")?.updatedAt
    ).toBeInstanceOf(Date)
  })
})

describe("writing the public files", () => {
  it("escapes addresses and writes last-changed dates", () => {
    const updatedAt = new Date("2026-08-10T12:00:00.000Z")
    const xml = renderSitemapXml("https://alpha.example.com", [
      { path: "/" },
      { path: "/search?q=fish&chips", updatedAt },
    ])

    expect(xml).toContain("<loc>https://alpha.example.com/</loc>")
    expect(xml).toContain("fish&amp;chips")
    expect(xml).toContain(`<lastmod>${updatedAt.toISOString()}</lastmod>`)
  })

  it("refuses an app entry that points at another site", () => {
    expect(() =>
      renderSitemapXml("https://alpha.example.com", [
        { path: "//somebody-else.example.com/stolen" },
      ])
    ).toThrow("must stay on this site")
  })

  it("lists every numbered file plus the site's pages in the index", () => {
    const updatedAt = new Date("2026-08-19T09:00:00.000Z")
    const xml = renderSitemapIndexXml("https://alpha.example.com", [
      { path: "/directory-sitemaps/0", updatedAt },
      { path: "/directory-sitemaps/1" },
    ])

    expect(xml).toContain("<sitemapindex")
    expect(xml).toContain(
      "<loc>https://alpha.example.com/sitemap.xml?part=pages</loc>"
    )
    expect(xml).toContain(
      "<loc>https://alpha.example.com/directory-sitemaps/0</loc>"
    )
    expect(xml).toContain(
      "<loc>https://alpha.example.com/directory-sitemaps/1</loc>"
    )
    expect(xml).toContain(`<lastmod>${updatedAt.toISOString()}</lastmod>`)
  })

  it("refuses a numbered file that points at another site", () => {
    expect(() =>
      renderSitemapIndexXml("https://alpha.example.com", [
        { path: "//somebody-else.example.com/stolen" },
      ])
    ).toThrow("must stay on this site")
  })

  it("uses the visitor's forwarded public address", () => {
    const request = new Request("http://internal:3000/sitemap.xml", {
      headers: {
        host: "alpha.example.com",
        "x-forwarded-proto": "https",
      },
    })

    expect(publicRequestOrigin(request)).toBe("https://alpha.example.com")
  })
})
