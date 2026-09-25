import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  claimedListingIds,
  claimStateFor,
  createClaim,
  emailMatchesWebsite,
  listClaims,
  listEditRequests,
  listingsOwnedBy,
  pendingEditRequestCount,
  requestOwnerEdit,
  reviewClaim,
  reviewEditRequest,
  verifyClaim,
} from "@/server/directory/claims"
import {
  createListing,
  findListing,
  updateListing,
} from "@/server/directory/listings"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Claims, and the three rules the feature stands on.
 *
 * **One approved claim per listing** — kept by the database, not by a check
 * somebody has to remember. **An owner never edits the public page** — their
 * changes wait for an admin. **A claim belongs to its site** — an id from
 * another site is not found rather than refused.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string
let admin: string
let joe: string
let sam: string
let listingId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
  admin = (await insertUser(database, { role: "admin" })).id
  joe = (await insertUser(database, { email: "joe@joesdiner.test" })).id
  sam = (await insertUser(database, { email: "sam@example.test" })).id

  const listing = await createListing(alpha, { title: "Joe's Diner" }, database)
  listingId = listing.id
  await updateListing(
    alpha,
    listingId,
    {
      status: "published",
      contactLinks: {
        address: "1 High Street",
        menuLinks: [
          { id: "m1", type: "website", label: "", value: "joesdiner.test" },
        ],
        socialLinks: [],
      },
    },
    database
  )
})

afterEach(async () => {
  await client.close()
})

function claim(userId: string, over: Record<string, unknown> = {}) {
  return createClaim(
    alpha,
    listingId,
    userId,
    {
      contactEmail: "joe@joesdiner.test",
      claimantName: "Joe",
      roleTitle: "Owner",
      ...over,
    },
    database
  )
}

describe("whether the address is at the listing's own domain", () => {
  it("matches the domain, ignoring www and a path", () => {
    expect(
      emailMatchesWebsite("joe@joesdiner.test", "https://www.joesdiner.test/menu")
    ).toBe(true)
  })

  it("is simply false for a free address or a listing with no website", () => {
    expect(emailMatchesWebsite("joe@gmail.test", "joesdiner.test")).toBe(false)
    expect(emailMatchesWebsite("joe@joesdiner.test", "")).toBe(false)
  })

  it("is recorded on the claim so an admin reads an answer", async () => {
    const matched = await claim(joe)
    expect(matched.claim.emailDomainMatches).toBe(true)

    const other = await createClaim(
      alpha,
      listingId,
      sam,
      { contactEmail: "sam@gmail.test", claimantName: "Sam" },
      database
    )
    // A mismatch is a flag, never a refusal — the claim is made either way.
    expect(other.claim.emailDomainMatches).toBe(false)
  })
})

describe("a claim is invisible until the address is confirmed", () => {
  it("stays out of the queue until the link is clicked", async () => {
    const { token } = await claim(joe)
    expect((await listClaims(alpha, {}, database)).claims).toHaveLength(0)

    expect(await verifyClaim(token, database)).toMatchObject({
      outcome: "verified",
      listingId,
    })
    expect((await listClaims(alpha, {}, database)).claims).toHaveLength(1)
  })

  it("refuses to be reviewed while it is unconfirmed", async () => {
    const made = await claim(joe)
    await expect(
      reviewClaim(
        alpha,
        made.claim.id,
        { decision: "approve", reviewerId: admin },
        database
      )
    ).rejects.toThrow(/confirm their email/i)
  })
})

