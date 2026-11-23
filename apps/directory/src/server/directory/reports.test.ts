import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  cleanReportInput,
  closeReport,
  countReportAttempt,
  createReport,
  listReports,
  openReportCount,
} from "@/server/directory/reports"
import { createEvent, updateEvent } from "@/server/events/events"
import { siteEvents } from "@/server/events/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { customShellWorkspaces } from "@/server/schema"
import {
  directoryListingReports,
  directoryListings,
} from "@/server/directory/schema"
import { eq } from "drizzle-orm"

/**
 * Reports on listings and events, and the four rules the feature stands on.
 *
 * **A report belongs to its site** — one filed on alpha is invisible to beta.
 * **A report is about a page a visitor could read** — a draft is not found
 * rather than refused. **A report changes nothing** — the page is untouched
 * either way. **Deleting the thing it is about deletes the report**, because a
 * report nobody can act on is a row nobody should have to read.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string
let admin: string
let listingId: string
let eventId: string

/** A published event on alpha, public unless asked otherwise. */
async function publishedEvent(
  title: string,
  visibility: "public" | "private" = "public"
) {
  const created = await createEvent(
    alpha,
    { title, when: { startDate: "2026-10-03", startTime: "18:00" } },
    database
  )
  await updateEvent(
    alpha,
    created.id,
    { status: "published", visibility },
    database
  )
  return created.id
}

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
  eventId = await publishedEvent("Harvest market")
})

afterEach(async () => {
  await client.close()
})

describe("createReport", () => {
  it("files a report against a published listing", async () => {
    const { report, subjectTitle } = await createReport(
      alpha,
      {
        kind: "listing",
        subjectId: listingId,
        reason: "wrong_hours",
        note: "Shut at 4pm on Sunday.",
      },
      database
    )

    expect(subjectTitle).toBe("Joe's Diner")
    expect(report.reason).toBe("wrong_hours")
    expect(report.status).toBe("open")
    expect(report.reporterEmail).toBe("")
  })

  it("refuses a reason that is not on the list", async () => {
    await expect(
      createReport(
        alpha,
        { kind: "listing", subjectId: listingId, reason: "made_up" },
        database
      )
    ).rejects.toThrow("Pick what is wrong")
  })

  it("insists on a note when the reason is “something else”", async () => {
    await expect(
      createReport(
        alpha,
        { kind: "listing", subjectId: listingId, reason: "other", note: "   " },
        database
      )
    ).rejects.toThrow("Tell us in a line or two")
  })

  it("keeps an email that looks like one and refuses one that does not", async () => {
    const { report } = await createReport(
      alpha,
      {
        kind: "listing",
        subjectId: listingId,
        reason: "closed",
        reporterEmail: " Sam@Example.TEST ",
      },
      database
    )
    expect(report.reporterEmail).toBe("sam@example.test")

    await expect(
      createReport(
        alpha,
        {
          kind: "listing",
          subjectId: listingId,
          reason: "closed",
          reporterEmail: "sam at example",
        },
        database
      )
    ).rejects.toThrow("does not look like an email address")
  })

  it("does not find a draft, so a draft stays indistinguishable from nothing", async () => {
    await updateListing(alpha, listingId, { status: "draft" }, database)

    await expect(
      createReport(
        alpha,
        { kind: "listing", subjectId: listingId, reason: "wrong_hours" },
        database
      )
    ).rejects.toThrow("no longer on this site")
  })

  it("does not find another site's listing", async () => {
    await expect(
      createReport(
        beta,
        { kind: "listing", subjectId: listingId, reason: "wrong_hours" },
        database
      )
    ).rejects.toThrow("no longer on this site")
  })

  it("leaves the listing exactly as it was", async () => {
    const before = await database
      .select()
      .from(directoryListings)
      .where(eq(directoryListings.id, listingId))

    await createReport(
      alpha,
      {
        kind: "listing",
        subjectId: listingId,
        reason: "closed",
        note: "Boarded up.",
      },
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
      cleanReportInput({
        kind: "listing",
        subjectId: listingId,
        reason: "other",
        note: "",
      })
    ).toThrow("Tell us in a line or two")
    expect(() =>
      cleanReportInput({
        kind: "listing",
        subjectId: listingId,
        reason: "nope",
      })
    ).toThrow("Pick what is wrong")
    expect(
      cleanReportInput({
        kind: "listing",
        subjectId: listingId,
        reason: "closed",
        note: "  Shut.  ",
      })
    ).toEqual({ reason: "closed", note: "Shut.", email: "" })
  })
})

