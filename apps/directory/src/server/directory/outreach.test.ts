import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  buildOutreachOptOutUrl,
  handleOutreachOptOut,
  outreachListings,
  recordOutreachOptOut,
  sendClaimOutreach,
} from "@/server/directory/outreach"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let oldSecret: string | undefined

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  oldSecret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "outreach-test-key"
})

afterEach(async () => {
  if (oldSecret === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = oldSecret
  await client.close()
})

async function contactListing(workspaceId: string, title: string, email: string) {
  const row = await createListing(workspaceId, { title }, database)
  return updateListing(
    workspaceId,
    row.id,
    {
      status: "published",
      contactLinks: {
        address: "",
        menuLinks: [{ id: "email", type: "email", label: "", value: email }],
        socialLinks: [],
      },
    },
    database
  )
}

describe("claim outreach", () => {
  it("never sends the same listing and address twice", async () => {
    const admin = await insertUser(database, { role: "admin" })
    const site = await insertWorkspace(database, { name: "Alpha" })
    const listing = await contactListing(site.id, "Cafe", "owner@example.com")

    const first = await sendClaimOutreach(site.id, admin.id, [listing.id], database)
    const second = await sendClaimOutreach(site.id, admin.id, [listing.id], database)

    expect(first.sent).toEqual([listing.id])
    expect(second.skipped).toEqual([listing.id])
    expect((await outreachListings(site.id, {}, database)).listings[0]).toMatchObject({
      status: "sent",
      sendStatus: "sent",
    })
  })

  it("a global opt-out blocks the address on every site", async () => {
    const admin = await insertUser(database, { role: "admin" })
    const alpha = await insertWorkspace(database, { name: "Alpha" })
    const beta = await insertWorkspace(database, { name: "Beta" })
    const onAlpha = await contactListing(alpha.id, "Alpha Cafe", "owner@example.com")
    const onBeta = await contactListing(beta.id, "Beta Cafe", "owner@example.com")

    await recordOutreachOptOut("OWNER@example.com", database)

    expect((await sendClaimOutreach(alpha.id, admin.id, [onAlpha.id], database)).skipped)
      .toEqual([onAlpha.id])
    expect((await sendClaimOutreach(beta.id, admin.id, [onBeta.id], database)).skipped)
      .toEqual([onBeta.id])
    expect((await outreachListings(alpha.id, {}, database)).listings[0]?.status).toBe("opted_out")
    expect((await outreachListings(beta.id, {}, database)).listings[0]?.status).toBe("opted_out")
  })

  it("only a signed link can record the permanent opt-out", async () => {
    const bad = await handleOutreachOptOut(
      new Request(
        "https://site.test/api/directory-outreach-unsubscribe?email=owner%40example.com&token=wrong"
      ),
      database
    )
    expect(bad.status).toBe(400)

    const good = await handleOutreachOptOut(
      new Request(buildOutreachOptOutUrl("https://site.test", "owner@example.com")),
      database
    )
    expect(good.status).toBe(200)

    const site = await insertWorkspace(database)
    const listing = await contactListing(site.id, "Cafe", "owner@example.com")
    const admin = await insertUser(database, { role: "admin" })
    expect((await sendClaimOutreach(site.id, admin.id, [listing.id], database)).skipped)
      .toEqual([listing.id])
  })
})

/**
 * The ready list pages on the server now, and the address it filters on is
 * worked out in SQL rather than in JavaScript. These say the SQL rule still
 * matches the JavaScript one it replaced — a listing with no usable email must
 * stay out of the list, and the count beside the page controls must be the
 * whole total rather than the size of the page.
 */
describe("the ready list pages and counts on the server", () => {
  it("leaves out a listing whose email is not a real address", async () => {
    const site = await insertWorkspace(database, { name: "Alpha" })
    await contactListing(site.id, "Good", "owner@example.com")
    await contactListing(site.id, "No at sign", "not-an-address")
    await contactListing(site.id, "No dot", "owner@example")

    const { listings, total } = await outreachListings(site.id, {}, database)

    expect(listings.map((row) => row.title)).toEqual(["Good"])
    expect(total).toBe(1)
  })

  it("reads a mailto: address the same way the old code did", async () => {
    const site = await insertWorkspace(database, { name: "Alpha" })
    await contactListing(site.id, "Cafe", "MailTo:Owner@Example.com")

    const { listings } = await outreachListings(site.id, {}, database)

    expect(listings[0]?.email).toBe("owner@example.com")
  })

  it("counts the whole list, not the page it hands back", async () => {
    const site = await insertWorkspace(database, { name: "Alpha" })
    for (const name of ["A", "B", "C"]) {
      await contactListing(site.id, name, `${name.toLowerCase()}@example.com`)
    }

    const first = await outreachListings(site.id, { limit: 2 }, database)
    const second = await outreachListings(site.id, { limit: 2, offset: 2 }, database)

    expect(first.listings.map((row) => row.title)).toEqual(["A", "B"])
    expect(first.total).toBe(3)
    expect(second.listings.map((row) => row.title)).toEqual(["C"])
    expect(second.total).toBe(3)
  })

  it("still knows the total on a page past the end of the list", async () => {
    const site = await insertWorkspace(database, { name: "Alpha" })
    for (const name of ["A", "B", "C"]) {
      await contactListing(site.id, name, `${name.toLowerCase()}@example.com`)
    }

    // Somebody edited `?page=` by hand. The table is empty, but the footer has
    // to keep saying how many there really are or there is no way back.
    const past = await outreachListings(site.id, { limit: 2, offset: 20 }, database)

    expect(past.listings).toEqual([])
    expect(past.total).toBe(3)
  })

  it("searches the title and the address, and stays inside its own site", async () => {
    const alpha = await insertWorkspace(database, { name: "Alpha" })
    const beta = await insertWorkspace(database, { name: "Beta" })
    await contactListing(alpha.id, "Joe's Diner", "joe@example.com")
    await contactListing(alpha.id, "Sam's Bar", "sam@example.com")
    await contactListing(beta.id, "Joe's Other Diner", "joe@other.com")

    const byTitle = await outreachListings(alpha.id, { search: "joe" }, database)
    const byEmail = await outreachListings(alpha.id, { search: "sam@" }, database)

    // Beta's Joe is not in either answer: the search narrows the site's own
    // rows, it never reaches past the boundary.
    expect(byTitle.listings.map((row) => row.title)).toEqual(["Joe's Diner"])
    expect(byTitle.total).toBe(1)
    expect(byEmail.listings.map((row) => row.title)).toEqual(["Sam's Bar"])
  })
})
