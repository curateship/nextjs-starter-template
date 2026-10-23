import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  findListing,
  listListings,
  updateListing,
} from "@/server/directory/listings"
import { directoryClaims } from "@/server/directory/schema"
import {
  createSubmission,
  listSubmissions,
  pendingSubmissionCount,
  possibleDuplicatesFor,
  resendSubmissionVerification,
  reviewSubmission,
  submissionDecisionEmail,
  verifySubmission,
} from "@/server/directory/submissions"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Submissions, and the two rules that make them safe to have on a public site.
 *
 * **Nothing an admin sees until the address is confirmed**, so a queue cannot be
 * papered with addresses nobody owns — and **approving twice cannot make two
 * listings**, which is the one mistake a review screen invites by having a
 * button somebody can press again while the first press is in flight.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string
let admin: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
  admin = (await insertUser(database, { role: "admin" })).id
})

afterEach(async () => {
  await client.close()
})

function send(site: string, over: Record<string, unknown> = {}) {
  return createSubmission(
    site,
    {
      businessName: "Joe's Diner",
      contactEmail: "joe@joesdiner.test",
      address: "1 High Street",
      phone: "555 0100",
      website: "joesdiner.test",
      description: "Breakfast all day.\n\nOpen since 1994.",
      ...over,
    },
    database
  )
}

describe("a submission is invisible until the address is confirmed", () => {
  it("keeps an unconfirmed submission out of the queue and out of the count", async () => {
    await send(alpha)

    const queue = await listSubmissions(alpha, {}, database)
    expect(queue.submissions).toHaveLength(0)
    expect(await pendingSubmissionCount(alpha, database)).toBe(0)
  })

  it("puts it in the queue once the link is clicked", async () => {
    const { token } = await send(alpha)

    const outcome = await verifySubmission(token, database)
    expect(outcome).toMatchObject({ outcome: "verified", workspaceId: alpha })

    const queue = await listSubmissions(alpha, {}, database)
    expect(queue.submissions).toHaveLength(1)
    expect(queue.submissions[0]?.status).toBe("pending_review")
    expect(await pendingSubmissionCount(alpha, database)).toBe(1)
  })

  it("refuses the same link a second time", async () => {
    const { token } = await send(alpha)
    await verifySubmission(token, database)

    expect(await verifySubmission(token, database)).toEqual({
      outcome: "unknown",
    })
  })

  it("tells an expired link apart from one it has never seen", async () => {
    const { submission, token } = await send(alpha)
    await database.execute(
      `UPDATE directory_submissions SET verify_expires_at = now() - interval '1 day' WHERE id = '${submission.id}'`
    )

    expect(await verifySubmission(token, database)).toEqual({
      outcome: "expired",
    })
    expect(await verifySubmission("not-a-real-token", database)).toEqual({
      outcome: "unknown",
    })
  })

  it("hands out a fresh link without making a second submission", async () => {
    await send(alpha)
    const again = await resendSubmissionVerification(
      alpha,
      "joe@joesdiner.test",
      database
    )

    expect(again).not.toBeNull()
    await verifySubmission(again?.token ?? "", database)

    const queue = await listSubmissions(alpha, {}, database)
    expect(queue.submissions).toHaveLength(1)
  })
})

describe("approving", () => {
  it("creates one published listing carrying the categories that were picked", async () => {
    const food = await createCategory(alpha, { name: "Food" }, database)
    const { token } = await send(alpha, { categoryIds: [food.id] })
    await verifySubmission(token, database)

    const queued = await listSubmissions(alpha, {}, database)
    const { listingId } = await reviewSubmission(
      alpha,
      queued.submissions[0]?.id ?? "",
      { decision: "approve", reviewerId: admin },
      database
    )

    const listing = await findListing(alpha, listingId ?? "", database)
    expect(listing?.title).toBe("Joe's Diner")
    expect(listing?.status).toBe("published")
    // The description becomes the body, one paragraph per blank line, and the
    // email becomes a contact link — a listing arriving with nothing on it
    // would be an approval that lost the submission.
    expect(listing?.body.content).toHaveLength(2)
    expect(
      listing?.contactLinks.menuLinks.some((link) => link.type === "email")
    ).toBe(true)

    const rows = await listListings(alpha, {}, database)
    expect(rows.listings).toHaveLength(1)
    expect(rows.listings[0]?.categories).toEqual(["Food"])
  })

  it("cannot make two listings from one submission", async () => {
    const { token } = await send(alpha)
    await verifySubmission(token, database)
    const queued = await listSubmissions(alpha, {}, database)
    const id = queued.submissions[0]?.id ?? ""

    await reviewSubmission(
      alpha,
      id,
      { decision: "approve", reviewerId: admin },
      database
    )
    await expect(
      reviewSubmission(
        alpha,
        id,
        { decision: "approve", reviewerId: admin },
        database
      )
    ).rejects.toThrow(/already dealt with/i)

    expect((await listListings(alpha, {}, database)).listings).toHaveLength(1)
  })

  it("refuses to review one whose address is still unconfirmed", async () => {
    const { submission } = await send(alpha)

    await expect(
      reviewSubmission(
        alpha,
        submission.id,
        { decision: "approve", reviewerId: admin },
        database
      )
    ).rejects.toThrow(/confirm their email/i)
  })

  it("rejecting creates nothing and keeps the reason", async () => {
    const { token } = await send(alpha)
    await verifySubmission(token, database)
    const queued = await listSubmissions(alpha, {}, database)

    const { listingId } = await reviewSubmission(
      alpha,
      queued.submissions[0]?.id ?? "",
      { decision: "reject", note: "Already listed.", reviewerId: admin },
      database
    )

    expect(listingId).toBeNull()
    expect((await listListings(alpha, {}, database)).listings).toHaveLength(0)
    const after = await listSubmissions(alpha, { status: "rejected" }, database)
    expect(after.submissions[0]?.reviewNote).toBe("Already listed.")
  })
})

