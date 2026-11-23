import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { MAX_CUSTOM_SECTIONS } from "@/lib/directory/custom-fields"
import {
  createCustomSection,
  customFieldsRemovalImpact,
  customFieldUsage,
  customSectionUsage,
  deleteCustomSection,
  findCustomSection,
  listCustomSections,
  listCustomSectionSummaries,
  reorderCustomSections,
  updateCustomSection,
} from "@/server/directory/custom-sections"
import {
  createListing,
  findListing,
  updateListing,
} from "@/server/directory/listings"
import { directoryListings } from "@/server/directory/schema"
import {
  createEvent,
  duplicateEvent,
  eventCustomValues,
  updateEvent,
} from "@/server/events/events"
import { saveEventAndDates } from "@/server/events/repeats"
import { siteEvents } from "@/server/events/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let siteId: string
let otherSiteId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database)).id
  otherSiteId = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

async function wineSection() {
  const created = await createCustomSection(siteId, { name: "The wine" }, database)
  return updateCustomSection(
    siteId,
    created.id,
    {
      fields: [
        { label: "Grape", type: "text" },
        { label: "Vintage", type: "number" },
      ],
    },
    database
  )
}

describe("sections", () => {
  it("names a new section from what it is called", async () => {
    const section = await createCustomSection(
      siteId,
      { name: "The wine" },
      database
    )
    expect(section.slug).toBe("the_wine")
    expect(section.fields).toEqual([])
  })

  it("keeps the slug when the section is renamed", async () => {
    const section = await wineSection()
    const renamed = await updateCustomSection(
      siteId,
      section.id,
      { name: "About the wine" },
      database
    )
    expect(renamed.slug).toBe(section.slug)
  })

  it("refuses more sections than a site may have", async () => {
    for (let index = 0; index < MAX_CUSTOM_SECTIONS; index += 1) {
      await createCustomSection(siteId, { name: `Section ${index}` }, database)
    }
    await expect(
      createCustomSection(siteId, { name: "One too many" }, database)
    ).rejects.toThrow(/sections/)
  })

  it("puts them in the order the admin asked for", async () => {
    const first = await createCustomSection(siteId, { name: "First" }, database)
    const second = await createCustomSection(
      siteId,
      { name: "Second" },
      database
    )
    await reorderCustomSections(siteId, [second.id, first.id], database)
    expect(
      (await listCustomSections(siteId, database)).map((row) => row.name)
    ).toEqual(["Second", "First"])
  })

  it("ignores an id from another site when reordering", async () => {
    const mine = await createCustomSection(siteId, { name: "Mine" }, database)
    const theirs = await createCustomSection(
      otherSiteId,
      { name: "Theirs" },
      database
    )
    await reorderCustomSections(siteId, [theirs.id, mine.id], database)
    const other = await findCustomSection(otherSiteId, theirs.id, database)
    expect(other?.displayOrder).toBe(0)
  })

  it("does not find another site's section", async () => {
    const theirs = await createCustomSection(
      otherSiteId,
      { name: "Theirs" },
      database
    )
    expect(await findCustomSection(siteId, theirs.id, database)).toBeNull()
    await expect(
      updateCustomSection(siteId, theirs.id, { name: "Mine now" }, database)
    ).rejects.toThrow(/no longer exists/)
  })
})

describe("a listing's answers", () => {
  it("saves only what the site defines and reads it back", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Joe's" }, database)

    await updateListing(
      siteId,
      listing.id,
      {
        customValues: {
          [section.slug]: { grape: "Nebbiolo", vintage: 1998, spy: "no" },
          made_up: { anything: "at all" },
        },
      },
      database
    )

    const saved = await findListing(siteId, listing.id, database)
    expect(saved?.customValues).toEqual({
      [section.slug]: { grape: "Nebbiolo", vintage: 1998 },
    })
  })

  it("a listing on a site with no sections is exactly as it was", async () => {
    const listing = await createListing(siteId, { title: "Plain" }, database)
    const saved = await findListing(siteId, listing.id, database)
    expect(saved?.customValues).toEqual({})
  })

  it("counts the listings that filled something in", async () => {
    const section = await wineSection()
    const filled = await createListing(siteId, { title: "Filled" }, database)
    await createListing(siteId, { title: "Empty" }, database)
    await updateListing(
      siteId,
      filled.id,
      { customValues: { [section.slug]: { grape: "Merlot" } } },
      database
    )

    expect(await customSectionUsage(siteId, section.slug, database)).toBe(1)
    expect(
      await customFieldUsage(siteId, section.slug, "grape", database)
    ).toBe(1)
    expect(
      await customFieldUsage(siteId, section.slug, "vintage", database)
    ).toBe(0)
    const [summary] = await listCustomSectionSummaries(siteId, database)
    expect(summary.used).toBe(1)
  })

  it("says which fields a save would empty before it happens", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Filled" }, database)
    await updateListing(
      siteId,
      listing.id,
      { customValues: { [section.slug]: { grape: "Merlot", vintage: 2001 } } },
      database
    )

    const { removed } = await customFieldsRemovalImpact(
      siteId,
      section.id,
      section.fields.filter((field) => field.key !== "vintage"),
      database
    )
    expect(removed).toEqual([{ label: "Vintage", used: 1 }])
  })

  it("deleting a section takes its answers off every listing", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Filled" }, database)
    await updateListing(
      siteId,
      listing.id,
      { customValues: { [section.slug]: { grape: "Merlot" } } },
      database
    )

    await deleteCustomSection(siteId, section.id, database)

    // Straight off the row, not through the reader — the reader would drop
    // the answers anyway, and the point here is that nothing is left behind
    // for a section that happens to be given the same name later.
    const [row] = await database
      .select({ customValues: directoryListings.customValues })
      .from(directoryListings)
      .where(eq(directoryListings.id, listing.id))
    expect(row.customValues).toEqual({})
  })

  it("a field the site stops defining stops being readable", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Filled" }, database)
    await updateListing(
      siteId,
      listing.id,
      { customValues: { [section.slug]: { grape: "Merlot", vintage: 2001 } } },
      database
    )

    await updateCustomSection(
      siteId,
      section.id,
      { fields: [{ key: "grape", label: "Grape", type: "text" }] },
      database
    )

    const saved = await findListing(siteId, listing.id, database)
    expect(saved?.customValues).toEqual({ [section.slug]: { grape: "Merlot" } })
  })
})

