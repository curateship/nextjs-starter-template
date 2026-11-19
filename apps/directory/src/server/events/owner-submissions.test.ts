import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(async () => undefined),
  deleteFromR2: vi.fn(async () => undefined),
  getPublicMediaUrl: async (path: string) =>
    `https://media.example.test/${path}`,
  R2StorageNotConfiguredError: class extends Error {},
}))

import { uuid } from "@/server/auth/security"
import { setPageVisibility } from "@/server/content/pages"
import { createListing, updateListing } from "@/server/directory/listings"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { directoryClaims } from "@/server/directory/schema"
import { createEvent, findEvent, updateEvent } from "@/server/events/events"
import {
  changeOwnerEvent,
  ownerEventsFor,
  sendOwnerEvent,
  withdrawOwnerEvent,
  type OwnerEventInput,
} from "@/server/events/owner-submissions"
import { saveEventAndDates } from "@/server/events/repeats"
import { eventSignUps, siteEvents } from "@/server/events/schema"
import { signUpBoxFor, signUpForEvent } from "@/server/events/sign-ups"
import {
  listEventSubmissions,
  reviewEventSubmission,
} from "@/server/events/submissions"
import { customShellMedia } from "@/server/schema"
import { recordVisit } from "@/server/traffic"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A listing's owner adding events for their own place from My listings: only
 * their own listing, reviewed every time, and published when approved.
 */

let client: PGlite
let database: TestDatabase
let siteId: string
let ownerId: string
let otherOwnerId: string
let adminId: string
let listingId: string
let claimId: string
let otherClaimId: string