describe("listReports and openReportCount", () => {
  beforeEach(async () => {
    await createReport(
      alpha,
      {
        kind: "listing",
        subjectId: listingId,
        reason: "wrong_hours",
        note: "Shut at 4pm.",
      },
      database
    )
    await createReport(
      alpha,
      {
        kind: "listing",
        subjectId: listingId,
        reason: "wrong_contact",
        note: "The phone is dead.",
      },
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
    expect(reports[0]?.kind).toBe("listing")
    expect(reports[0]?.subjectTitle).toBe("Joe's Diner")
    expect(reports[0]?.subjectSlug).toBeTruthy()
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
      {
        kind: "listing",
        subjectId: listingId,
        reason: "closed",
        note: "Boarded up.",
      },
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
    await createReport(
      alpha,
      { kind: "listing", subjectId: listingId, reason: "closed" },
      database
    )
    await database
      .delete(directoryListings)
      .where(eq(directoryListings.id, listingId))

    expect(await openReportCount(alpha, database)).toBe(0)
  })

  it("deleting a site deletes all of its reports", async () => {
    await createReport(
      alpha,
      { kind: "listing", subjectId: listingId, reason: "closed" },
      database
    )
    await database
      .delete(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, alpha))

    expect(await openReportCount(alpha, database)).toBe(0)
  })
})

describe("reports about events", () => {
  it("files a report against a published event", async () => {
    const { report, subjectTitle } = await createReport(
      alpha,
      {
        kind: "event",
        subjectId: eventId,
        reason: "cancelled",
        note: "Nobody there.",
      },
      database
    )

    expect(subjectTitle).toBe("Harvest market")
    expect(report.kind).toBe("event")
    expect(report.subjectId).toBe(eventId)
    expect(report.reason).toBe("cancelled")
  })

  it("keeps each kind to its own reasons", async () => {
    await expect(
      createReport(
        alpha,
        { kind: "event", subjectId: eventId, reason: "wrong_hours" },
        database
      )
    ).rejects.toThrow("Pick what is wrong with this event")
    await expect(
      createReport(
        alpha,
        { kind: "listing", subjectId: listingId, reason: "cancelled" },
        database
      )
    ).rejects.toThrow("Pick what is wrong with this listing")
  })

  it("is refused by the database when the reason is the other kind's", async () => {
    await expect(
      database.insert(directoryListingReports).values({
        id: "wrong-kind",
        workspaceId: alpha,
        eventId,
        reason: "closed",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("reason_check") },
    })
  })

  it("is refused by the database when it names both a listing and an event", async () => {
    await expect(
      database.insert(directoryListingReports).values({
        id: "both-kinds",
        workspaceId: alpha,
        listingId,
        eventId,
        reason: "other",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("subject_check") },
    })
  })

  it("finds a private event, because anybody with its link can open it", async () => {
    const hidden = await publishedEvent("Members supper", "private")
    const { report } = await createReport(
      alpha,
      { kind: "event", subjectId: hidden, reason: "wrong_place" },
      database
    )
    expect(report.subjectId).toBe(hidden)
  })

  it("does not find a draft event or another site's event", async () => {
    await updateEvent(alpha, eventId, { status: "draft" }, database)
    await expect(
      createReport(
        alpha,
        { kind: "event", subjectId: eventId, reason: "cancelled" },
        database
      )
    ).rejects.toThrow("That event is no longer on this site")

    await updateEvent(alpha, eventId, { status: "published" }, database)
    await expect(
      createReport(
        beta,
        { kind: "event", subjectId: eventId, reason: "cancelled" },
        database
      )
    ).rejects.toThrow("That event is no longer on this site")
  })

  it("leaves the event exactly as it was", async () => {
    const read = () =>
      database.select().from(siteEvents).where(eq(siteEvents.id, eventId))
    const before = await read()

    await createReport(
      alpha,
      { kind: "event", subjectId: eventId, reason: "wrong_time", note: "Sat." },
      database
    )

    expect(await read()).toEqual(before)
  })

  it("shares the queue with listings and can be narrowed to either", async () => {
    await createReport(
      alpha,
      { kind: "listing", subjectId: listingId, reason: "closed" },
      database
    )
    await createReport(
      alpha,
      { kind: "event", subjectId: eventId, reason: "cancelled" },
      database
    )

    const both = await listReports(alpha, {}, database)
    expect(both.total).toBe(2)

    const events = await listReports(alpha, { kind: "event" }, database)
    expect(events.total).toBe(1)
    expect(events.reports[0]).toMatchObject({
      kind: "event",
      subjectTitle: "Harvest market",
    })
    expect(events.reports[0]?.subjectSlug).toBeTruthy()

    const listings = await listReports(alpha, { kind: "listing" }, database)
    expect(listings.total).toBe(1)
    expect(listings.reports[0]?.subjectTitle).toBe("Joe's Diner")

    const byTitle = await listReports(alpha, { search: "harvest" }, database)
    expect(byTitle.total).toBe(1)
    expect(byTitle.reports[0]?.kind).toBe("event")
  })

  it("deleting an event deletes its reports", async () => {
    await createReport(
      alpha,
      { kind: "event", subjectId: eventId, reason: "cancelled" },
      database
    )
    await database.delete(siteEvents).where(eq(siteEvents.id, eventId))

    expect(await openReportCount(alpha, database)).toBe(0)
  })
})