/** "Age limit", the task's own example: an event section with a choice field. */
async function ageSection() {
  const created = await createCustomSection(
    siteId,
    { name: "Good to know", kind: "event" },
    database
  )
  return updateCustomSection(
    siteId,
    created.id,
    {
      fields: [
        {
          label: "Age limit",
          type: "select",
          // Asked for, and refused: an event's fields are never filters.
          filter: true,
          options: [
            { label: "All ages", value: "all" },
            { label: "19+", value: "19" },
          ],
        },
        { label: "Dress code", type: "text" },
      ],
    },
    database
  )
}

const WHEN = { startDate: "2099-06-05", startTime: "21:00" }

describe("event fields (task events/07)", () => {
  it("keeps the event list apart from the listing list", async () => {
    await wineSection()
    const event = await ageSection()

    expect(event.kind).toBe("event")
    expect(
      (await listCustomSections(siteId, database)).map((row) => row.name)
    ).toEqual(["The wine"])
    expect(
      (await listCustomSections(siteId, database, "event")).map(
        (row) => row.name
      )
    ).toEqual(["Good to know"])
  })

  it("never makes an event field a filter", async () => {
    const section = await ageSection()
    expect(section.fields[0]?.type).toBe("select")
    expect(section.fields[0]).toMatchObject({ filter: false })
  })

  it("gives an event section named like a listing one a slug of its own", async () => {
    const listing = await createCustomSection(siteId, { name: "Details" }, database)
    const event = await createCustomSection(
      siteId,
      { name: "Details", kind: "event" },
      database
    )
    expect(event.slug).not.toBe(listing.slug)
  })

  it("counts the twelve-section limit per kind", async () => {
    for (let index = 0; index < MAX_CUSTOM_SECTIONS; index += 1) {
      await createCustomSection(siteId, { name: `Listing ${index}` }, database)
    }
    const event = await createCustomSection(
      siteId,
      { name: "Good to know", kind: "event" },
      database
    )
    expect(event.kind).toBe("event")
  })

  it("saves only what the site defines on an event and reads it back", async () => {
    const section = await ageSection()
    const event = await createEvent(siteId, { title: "Late show", when: WHEN }, database)

    await updateEvent(
      siteId,
      event.id,
      {
        customValues: {
          [section.slug]: { age_limit: "19", dress_code: "", spy: "no" },
          made_up: { anything: "at all" },
        },
      },
      database
    )

    // Blank answers are never stored, so an empty Dress code is not there.
    expect(await eventCustomValues(siteId, event.id, database)).toEqual({
      [section.slug]: { age_limit: "19" },
    })
  })

  it("refuses a choice that is not one of the field's choices", async () => {
    const section = await ageSection()
    const event = await createEvent(siteId, { title: "Late show", when: WHEN }, database)
    await updateEvent(
      siteId,
      event.id,
      { customValues: { [section.slug]: { age_limit: "21" } } },
      database
    )
    expect(await eventCustomValues(siteId, event.id, database)).toEqual({})
  })

  it("counts events, not listings, before a field or section goes", async () => {
    const section = await ageSection()
    const event = await createEvent(siteId, { title: "Late show", when: WHEN }, database)
    await updateEvent(
      siteId,
      event.id,
      { customValues: { [section.slug]: { age_limit: "19" } } },
      database
    )

    const [summary] = await listCustomSectionSummaries(siteId, database, "event")
    expect(summary.used).toBe(1)
    const { removed } = await customFieldsRemovalImpact(
      siteId,
      section.id,
      section.fields.filter((field) => field.key !== "age_limit"),
      database
    )
    expect(removed).toEqual([{ label: "Age limit", used: 1 }])
  })

  it("deleting an event section takes its answers off every event", async () => {
    const section = await ageSection()
    const event = await createEvent(siteId, { title: "Late show", when: WHEN }, database)
    await updateEvent(
      siteId,
      event.id,
      { customValues: { [section.slug]: { age_limit: "19" } } },
      database
    )

    await deleteCustomSection(siteId, section.id, database)

    const [row] = await database
      .select({ customValues: siteEvents.customValues })
      .from(siteEvents)
      .where(eq(siteEvents.id, event.id))
    expect(row.customValues).toEqual({})
  })

  it("a duplicate and a repeat's dates copy the answers", async () => {
    const section = await ageSection()
    const event = await createEvent(siteId, { title: "Weekly show", when: WHEN }, database)
    const answers = { [section.slug]: { age_limit: "19" } }

    await saveEventAndDates(
      siteId,
      event.id,
      {
        customValues: answers,
        // 5 Jun 2099 is a Friday.
        repeat: { freq: "weekly", weekdays: [5], until: null },
      },
      database,
      new Date("2099-06-01T12:00:00Z")
    )

    const copy = await duplicateEvent(siteId, event.id, database)
    expect(await eventCustomValues(siteId, copy.id, database)).toEqual(answers)

    const dates = await database
      .select({ customValues: siteEvents.customValues })
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, event.id))
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((row) => JSON.stringify(row.customValues) === JSON.stringify(answers))).toBe(true)
  })
})