// Thursday 24 September 2026, noon in Toronto.
const at = new Date("2026-09-24T16:00:00Z")

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  ownerId = (
    await insertUser(database, { email: "cafe@example.com", name: "Ari" })
  ).id
  otherOwnerId = (await insertUser(database, { email: "shop@example.com" })).id
  adminId = (await insertUser(database, { email: "admin@example.com" })).id

  const cafe = await createListing(siteId, { title: "Café Luna" }, database)
  await updateListing(
    siteId,
    cafe.id,
    {
      status: "published",
      contactLinks: {
        address: "12 Ossington Ave, Toronto",
        menuLinks: [],
        socialLinks: [],
      },
    },
    database
  )
  listingId = cafe.id
  const shop = await createListing(siteId, { title: "The Shop" }, database)
  claimId = await claim(ownerId, cafe.id)
  otherClaimId = await claim(otherOwnerId, shop.id)
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function claim(userId: string, onListing: string, status = "approved") {
  const id = uuid()
  await database.insert(directoryClaims).values({
    id,
    workspaceId: siteId,
    listingId: onListing,
    userId,
    contactEmail: "owner@example.com",
    claimantName: "Owner",
    status,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

function openMic(overrides: Partial<OwnerEventInput> = {}): OwnerEventInput {
  return {
    title: "Friday open mic",
    startDate: "2026-09-25",
    startTime: "20:00",
    endTime: "23:00",
    description: "Bring a song.",
    coverImage: "",
    ...overrides,
  }
}

async function sent(overrides: Partial<OwnerEventInput> = {}) {
  const result = await sendOwnerEvent(
    ownerId,
    claimId,
    openMic(overrides),
    database,
    at
  )
  if (result.outcome !== "sent") throw new Error(JSON.stringify(result))
  return result.submission
}

describe("adding an event", () => {
  it("puts it in the queue marked as from the owner, at their listing", async () => {
    const submission = await sent()
    expect(submission).toMatchObject({
      fromOwner: true,
      listingId,
      placeName: "Café Luna",
      placeAddress: "12 Ossington Ave, Toronto",
      submitterName: "Ari",
      submitterEmail: "cafe@example.com",
      status: "pending",
    })
    const queue = await listEventSubmissions(
      siteId,
      { status: "pending" },
      database
    )
    expect(queue.submissions.map((row) => row.fromOwner)).toEqual([true])
  })

  it("never sends for somebody else's listing, or a claim not yet approved", async () => {
    expect(
      await sendOwnerEvent(ownerId, otherClaimId, openMic(), database, at)
    ).toEqual({
      outcome: "refused",
      problem: "You do not look after that listing.",
    })
    const waiting = await claim(ownerId, listingId, "pending_review")
    expect(
      (await sendOwnerEvent(ownerId, waiting, openMic(), database, at)).outcome
    ).toBe("refused")
  })

  it("refuses a day that has been, by the site's calendar", async () => {
    expect(
      await sendOwnerEvent(
        ownerId,
        claimId,
        openMic({ startDate: "2026-09-23" }),
        database,
        at
      )
    ).toEqual({
      outcome: "refused",
      problem: "That day has already been. Pick today or a later day.",
    })
  })

  it("refuses while the site's Events page is switched off", async () => {
    await setPageVisibility(
      siteId,
      { path: "/events", visibility: "off" },
      database
    )
    expect(
      (await sendOwnerEvent(ownerId, claimId, openMic(), database, at)).outcome
    ).toBe("refused")
    const { sites } = await ownerEventsFor(ownerId, database, at)
    expect(sites[siteId]).toEqual({ eventsOn: false, today: "2026-09-24" })
  })

  it("takes the owner's own photo and nobody else's", async () => {
    const ownPath = `${ownerId}/poster.png`
    const theirPath = `${otherOwnerId}/poster.png`
    for (const [userId, storagePath] of [
      [ownerId, ownPath],
      [otherOwnerId, theirPath],
    ] as const) {
      await database.insert(customShellMedia).values({
        id: uuid(),
        workspaceId: siteId,
        userId,
        filename: "poster.png",
        originalName: "poster.png",
        altText: null,
        fileSize: 10,
        mimeType: "image/png",
        fileType: "image",
        storagePath,
        emailProtectedAt: null,
        createdAt: at,
        updatedAt: at,
      })
    }
    expect(
      await sendOwnerEvent(
        ownerId,
        claimId,
        openMic({ coverImage: `https://media.example.test/${theirPath}` }),
        database,
        at
      )
    ).toEqual({
      outcome: "refused",
      problem: "That photo is not one of your uploads. Pick it again.",
    })
    const withPhoto = await sent({
      coverImage: `https://media.example.test/${ownPath}`,
    })
    expect(withPhoto.photoUrl).toBe(`https://media.example.test/${ownPath}`)
  })
})

describe("approving an owner's event", () => {
  it("publishes it with the listing as the place", async () => {
    const submission = await sent()
    const { eventId } = await reviewEventSubmission(
      siteId,
      submission.id,
      { decision: "approve", reviewerId: adminId },
      database
    )
    const event = await findEvent(siteId, eventId!, database)
    expect(event).toMatchObject({
      title: "Friday open mic",
      status: "published",
      listingId,
      placeName: "Café Luna",
      startDate: "2026-09-25",
      startTime: "20:00",
      endTime: "23:00",
    })
    expect(event?.publishedAt).toBeInstanceOf(Date)
  })
})

describe("the owner's view", () => {
  it("shows each of their events with where it stands", async () => {
    const published = await sent({ title: "Open mic" })
    const turnedDown = await sent({ title: "Karaoke" })
    await sent({ title: "Quiz night" })
    await reviewEventSubmission(
      siteId,
      published.id,
      { decision: "approve", reviewerId: adminId },
      database
    )
    await reviewEventSubmission(
      siteId,
      turnedDown.id,
      {
        decision: "reject",
        note: "Too loud for the street.",
        reviewerId: adminId,
      },
      database
    )

    const { events } = await ownerEventsFor(ownerId, database, at)
    const mine = events[listingId] ?? []
    expect(
      mine.map((row) => [row.title, row.status, Boolean(row.eventSlug)])
    ).toEqual([
      ["Quiz night", "pending", false],
      ["Karaoke", "rejected", false],
      ["Open mic", "approved", true],
    ])
    expect(mine[1]?.reviewNote).toBe("Too loud for the street.")
  })

  it("counts views of their published event's page, and nobody else's", async () => {
    const submission = await sent({ title: "Open mic" })
    await sent({ title: "Quiz night" })
    const { eventId } = await reviewEventSubmission(
      siteId,
      submission.id,
      { decision: "approve", reviewerId: adminId },
      database
    )
    const event = await findEvent(siteId, eventId!, database)
    const slug = event!.slug
    const visit = async (path: string, on: Date) => {
      await recordVisit(
        {
          workspaceId: siteId,
          path,
          referrerDomain: "direct",
          device: "computer",
          audience: "visitor",
          visitorHash: uuid(),
        },
        database,
        on
      )
    }
    await visit(`/events/${slug}`, at)
    await visit(`/events/${slug}`, at)
    await visit(`/events/${slug}`, new Date(at.getTime() - 90 * 86_400_000))
    // Another event's page on the same site, which must not be counted here.
    await visit("/events/somebody-elses-thing", at)

    const mine = (await ownerEventsFor(ownerId, database, at)).events[
      listingId
    ]!
    expect(mine.map((row) => [row.title, row.views])).toEqual([
      ["Quiz night", null],
      ["Open mic", { recent: 2, all: 3 }],
    ])
    expect((await ownerEventsFor(otherOwnerId, database, at)).events).toEqual(
      {}
    )
  })

  it("never shows one owner another owner's events", async () => {
    await sent()
    expect((await ownerEventsFor(otherOwnerId, database, at)).events).toEqual(
      {}
    )
  })

  it("does not show the old owner's events to a listing's new owner", async () => {
    await sent()
    // One approved owner per listing, so the old claim ends first.
    await database
      .update(directoryClaims)
      .set({ status: "rejected" })
      .where(eq(directoryClaims.id, claimId))
    await claim(otherOwnerId, listingId)
    expect(
      (await ownerEventsFor(otherOwnerId, database, at)).events[listingId]
    ).toBeUndefined()
  })
})

/** Sends the open mic and approves it, so it is published at Café Luna. */
async function published() {
  const submission = await sent()
  const { eventId } = await reviewEventSubmission(
    siteId,
    submission.id,
    { decision: "approve", reviewerId: adminId },
    database
  )
  return { submission, eventId: eventId! }
}

describe("an owner changing an event", () => {
  it("changes a waiting one where it is", async () => {
    const submission = await sent()
    const result = await changeOwnerEvent(
      ownerId,
      submission.id,
      openMic({ title: "Saturday open mic", startDate: "2026-09-26" }),
      database,
      at
    )
    expect(result).toMatchObject({ outcome: "sent" })
    const queue = await listEventSubmissions(siteId, { status: "pending" }, database)
    expect(queue.submissions).toHaveLength(1)
    expect(queue.submissions[0]).toMatchObject({
      id: submission.id,
      title: "Saturday open mic",
      startDate: "2026-09-26",
      changes: null,
    })
  })

  it("asks for a published one, which stays as it is until approved", async () => {
    const { submission, eventId } = await published()
    await changeOwnerEvent(
      ownerId,
      submission.id,
      openMic({ title: "Open mic, now with a band" }),
      database,
      at
    )
    // A second change while the first waits replaces it.
    await changeOwnerEvent(
      ownerId,
      submission.id,
      openMic({ title: "Open mic and band", startTime: "21:00" }),
      database,
      at
    )
    expect((await findEvent(siteId, eventId, database))?.title).toBe(
      "Friday open mic"
    )
    const queue = await listEventSubmissions(siteId, { status: "pending" }, database)
    expect(queue.submissions).toHaveLength(1)
    const change = queue.submissions[0]!
    expect(change.changes).toMatchObject({
      eventId,
      current: { title: "Friday open mic", startTime: "20:00" },
    })
    expect((await ownerEventsFor(ownerId, database, at)).events[listingId]).toMatchObject([
      { id: submission.id, changeWaiting: true },
    ])

    await reviewEventSubmission(
      siteId,
      change.id,
      { decision: "approve", reviewerId: adminId },
      database
    )
    const event = await findEvent(siteId, eventId, database)
    expect(event).toMatchObject({
      title: "Open mic and band",
      startTime: "21:00",
      status: "published",
    })
  })

  it("shows the approved change on My listings, so Change opens with what is live", async () => {
    const { submission } = await published()
    await changeOwnerEvent(ownerId, submission.id, openMic({ title: "Open mic and band" }), database, at)
    const queue = await listEventSubmissions(siteId, { status: "pending" }, database)
    await reviewEventSubmission(siteId, queue.submissions[0]!.id, { decision: "approve", reviewerId: adminId }, database)
    expect((await ownerEventsFor(ownerId, database, at)).events[listingId]).toMatchObject([
      { id: submission.id, title: "Open mic and band", changeWaiting: false },
    ])
  })

  it("refuses a change to an event it has withdrawn", async () => {
    const { submission } = await published()
    await withdrawOwnerEvent(ownerId, submission.id, database, at)
    expect(await changeOwnerEvent(ownerId, submission.id, openMic(), database, at)).toMatchObject({
      outcome: "refused",
    })
  })

  it("refuses somebody else's event and a turned-down one", async () => {
    const submission = await sent()
    expect(
      await changeOwnerEvent(otherOwnerId, submission.id, openMic(), database, at)
    ).toEqual({ outcome: "refused", problem: "That is not one of your events any more." })
    await reviewEventSubmission(
      siteId,
      submission.id,
      { decision: "reject", reviewerId: adminId },
      database
    )
    expect(
      await changeOwnerEvent(ownerId, submission.id, openMic(), database, at)
    ).toMatchObject({ outcome: "refused" })
  })
})

describe("an owner withdrawing an event", () => {
  it("takes a waiting one out of the queue", async () => {
    const submission = await sent()
    expect(await withdrawOwnerEvent(ownerId, submission.id, database)).toEqual({
      withdrawn: true,
    })
    const queue = await listEventSubmissions(siteId, { status: "pending" }, database)
    expect(queue.total).toBe(0)
  })

  it("puts a published one back to Draft, with any waiting change", async () => {
    const { submission, eventId } = await published()
    await changeOwnerEvent(ownerId, submission.id, openMic({ title: "New name" }), database, at)
    expect(await withdrawOwnerEvent(ownerId, submission.id, database)).toEqual({
      withdrawn: true,
    })
    expect((await findEvent(siteId, eventId, database))?.status).toBe("draft")
    const queue = await listEventSubmissions(siteId, { status: "pending" }, database)
    expect(queue.total).toBe(0)
    expect((await ownerEventsFor(ownerId, database, at)).events[listingId]).toMatchObject([
      { withdrawn: true },
    ])
  })

  it("takes every date of a repeat down with it", async () => {
    const { submission, eventId } = await published()
    await saveEventAndDates(
      siteId,
      eventId,
      { repeat: { freq: "weekly", weekdays: [5], until: null } },
      database,
      at
    )
    const before = await database
      .select({ status: siteEvents.status })
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, eventId))
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((row) => row.status === "published")).toBe(true)

    await withdrawOwnerEvent(ownerId, submission.id, database, at)
    const after = await database
      .select({ status: siteEvents.status })
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, eventId))
    expect(after.length).toBe(before.length)
    expect(after.every((row) => row.status === "draft")).toBe(true)
  })

  it("never withdraws somebody else's", async () => {
    const submission = await sent()
    expect(await withdrawOwnerEvent(otherOwnerId, submission.id, database)).toEqual({
      withdrawn: false,
      problem: "That is not one of your events any more.",
    })
  })
})

