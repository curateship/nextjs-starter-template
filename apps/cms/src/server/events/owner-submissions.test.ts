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
import { findEvent } from "@/server/events/events"
import {
  ownerEventsFor,
  sendOwnerEvent,
  type OwnerEventInput,
} from "@/server/events/owner-submissions"
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
