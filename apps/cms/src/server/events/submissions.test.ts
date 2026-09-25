import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const storage = vi.hoisted(() => ({
  uploaded: [] as string[],
  deleted: [] as string[],
  failUpload: false,
}))

vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(async (path: string) => {
    if (storage.failUpload) throw new Error("bucket down")
    storage.uploaded.push(path)
  }),
  deleteFromR2: vi.fn(async (path: string) => {
    storage.deleted.push(path)
  }),
  getPublicMediaUrl: async (path: string) =>
    `https://media.example.test/${path}`,
  R2StorageNotConfiguredError: class extends Error {},
}))

import {
  emptyEventSubmission,
  type EventSubmissionValues,
} from "@/lib/events/event-submission-fields"
import { postBodyText } from "@/lib/posts/post-body"
import { findEvent } from "@/server/events/events"
import { eventSubmissions } from "@/server/events/schema"
import {
  createEventSubmission,
  decideEventSubmission,
  listEventSubmissions,
  pendingEventSubmissionCount,
  reviewEventSubmission,
} from "@/server/events/submissions"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * What the Suggest an event page may put in the queue, and what an admin's
 * answer does with it.
 */

let client: PGlite
let database: TestDatabase
let siteId: string
let otherSiteId: string
let reviewerId: string

// The site's today: Thursday 24 September 2026.
const today = "2026-09-24"
const context = { ip: "203.0.113.7", today }

beforeEach(async () => {
  storage.uploaded = []
  storage.deleted = []
  storage.failUpload = false
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  otherSiteId = (await insertWorkspace(database, { name: "Beta" })).id
  reviewerId = (await insertUser(database)).id
})

afterEach(async () => {
  await client.close()
})

function gig(overrides: Partial<EventSubmissionValues> = {}) {
  return {
    ...emptyEventSubmission(),
    title: "The Rusty Nails live",
    startDate: "2026-10-03",
    startTime: "21:00",
    endTime: "01:00",
    placeName: "The Rex",
    placeAddress: "194 Queen St W, Toronto",
    description: "Loud and late.\n\nDoors at 8:30.",
    submitterName: "Sam",
    submitterEmail: "Band@Example.com",
    ...overrides,
  }
}

/** The smallest file that starts the way a PNG does. */
const png = {
  name: "poster.png",
  type: "image/png",
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
}

async function sent(
  overrides: Partial<EventSubmissionValues> = {},
  photo: typeof png | null = null,
  on = siteId
) {
  const result = await createEventSubmission(
    on,
    { ...gig(overrides), photo },
    context,
    database
  )
  if (result.outcome !== "sent") throw new Error(JSON.stringify(result))
  return result.submission
}

describe("the form's answers", () => {
  it("refuses a day that has been, and takes today", async () => {
    expect(
      await createEventSubmission(
        siteId,
        gig({ startDate: "2026-09-23" }),
        context,
        database
      )
    ).toEqual({
      outcome: "refused",
      problem: "That day has already been. Pick today or a later day.",
    })
    expect(
      (
        await createEventSubmission(
          siteId,
          gig({ startDate: today }),
          context,
          database
        )
      ).outcome
    ).toBe("sent")
  })

  it("checks the required answers on the server, not only in the browser", async () => {
    for (const [field, problem] of [
      ["title", "Give the event a name."],
      ["startTime", "Give the time it starts."],
      ["submitterEmail", "Give an email address to hear back."],
    ] as const) {
      expect(
        await createEventSubmission(
          siteId,
          gig({ [field]: "  " }),
          context,
          database
        )
      ).toEqual({ outcome: "refused", problem })
    }
    expect(
      await createEventSubmission(
        siteId,
        gig({ submitterEmail: "not an email" }),
        context,
        database
      )
    ).toMatchObject({ outcome: "refused" })
    expect(await pendingEventSubmissionCount(siteId, database)).toBe(0)
  })

  it("keeps the title on one line, because it goes into email subjects", async () => {
    const lined = await sent({ title: "The Rusty\r\nNails  live" })
    expect(lined.title).toBe("The Rusty Nails live")
  })

  it("takes a suggestion with no place, description, end time or name", async () => {
    const bare = await sent({
      placeName: "",
      placeAddress: "",
      description: "",
      endTime: "",
      submitterName: "",
    })
    expect(bare).toMatchObject({ status: "pending", endTime: null })
    expect(bare.submitterEmail).toBe("band@example.com")
  })
})