describe("a submission belongs to the site it was made on", () => {
  it("never appears in another site's queue, and cannot be reviewed from one", async () => {
    const { token } = await send(alpha)
    await verifySubmission(token, database)
    const queued = await listSubmissions(alpha, {}, database)
    const id = queued.submissions[0]?.id ?? ""

    expect((await listSubmissions(beta, {}, database)).submissions).toHaveLength(0)
    await expect(
      reviewSubmission(
        beta,
        id,
        { decision: "approve", reviewerId: admin },
        database
      )
    ).rejects.toThrow(/no longer exists/i)
  })

  it("drops a category belonging to another site rather than filing under it", async () => {
    const betaOnly = await createCategory(beta, { name: "Beta only" }, database)
    const { submission } = await send(alpha, { categoryIds: [betaOnly.id] })

    expect(submission.categoryIds).toEqual([])
  })
})

/**
 * The queue has a search box now. These are here because a search is a filter
 * that runs *inside* the site boundary — write it as `where name ilike ...` in
 * place of the site filter rather than beside it and one site's admin is
 * searching every other site's queue, which is the one thing multisite cannot
 * allow.
 */
describe("searching the queue", () => {
  it("matches the business name and the contact email", async () => {
    const first = await send(alpha, { businessName: "Joe's Diner" })
    const second = await send(alpha, {
      businessName: "Sam's Bar",
      contactEmail: "sam@sams.test",
    })
    await verifySubmission(first.token, database)
    await verifySubmission(second.token, database)

    const byName = await listSubmissions(alpha, { search: "diner" }, database)
    const byEmail = await listSubmissions(alpha, { search: "sam@" }, database)

    expect(byName.submissions.map((row) => row.businessName)).toEqual([
      "Joe's Diner",
    ])
    expect(byName.total).toBe(1)
    expect(byEmail.submissions.map((row) => row.businessName)).toEqual([
      "Sam's Bar",
    ])
  })

  it("cannot reach another site's submissions", async () => {
    const theirs = await send(beta, { businessName: "Beta Diner" })
    await verifySubmission(theirs.token, database)

    const found = await listSubmissions(alpha, { search: "diner" }, database)

    expect(found.submissions).toEqual([])
    expect(found.total).toBe(0)
  })
})

/**
 * The duplicate warning. An admin approving a business that is already listed
 * makes two pages for one place, and nothing used to compare the two.
 */