describe("countReportAttempt", () => {
  const listing = (id: string) => ({ kind: "listing" as const, subjectId: id })
  const event = (id: string) => ({ kind: "event" as const, subjectId: id })

  it("takes one report per listing and one per event an hour from a visitor", async () => {
    await countReportAttempt(alpha, "1.1.1.1", listing(listingId), database)
    await expect(
      countReportAttempt(alpha, "1.1.1.1", listing(listingId), database)
    ).rejects.toThrow("already sent a report about this listing")

    // The listing's report does not use up the event's.
    await countReportAttempt(alpha, "1.1.1.1", event(eventId), database)
    await expect(
      countReportAttempt(alpha, "1.1.1.1", event(eventId), database)
    ).rejects.toThrow("already sent a report about this event")

    // Somebody else can still report both.
    await countReportAttempt(alpha, "2.2.2.2", event(eventId), database)
  })

  it("gives a visitor ten an hour across listings and events together", async () => {
    for (let index = 0; index < 5; index += 1) {
      await countReportAttempt(alpha, "1.1.1.1", listing(`l${index}`), database)
      await countReportAttempt(alpha, "1.1.1.1", event(`e${index}`), database)
    }
    await expect(
      countReportAttempt(alpha, "1.1.1.1", event("e-eleventh"), database)
    ).rejects.toThrow("a lot of reports in a short time")

    // Another site's budget is its own.
    await countReportAttempt(beta, "1.1.1.1", event("e-eleventh"), database)
  })

  it("gives the whole site fifty an hour across listings and events together", async () => {
    for (let index = 0; index < 50; index += 1) {
      const about = index % 2 ? event(`e${index}`) : listing(`l${index}`)
      await countReportAttempt(alpha, `10.0.0.${index}`, about, database)
    }
    await expect(
      countReportAttempt(alpha, "10.0.1.1", event("e-last"), database)
    ).rejects.toThrow("This site has had a lot of reports")
  })
})
