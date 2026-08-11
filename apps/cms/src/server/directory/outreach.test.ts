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
    expect((await outreachListings(site.id, database))[0]).toMatchObject({
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
    expect((await outreachListings(alpha.id, database))[0]?.status).toBe("opted_out")
    expect((await outreachListings(beta.id, database))[0]?.status).toBe("opted_out")
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