describe("who is coming to an owner's event", () => {
  it("lists names and emails for their own event, and the box says so", async () => {
    const { eventId } = await published()
    await updateEvent(
      siteId,
      eventId,
      { takesSignUps: true, seats: 20, signUpQuestion: "Your instrument?" },
      database
    )
    await signUpForEvent(
      siteId,
      eventId,
      { name: "Lee", email: "lee@example.com", answer: "Guitar" },
      { ip: "10.9.0.1", at },
      database
    )
    const [mine] = (await ownerEventsFor(ownerId, database, at)).events[listingId]!
    expect(mine?.signUps).toEqual({
      seats: 20,
      people: [{ name: "Lee", email: "lee@example.com", answer: "Guitar" }],
    })
    expect(
      await signUpBoxFor(siteId, eventId, "America/Toronto", at, database)
    ).toMatchObject({ hostSees: true })

    // Somebody whose box never said so, as everyone before the notice.
    await database.update(eventSignUps).set({ hostTold: false })
    const [after] = (await ownerEventsFor(ownerId, database, at)).events[listingId]!
    expect(after?.signUps).toEqual({ seats: 20, people: [] })
  })

  it("counts the people on every date of a repeat, with no single seat count", async () => {
    const { eventId } = await published()
    await updateEvent(siteId, eventId, { takesSignUps: true, seats: 5 }, database)
    await saveEventAndDates(siteId, eventId, { repeat: { freq: "weekly", weekdays: [5], until: null } }, database, at)
    const [date] = await database
      .select({ id: siteEvents.id })
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, eventId))
      .limit(1)
    await signUpForEvent(siteId, date!.id, { name: "Lee", email: "lee@example.com" }, { ip: "10.9.0.2", at }, database)
    const [mine] = (await ownerEventsFor(ownerId, database, at)).events[listingId]!
    expect(mine?.signUps).toEqual({ seats: null, people: [{ name: "Lee", email: "lee@example.com", answer: "" }] })
  })

  it("stops once the listing has changed hands", async () => {
    const { eventId } = await published()
    await updateEvent(siteId, eventId, { takesSignUps: true }, database)
    await database
      .update(directoryClaims)
      .set({ status: "rejected" })
      .where(eq(directoryClaims.id, claimId))
    const events = (await ownerEventsFor(ownerId, database, at)).events[listingId] ?? []
    expect(events.every((event) => event.signUps === null)).toBe(true)
  })

  it("is not shown for an event an admin wrote, and the box says nothing", async () => {
    const made = await createEvent(
      siteId,
      { title: "Admin's night", when: { startDate: "2026-09-30", startTime: "19:00" } },
      database
    )
    await updateEvent(
      siteId,
      made.id,
      { status: "published", takesSignUps: true, listingId },
      database
    )
    expect(
      await signUpBoxFor(siteId, made.id, "America/Toronto", at, database)
    ).toMatchObject({ hostSees: false })
    expect((await ownerEventsFor(ownerId, database, at)).events[listingId]).toBeUndefined()
  })
})

describe("the duplicate warning", () => {
  it("marks a waiting event when the site already has one with that name that day", async () => {
    const made = await createEvent(
      siteId,
      { title: "friday  OPEN mic", when: { startDate: "2026-09-25", startTime: "19:00" } },
      database
    )
    await sent()
    await sent({ title: "Something else" })
    const queue = await listEventSubmissions(siteId, { status: "pending" }, database)
    const byTitle = Object.fromEntries(
      queue.submissions.map((row) => [row.title, row.duplicateOf?.id ?? null])
    )
    expect(byTitle).toEqual({
      "Friday open mic": made.id,
      "Something else": null,
    })
  })
})