describe("warning when a submission looks like an existing listing", () => {
  async function listed(
    site: string,
    title: string,
    links: { phone?: string; website?: string } = {},
    status: "published" | "draft" = "published"
  ) {
    const listing = await createListing(site, { title }, database)
    await updateListing(
      site,
      listing.id,
      {
        status,
        contactLinks: {
          address: "",
          menuLinks: [
            ...(links.phone
              ? [{ id: "p", type: "phone", label: "", value: links.phone }]
              : []),
            ...(links.website
              ? [{ id: "w", type: "website", label: "", value: links.website }]
              : []),
          ],
          socialLinks: [],
        },
      },
      database
    )
    return listing
  }

  function submitted(over: Partial<Record<"businessName" | "phone" | "website", string>>) {
    return {
      id: "s1",
      businessName: "Somewhere New",
      phone: "",
      website: "",
      ...over,
    }
  }

  it("matches the same phone digits however they were typed", async () => {
    const listing = await listed(alpha, "Luigi's", { phone: "(416) 555-0100" })

    const found = await possibleDuplicatesFor(
      alpha,
      [submitted({ phone: "+1 416 555 0100" })],
      database
    )

    expect(found.get("s1")).toEqual([
      expect.objectContaining({ listingId: listing.id, matched: ["phone"] }),
    ])
  })

  it("matches the same website host", async () => {
    const listing = await listed(alpha, "Luigi's", {
      website: "https://www.luigis.test/menu",
    })

    const found = await possibleDuplicatesFor(
      alpha,
      [submitted({ website: "luigis.test" })],
      database
    )

    expect(found.get("s1")?.[0]).toMatchObject({
      listingId: listing.id,
      matched: ["website"],
    })
  })

  it("does not take a longer host for the same one", async () => {
    await listed(alpha, "Luigi's", { website: "notluigis.test" })

    const found = await possibleDuplicatesFor(
      alpha,
      [submitted({ website: "luigis.test" })],
      database
    )

    expect(found.has("s1")).toBe(false)
  })

  it("matches a very close name, read the same way by the database", async () => {
    const listing = await listed(alpha, "The Luigi's Pizza & Pasta")

    const found = await possibleDuplicatesFor(
      alpha,
      [
        { ...submitted({ businessName: "Luigis Pizza and Pasta" }), id: "same" },
        { ...submitted({ businessName: "Luigi's Pizza" }), id: "inside" },
      ],
      database
    )

    expect(found.get("same")?.[0]).toMatchObject({
      listingId: listing.id,
      matched: ["name"],
    })
    expect(found.get("inside")?.[0]?.listingId).toBe(listing.id)
  })

  it("names every way one listing matched, strongest first", async () => {
    await listed(alpha, "Luigi's Pizza", {
      phone: "416 555 0100",
      website: "luigis.test",
    })

    const found = await possibleDuplicatesFor(
      alpha,
      [
        submitted({
          businessName: "Luigi's Pizza",
          phone: "4165550100",
          website: "http://luigis.test",
        }),
      ],
      database
    )

    expect(found.get("s1")?.[0]?.matched).toEqual(["phone", "website", "name"])
  })

  it("counts a draft, because it is still the same business", async () => {
    await listed(alpha, "Luigi's Pizza", {}, "draft")

    const found = await possibleDuplicatesFor(
      alpha,
      [submitted({ businessName: "Luigi's Pizza" })],
      database
    )

    expect(found.get("s1")?.[0]?.status).toBe("draft")
  })

  it("says nothing when nothing matches", async () => {
    await listed(alpha, "Sam's Bar", { phone: "416 555 0199" })

    const found = await possibleDuplicatesFor(
      alpha,
      [submitted({ businessName: "Luigi's Pizza", phone: "416 555 0100" })],
      database
    )

    expect(found.size).toBe(0)
  })

  it("never matches a listing on another site", async () => {
    await listed(beta, "Luigi's Pizza", {
      phone: "416 555 0100",
      website: "luigis.test",
    })

    const found = await possibleDuplicatesFor(
      alpha,
      [
        submitted({
          businessName: "Luigi's Pizza",
          phone: "416 555 0100",
          website: "luigis.test",
        }),
      ],
      database
    )

    expect(found.size).toBe(0)
  })
})

describe("rejecting because the business is already listed", () => {
  async function waiting() {
    const { token } = await send(alpha)
    await verifySubmission(token, database)
    const queued = await listSubmissions(alpha, {}, database)
    return queued.submissions[0]?.id ?? ""
  }

  async function publishedListing(site: string, title: string) {
    const listing = await createListing(site, { title }, database)
    await updateListing(site, listing.id, { status: "published" }, database)
    return listing
  }

  it("emails the listing's claim link and keeps what was said", async () => {
    const listing = await publishedListing(alpha, "Joe's Diner")
    const id = await waiting()

    const { submission, pointTo } = await reviewSubmission(
      alpha,
      id,
      {
        decision: "reject",
        note: "Thanks for thinking of us.",
        reviewerId: admin,
        alreadyListedId: listing.id,
      },
      database
    )
    const email = submissionDecisionEmail(submission, "reject", pointTo)

    expect(email.action?.url).toMatch(
      new RegExp(`/directory/${listing.slug}\\?claim=start$`)
    )
    expect(email.action?.label).toBe("Claim Joe's Diner")
    expect(email.lines.join(" ")).toContain("already listed")
    expect(submission.reviewNote).toContain("Joe's Diner")
    expect(submission.reviewNote).toContain("Thanks for thinking of us.")
  })

  it("sends the page, not the claim form, when somebody already owns it", async () => {
    const listing = await publishedListing(alpha, "Joe's Diner")
    const owner = await insertUser(database, {})
    await database.insert(directoryClaims).values({
      id: "claim-1",
      workspaceId: alpha,
      listingId: listing.id,
      userId: owner.id,
      contactEmail: "owner@joes.test",
      claimantName: "Joe",
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const id = await waiting()

    const { pointTo } = await reviewSubmission(
      alpha,
      id,
      { decision: "reject", reviewerId: admin, alreadyListedId: listing.id },
      database
    )

    expect(pointTo?.url).toMatch(new RegExp(`/directory/${listing.slug}$`))
  })

  it("refuses a draft, which has no page to send anybody to", async () => {
    const draft = await createListing(alpha, { title: "Joe's Diner" }, database)
    const id = await waiting()

    await expect(
      reviewSubmission(
        alpha,
        id,
        { decision: "reject", reviewerId: admin, alreadyListedId: draft.id },
        database
      )
    ).rejects.toThrow(/draft/i)
  })

  it("refuses a listing on another site", async () => {
    const theirs = await publishedListing(beta, "Joe's Diner")
    const id = await waiting()

    await expect(
      reviewSubmission(
        alpha,
        id,
        { decision: "reject", reviewerId: admin, alreadyListedId: theirs.id },
        database
      )
    ).rejects.toThrow(/no longer exists/i)
  })
})