describe("one approved claim per listing", () => {
  it("refuses a second person once somebody has been approved", async () => {
    const first = await claim(joe)
    await verifyClaim(first.token, database)
    await reviewClaim(
      alpha,
      first.claim.id,
      { decision: "approve", reviewerId: admin },
      database
    )

    await expect(
      createClaim(
        alpha,
        listingId,
        sam,
        { contactEmail: "sam@example.test", claimantName: "Sam" },
        database
      )
    ).rejects.toThrow(/already looks after/i)
  })

  it("is kept by the database, not only by the check before the write", async () => {
    // **Both claims are made and confirmed before either is approved**, which
    // is the real-world case: two people ask on the same day and an admin works
    // through the queue. The check inside `createClaim` sees no approved claim
    // for either of them, so the unique index is the only thing standing
    // between this and two people both being told they own the page.
    const first = await claim(joe)
    const second = await createClaim(
      alpha,
      listingId,
      sam,
      { contactEmail: "sam@example.test", claimantName: "Sam" },
      database
    )
    await verifyClaim(first.token, database)
    await verifyClaim(second.token, database)

    await reviewClaim(
      alpha,
      first.claim.id,
      { decision: "approve", reviewerId: admin },
      database
    )
    await expect(
      reviewClaim(
        alpha,
        second.claim.id,
        { decision: "approve", reviewerId: admin },
        database
      )
    ).rejects.toThrow(/already been given/i)

    const approved = await listClaims(alpha, { status: "approved" }, database)
    expect(approved.claims).toHaveLength(1)
    expect(approved.claims[0]?.claimantName).toBe("Joe")
  })

  it("stops the same person asking twice while they are waiting", async () => {
    await claim(joe)
    await expect(claim(joe)).rejects.toThrow(/already asked/i)
  })

  it("will not let a draft listing be claimed", async () => {
    const draft = await createListing(alpha, { title: "Not live" }, database)
    await expect(
      createClaim(
        alpha,
        draft.id,
        joe,
        { contactEmail: "joe@joesdiner.test", claimantName: "Joe" },
        database
      )
    ).rejects.toThrow(/no longer exists/i)
  })
})

describe("what the public page is told", () => {
  it("says nothing until a claim is approved", async () => {
    const made = await claim(joe)
    expect(await claimStateFor(alpha, listingId, null, database)).toEqual({
      claimed: false,
      mine: null,
    })

    await verifyClaim(made.token, database)
    await reviewClaim(
      alpha,
      made.claim.id,
      { decision: "approve", reviewerId: admin },
      database
    )

    expect(await claimStateFor(alpha, listingId, null, database)).toEqual({
      claimed: true,
      mine: null,
    })
    expect(await claimStateFor(alpha, listingId, joe, database)).toEqual({
      claimed: true,
      mine: "approved",
    })
    expect(
      [...(await claimedListingIds(alpha, [listingId], database))]
    ).toEqual([listingId])
  })

  it("shows no tick for a rejected claim", async () => {
    const made = await claim(joe)
    await verifyClaim(made.token, database)
    await reviewClaim(
      alpha,
      made.claim.id,
      { decision: "reject", reviewerId: admin },
      database
    )

    expect(
      (await claimStateFor(alpha, listingId, null, database)).claimed
    ).toBe(false)
    expect((await claimedListingIds(alpha, [listingId], database)).size).toBe(0)
  })
})

