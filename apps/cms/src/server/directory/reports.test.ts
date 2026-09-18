import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  cleanReportInput,
  closeReport,
  createReport,
  listReports,
  openReportCount,
} from "@/server/directory/reports"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { customShellWorkspaces } from "@/server/schema"
import { directoryListings } from "@/server/directory/schema"
import { eq } from "drizzle-orm"

/**
 * Reports, and the four rules the feature stands on.
 *
 * **A report belongs to its site** — one filed on alpha is invisible to beta.
 * **A report is about a page a visitor could read** — a draft is not found
 * rather than refused. **A report changes nothing** — the listing is untouched
 * either way. **Deleting the thing it is about deletes the report**, because a
 * report nobody can act on is a row nobody should have to read.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string
let admin: string
let listingId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
  admin = (await insertUser(database, { role: "admin" })).id

  const listing = await createListing(alpha, { title: "Joe's Diner" }, database)
  listingId = listing.id
  await updateListing(alpha, listingId, { status: "published" }, database)
})

afterEach(async () => {
  await client.close()
})

describe("createReport", () => {
  it("files a report against a published listing", async () => {
    const { report, listingTitle } = await createReport(
      alpha,
      { listingId, reason: "wrong_hours", note: "Shut at 4pm on Sunday." },
      database
    )

    expect(listingTitle).toBe("Joe's Diner")
    expect(report.reason).toBe("wrong_hours")
    expect(report.status).toBe("open")
    expect(report.reporterEmail).toBe("")
  })

  it("refuses a reason that is not on the list", async () => {
    await expect(
      createReport(alpha, { listingId, reason: "made_up" }, database)
    ).rejects.toThrow("Pick what is wrong")
  })

  it("insists on a note when the reason is “something else”", async () => {
    await expect(
      createReport(alpha, { listingId, reason: "other", note: "   " }, database)
    ).rejects.toThrow("Tell us in a line or two")
  })

  it("keeps an email that looks like one and refuses one that does not", async () => {
    const { report } = await createReport(
      alpha,
      { listingId, reason: "closed", reporterEmail: " Sam@Example.TEST " },
      database
    )
    expect(report.reporterEmail).toBe("sam@example.test")

    await expect(
      createReport(
        alpha,
        { listingId, reason: "closed", reporterEmail: "sam at example" },
        database
      )
    ).rejects.toThrow("does not look like an email address")
  })

  it("does not find a draft, so a draft stays indistinguishable from nothing", async () => {
    await updateListing(alpha, listingId, { status: "draft" }, database)

    await expect(
      createReport(alpha, { listingId, reason: "wrong_hours" }, database)
    ).rejects.toThrow("no longer on this site")
  })

  it("does not find another site's listing", async () => {
    await expect(
      createReport(beta, { listingId, reason: "wrong_hours" }, database)
    ).rejects.toThrow("no longer on this site")
  })

  it("leaves the listing exactly as it was", async () => {
    const before = await database
      .select()
      .from(directoryListings)
      .where(eq(directoryListings.id, listingId))

    await createReport(
      alpha,
      { listingId, reason: "closed", note: "Boarded up." },
      database
    )

    const after = await database
      .select()
      .from(directoryListings)
      .where(eq(directoryListings.id, listingId))

    expect(after).toEqual(before)
  })
})

describe("cleanReportInput", () => {
  /**
   * It has to refuse without a database, because the public endpoint runs it
   * before it counts the attempt against the rate limit. Counting first would
   * spend a visitor's one report an hour on a forgotten note.
   */
  it("refuses bad words with no database at all", () => {
    expect(() =>
      cleanReportInput({ listingId, reason: "other", note: "" })
    ).toThrow("Tell us in a line or two")
    expect(() => cleanReportInput({ listingId, reason: "nope" })).toThrow(
      "Pick what is wrong"
    )
    expect(
      cleanReportInput({ listingId, reason: "closed", note: "  Shut.  " })
    ).toEqual({ reason: "closed", note: "Shut.", email: "" })
  })
})

describe("listReports and openReportCount", () => {
  beforeEach(async () => {
    await createReport(
      alpha,
      { listingId, reason: "wrong_hours", note: "Shut at 4pm." },
      database
    )
    await createReport(
      alpha,
      { listingId, reason: "wrong_contact", note: "The phone is dead." },
      database
    )
  })

  it("only ever answers with the site's own reports", async () => {
    const mine = await listReports(alpha, {}, database)
    const theirs = await listReports(beta, {}, database)

    expect(mine.total).toBe(2)
    expect(theirs.total).toBe(0)
    expect(theirs.reports).toEqual([])
  })

  it("carries the listing's title and address, so nobody joins twice", async () => {
    const { reports } = await listReports(alpha, {}, database)
    expect(reports[0]?.listingTitle).toBe("Joe's Diner")
    expect(reports[0]?.listingSlug).toBeTruthy()
  })

  it("searches the listing's title and the note", async () => {
    const byNote = await listReports(alpha, { search: "phone" }, database)
    expect(byNote.total).toBe(1)
    expect(byNote.reports[0]?.reason).toBe("wrong_contact")

    const byTitle = await listReports(alpha, { search: "Joe" }, database)
    expect(byTitle.total).toBe(2)
  })

  it("counts only the ones still waiting, and only on this site", async () => {
    expect(await openReportCount(alpha, database)).toBe(2)
    expect(await openReportCount(beta, database)).toBe(0)

    const { reports } = await listReports(alpha, { status: "open" }, database)
    await closeReport(
      alpha,
      reports[0]!.id,
      { decision: "fixed", reviewerId: admin },
      database
    )

    expect(await openReportCount(alpha, database)).toBe(1)
  })
})

describe("closeReport", () => {
  let reportId: string

  beforeEach(async () => {
    const { report } = await createReport(
      alpha,
      { listingId, reason: "closed", note: "Boarded up." },
      database
    )
    reportId = report.id
  })

  it("marks it fixed and remembers who and when", async () => {
    const closed = await closeReport(
      alpha,
      reportId,
      { decision: "fixed", reviewerId: admin },
      database
    )

    expect(closed.status).toBe("fixed")
    expect(closed.closedAt).not.toBeNull()
  })

  it("refuses the second of two admins pressing at the same moment", async () => {
    await closeReport(
      alpha,
      reportId,
      { decision: "fixed", reviewerId: admin },
      database
    )

    await expect(
      closeReport(
        alpha,
        reportId,
        { decision: "dismissed", reviewerId: admin },
        database
      )
    ).rejects.toThrow("already dealt with")
  })

  it("does not let another site close it", async () => {
    await expect(
      closeReport(
        beta,
        reportId,
        { decision: "fixed", reviewerId: admin },
        database
      )
    ).rejects.toThrow("already dealt with")

    expect(await openReportCount(alpha, database)).toBe(1)
  })
})

describe("what deleting takes with it", () => {
  it("deleting a listing deletes its reports", async () => {
    await createReport(alpha, { listingId, reason: "closed" }, database)
    await database
      .delete(directoryListings)
      .where(eq(directoryListings.id, listingId))

    expect(await openReportCount(alpha, database)).toBe(0)
  })

  it("deleting a site deletes all of its reports", async () => {
    await createReport(alpha, { listingId, reason: "closed" }, database)
    await database
      .delete(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, alpha))

    expect(await openReportCount(alpha, database)).toBe(0)
  })
})