describe("the spam limits", () => {
  it("refuses a sixth suggestion in an hour from one address, in plain words", async () => {
    for (let index = 1; index <= 5; index += 1) {
      await sent({ title: `Gig ${index}` })
    }
    expect(
      await createEventSubmission(
        siteId,
        gig({ title: "Gig 6" }),
        context,
        database
      )
    ).toEqual({
      outcome: "refused",
      problem:
        "You have sent 5 events in the last hour, which is as many as this site takes. Please try again in an hour.",
    })
    // Another address, and the same address on another site, are separate.
    expect(
      (
        await createEventSubmission(
          siteId,
          gig({ title: "Gig 6" }),
          { ...context, ip: "198.51.100.2" },
          database
        )
      ).outcome
    ).toBe("sent")
    expect(
      (
        await createEventSubmission(
          otherSiteId,
          gig({ title: "Gig 6" }),
          context,
          database
        )
      ).outcome
    ).toBe("sent")
  })

  it("does not count a refused answer against the five", async () => {
    for (let index = 1; index <= 6; index += 1) {
      await createEventSubmission(
        siteId,
        gig({ startDate: "2020-01-01" }),
        context,
        database
      )
    }
    expect(
      (await createEventSubmission(siteId, gig(), context, database)).outcome
    ).toBe("sent")
  })

  it("keeps one row when the same person sends the same event twice in a day", async () => {
    await sent()
    expect(
      await createEventSubmission(
        siteId,
        gig({ title: "THE RUSTY NAILS LIVE" }),
        context,
        database
      )
    ).toEqual({ outcome: "merged" })
    expect(await pendingEventSubmissionCount(siteId, database)).toBe(1)
  })
})

describe("the photo", () => {
  it("is stored aside, away from any person's media folder", async () => {
    const withPhoto = await sent({}, png)
    expect(storage.uploaded).toHaveLength(1)
    expect(storage.uploaded[0]).toMatch(/^event-submissions\/.+_poster\.png$/)
    expect(withPhoto.photoUrl).toBe(
      `https://media.example.test/${storage.uploaded[0]}`
    )
  })

  it("keeps only the last part of a name sent with folders in it", async () => {
    await sent({}, { ...png, name: "../../other-site/poster.png" })
    expect(storage.uploaded[0]).toMatch(
      /^event-submissions\/[^/]+_poster\.png$/
    )
  })

  it("refuses a file that is not the picture it claims, or the wrong kind", async () => {
    expect(
      await createEventSubmission(
        siteId,
        { ...gig(), photo: { ...png, bytes: new Uint8Array([1, 2, 3, 4]) } },
        context,
        database
      )
    ).toMatchObject({ outcome: "refused" })
    expect(
      await createEventSubmission(
        siteId,
        { ...gig(), photo: { ...png, type: "image/svg+xml" } },
        context,
        database
      )
    ).toEqual({
      outcome: "refused",
      problem: "The photo has to be a JPG, PNG or WebP picture.",
    })
    expect(storage.uploaded).toEqual([])
  })

  it("says so when the photo cannot be stored, and keeps nothing", async () => {
    storage.failUpload = true
    expect(
      await createEventSubmission(
        siteId,
        { ...gig(), photo: png },
        context,
        database
      )
    ).toMatchObject({ outcome: "refused" })
    expect(await pendingEventSubmissionCount(siteId, database)).toBe(0)
  })
})