describe("changes an owner asks for", () => {
  async function ownItAll() {
    const made = await claim(joe)
    await verifyClaim(made.token, database)
    await reviewClaim(
      alpha,
      made.claim.id,
      { decision: "approve", reviewerId: admin },
      database
    )
    return made.claim.id
  }

  it("never touch the public page until an admin applies them", async () => {
    const claimId = await ownItAll()
    await requestOwnerEdit(joe, claimId, { title: "Joe's Cafe" }, database)

    expect((await findListing(alpha, listingId, database))?.title).toBe(
      "Joe's Diner"
    )
    expect(await pendingEditRequestCount(alpha, database)).toBe(1)

    const [waiting] = await listEditRequests(alpha, { status: "pending" }, database)
    await reviewEditRequest(
      alpha,
      waiting?.id ?? "",
      { decision: "approve", reviewerId: admin },
      database
    )

    expect((await findListing(alpha, listingId, database))?.title).toBe(
      "Joe's Cafe"
    )
  })

  it("leave the page alone when the admin says no", async () => {
    const claimId = await ownItAll()
    await requestOwnerEdit(joe, claimId, { title: "Something else" }, database)
    const [waiting] = await listEditRequests(alpha, { status: "pending" }, database)

    await reviewEditRequest(
      alpha,
      waiting?.id ?? "",
      { decision: "reject", note: "Not that name.", reviewerId: admin },
      database
    )

    expect((await findListing(alpha, listingId, database))?.title).toBe(
      "Joe's Diner"
    )
    expect(await pendingEditRequestCount(alpha, database)).toBe(0)
  })

  it("replace the one already waiting rather than stacking up", async () => {
    const claimId = await ownItAll()
    await requestOwnerEdit(joe, claimId, { title: "First go" }, database)
    await requestOwnerEdit(joe, claimId, { title: "Second go" }, database)

    const waiting = await listEditRequests(alpha, { status: "pending" }, database)
    expect(waiting).toHaveLength(1)
    expect(waiting[0]?.changes.title).toBe("Second go")
  })

  it("cannot be made by somebody who does not own the listing", async () => {
    const claimId = await ownItAll()
    await expect(
      requestOwnerEdit(sam, claimId, { title: "Mine now" }, database)
    ).rejects.toThrow(/do not look after/i)
  })

  it("cannot be applied twice", async () => {
    const claimId = await ownItAll()
    await requestOwnerEdit(joe, claimId, { title: "Joe's Cafe" }, database)
    const [waiting] = await listEditRequests(alpha, { status: "pending" }, database)

    await reviewEditRequest(
      alpha,
      waiting?.id ?? "",
      { decision: "approve", reviewerId: admin },
      database
    )
    await expect(
      reviewEditRequest(
        alpha,
        waiting?.id ?? "",
        { decision: "approve", reviewerId: admin },
        database
      )
    ).rejects.toThrow(/already dealt with/i)
  })
})

describe("claims stay on their own site", () => {
  it("never show in another site's queue, and cannot be reviewed from one", async () => {
    const made = await claim(joe)
    await verifyClaim(made.token, database)

    expect((await listClaims(beta, {}, database)).claims).toHaveLength(0)
    await expect(
      reviewClaim(
        beta,
        made.claim.id,
        { decision: "approve", reviewerId: admin },
        database
      )
    ).rejects.toThrow(/no longer exists/i)
  })

  it("name the site on each listing somebody owns, because it may be either", async () => {
    const made = await claim(joe)
    await verifyClaim(made.token, database)
    await reviewClaim(
      alpha,
      made.claim.id,
      { decision: "approve", reviewerId: admin },
      database
    )

    const owned = await listingsOwnedBy(joe, database)
    expect(owned).toHaveLength(1)
    expect(owned[0]?.siteName).toBe("Alpha")
    expect(await listingsOwnedBy(sam, database)).toHaveLength(0)
  })
})

/**
 * The claims screen has a search box now. As with the submissions queue, the
 * point of these is that the search narrows what is already inside the site
 * boundary rather than replacing it.
 */
describe("searching the claims", () => {
  it("matches the listing title, the claimant's name and their email", async () => {
    // Confirmed first: an unverified claim is invisible to the queue, so a
    // search over unverified ones would find nothing and prove nothing.
    await verifyClaim(
      (await claim(joe, { claimantName: "Joe Bloggs", contactEmail: "joe@joesdiner.test" })).token,
      database
    )
    await verifyClaim(
      (await claim(sam, { claimantName: "Sam Smith", contactEmail: "sam@example.test" })).token,
      database
    )

    const byName = await listClaims(alpha, { search: "bloggs" }, database)
    const byEmail = await listClaims(alpha, { search: "sam@example" }, database)
    const byListing = await listClaims(alpha, { search: "joe's diner" }, database)

    expect(byName.claims.map((row) => row.claimantName)).toEqual(["Joe Bloggs"])
    expect(byName.total).toBe(1)
    expect(byEmail.claims.map((row) => row.claimantName)).toEqual(["Sam Smith"])
    // Both claims are on the same listing, so a title search finds both.
    expect(byListing.total).toBe(2)
  })

  it("cannot reach another site's claims", async () => {
    await verifyClaim(
      (await claim(joe, { claimantName: "Joe Bloggs" })).token,
      database
    )

    const found = await listClaims(beta, { search: "bloggs" }, database)

    expect(found.claims).toEqual([])
    expect(found.total).toBe(0)
  })
})