describe("approving", () => {
  it("makes a draft event with every field filled", async () => {
    const suggestion = await sent({}, png)
    const { eventId } = await reviewEventSubmission(
      siteId,
      suggestion.id,
      { decision: "approve", reviewerId },
      database
    )
    const event = await findEvent(siteId, eventId!, database)
    expect(event).toMatchObject({
      title: "The Rusty Nails live",
      status: "draft",
      startDate: "2026-10-03",
      startTime: "21:00",
      // 9pm to 1am ends the next day.
      endDate: "2026-10-04",
      endTime: "01:00",
      placeName: "The Rex",
      placeAddress: "194 Queen St W, Toronto",
      summary: "Loud and late.",
      coverImage: `https://media.example.test/${storage.uploaded[0]}`,
    })
    expect(postBodyText(event!.body)).toContain("Doors at 8:30.")

    // The photo is in the Media library, under the admin who approved it.
    const [media] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.storagePath, storage.uploaded[0]!))
    expect(media).toMatchObject({ userId: reviewerId, workspaceId: siteId })

    const [approved] = (
      await listEventSubmissions(siteId, { status: "approved" }, database)
    ).submissions
    expect(approved).toMatchObject({ id: suggestion.id, eventId })
  })

  it("cannot make two events from one suggestion", async () => {
    const suggestion = await sent()
    await reviewEventSubmission(
      siteId,
      suggestion.id,
      { decision: "approve", reviewerId },
      database
    )
    await expect(
      reviewEventSubmission(
        siteId,
        suggestion.id,
        { decision: "approve", reviewerId },
        database
      )
    ).rejects.toThrow("Somebody has already dealt with this one.")
  })

  it("never reaches another site's suggestion", async () => {
    const theirs = await sent({}, null, otherSiteId)
    await expect(
      reviewEventSubmission(
        siteId,
        theirs.id,
        { decision: "approve", reviewerId },
        database
      )
    ).rejects.toThrow("That suggestion no longer exists.")
    expect(
      (await listEventSubmissions(siteId, { status: "pending" }, database))
        .total
    ).toBe(0)
  })
})

describe("rejecting", () => {
  it("keeps the row and the reason, makes nothing, and deletes the photo", async () => {
    const suggestion = await sent({}, png)
    const { eventId, submission } = await reviewEventSubmission(
      siteId,
      suggestion.id,
      { decision: "reject", note: "Not in our area.", reviewerId },
      database
    )
    expect(eventId).toBeNull()
    expect(submission).toMatchObject({
      status: "rejected",
      reviewNote: "Not in our area.",
    })
    expect(storage.deleted).toEqual(storage.uploaded)
  })
})

describe("the email back", () => {
  it("never undoes the decision when the email fails", async () => {
    const suggestion = await sent()
    const failing = vi.fn(async () => {
      throw new Error("mail server down")
    })
    const result = await decideEventSubmission(
      siteId,
      suggestion.id,
      { decision: "approve", reviewerId },
      database,
      failing
    )
    expect(failing).toHaveBeenCalledOnce()
    expect(result.emailed).toBe(false)
    expect(result.eventId).not.toBeNull()
    const [row] = await database
      .select({ status: eventSubmissions.status })
      .from(eventSubmissions)
      .where(eq(eventSubmissions.id, suggestion.id))
    expect(row?.status).toBe("approved")
  })

  it("says the sender was told only when the email went", async () => {
    const suggestion = await sent()
    const send = vi.fn(async () => ({ delivered: true }))
    const result = await decideEventSubmission(
      siteId,
      suggestion.id,
      { decision: "reject", note: "Full that week.", reviewerId },
      database,
      send
    )
    expect(result.emailed).toBe(true)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "band@example.com",
        subject: "About your event, The Rusty Nails live",
        lines: [
          "We are not adding The Rusty Nails live to the site at the moment.",
          "Full that week.",
        ],
      }),
      database
    )
  })
})

describe("the queue", () => {
  it("searches the title, the email, the name and the place inside one tab", async () => {
    await sent({ title: "Jazz night", submitterName: "Alex" })
    await sent({
      title: "Poetry slam",
      submitterEmail: "poet@example.com",
      placeName: "Massey Hall",
    })
    const find = async (search: string) =>
      (
        await listEventSubmissions(
          siteId,
          { status: "pending", search },
          database
        )
      ).submissions.map((row) => row.title)
    expect(await find("jazz")).toEqual(["Jazz night"])
    expect(await find("poet@")).toEqual(["Poetry slam"])
    expect(await find("alex")).toEqual(["Jazz night"])
    expect(await find("massey")).toEqual(["Poetry slam"])
    expect(
      (
        await listEventSubmissions(
          siteId,
          { status: "approved", search: "jazz" },
          database
        )
      ).total
    ).toBe(0)
  })
})
