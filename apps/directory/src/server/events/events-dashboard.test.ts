import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EVENTS_PAGE_ERRORS } from "@/lib/events/events-dashboard-page"
import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import { createEvent, listEvents, updateEvent } from "@/server/events/events"
import {
  comingUp,
  eventCategoryCounts,
  eventsSectionCounts,
  featuredEvents,
  getEventsPage,
  listAllSignUps,
  saveEventsPageBody,
  setEventsPageLock,
} from "@/server/events/events-dashboard"
import { saveEventAndDates } from "@/server/events/repeats"
import { EVENT_CONTENT_TYPE } from "@/server/events/schema"
import { signUpForEvent } from "@/server/events/sign-ups"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * The Events dashboard's reads (task events/37, Part 1). The site is on
 * Toronto time; "now" is the real clock, so the events here sit in 2099 to
 * come and in 2020 to be over.
 */

let client: PGlite
let database: TestDatabase
let siteId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
})

afterEach(async () => {
  await client.close()
})

async function event(title: string, startDate: string, more: Parameters<typeof updateEvent>[2] = {}) {
  const made = await createEvent(siteId, { title, when: { startDate, startTime: "18:00" } }, database)
  return updateEvent(siteId, made.id, { status: "published", ...more }, database)
}

describe("the Events row's tabs", () => {
  it("puts events still to come under Upcoming, ones over under Past, and drafts under Draft", async () => {
    const soon = await event("Night market", "2099-05-01")
    const over = await event("Old fair", "2020-05-01")
    const draft = await createEvent(siteId, { title: "Secret", when: { startDate: "2099-06-01", startTime: "18:00" } }, database)
    const read = (tab: "upcoming" | "past" | "draft") =>
      listEvents(siteId, { tab }, database).then((found) => found.events.map((row) => row.id))
    expect(await read("upcoming")).toEqual([soon.id])
    expect(await read("past")).toEqual([over.id])
    expect(await read("draft")).toEqual([draft.id])
    expect((await listEvents(siteId, {}, database)).tabCounts).toEqual({ upcoming: 1, past: 1, draft: 1 })
  })

  it("narrows to one category and counts the tabs inside it", async () => {
    const food = await createCategory(siteId, { name: "Food" }, database)
    const market = await event("Night market", "2099-05-01")
    await event("Jazz", "2099-05-02")
    await setContentCategories(siteId, EVENT_CONTENT_TYPE, market.id, [food.id], database)
    const found = await listEvents(siteId, { tab: "upcoming", categoryId: food.id }, database)
    expect(found.events.map((row) => row.id)).toEqual([market.id])
    expect(found.tabCounts.upcoming).toBe(1)
    expect(await eventCategoryCounts(siteId, database)).toEqual([{ id: food.id, name: "Food", count: 1 }])
  })
})

describe("the left page", () => {
  it("starts with Dashboards, Coming up and Categories, and refuses a save while locked", async () => {
    const first = await getEventsPage(siteId, database)
    expect(first.page.body).toContain("noteEventsSections")
    expect(first.page.body).toContain("noteEventsComing")
    // A page saved without the Dashboards block gets it back.
    await saveEventsPageBody(siteId, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), database)
    expect((await getEventsPage(siteId, database)).page.body).toContain("noteEventsSections")
    await setEventsPageLock(siteId, true, database)
    await expect(saveEventsPageBody(siteId, first.page.body, database)).rejects.toThrow(EVENTS_PAGE_ERRORS.locked)
  })

  it("lists what is coming up, soonest first, and counts each row", async () => {
    const later = await event("Later", "2099-06-01", { takesSignUps: true })
    const sooner = await event("Sooner", "2099-05-01")
    await event("Over", "2020-05-01")
    const coming = await comingUp(siteId, 5, database)
    expect(coming.rows.map((row) => row.id)).toEqual([sooner.id, later.id])
    await signUpForEvent(siteId, later.id, { name: "Sam", email: "sam@example.com" }, { ip: "10.0.0.1" }, database)
    expect(await eventsSectionCounts(siteId, database)).toEqual({ events: 3, signups: 1, featured: 0, fields: 0 })
  })
})

describe("the Sign-ups row", () => {
  it("lists everyone across events, filtered by who is coming or waiting", async () => {
    const one = await event("Cooking class", "2099-05-01", { takesSignUps: true, seats: 1 })
    await signUpForEvent(siteId, one.id, { name: "Sam", email: "sam@example.com" }, { ip: "10.0.0.1" }, database)
    await signUpForEvent(siteId, one.id, { name: "Lee", email: "lee@example.com" }, { ip: "10.0.0.2" }, database)
    const read = (who: "coming" | "waiting" | "all", search?: string) =>
      listAllSignUps(siteId, { who, search, limit: 50, offset: 0 }, database).then((found) =>
        found.rows.map((row) => `${row.name}:${row.status}`)
      )
    expect(await read("coming")).toEqual(["Sam:confirmed"])
    expect(await read("waiting")).toEqual(["Lee:waiting"])
    expect((await read("all")).sort()).toEqual(["Lee:waiting", "Sam:confirmed"])
    expect(await read("all", "cooking")).toHaveLength(2)
    expect(await read("all", "nobody")).toEqual([])
  })

  it("never shows another site's sign-ups", async () => {
    const mine = await event("Mine", "2099-05-01", { takesSignUps: true })
    await signUpForEvent(siteId, mine.id, { name: "Sam", email: "sam@example.com" }, { ip: "10.0.0.1" }, database)
    const other = (await insertWorkspace(database, { name: "Beta" })).id
    expect((await listAllSignUps(other, { who: "all", limit: 50, offset: 0 }, database)).total).toBe(0)
  })
})

describe("the Featured events row", () => {
  it("lists an admin's featured event still to come, and drops it once over unless asked", async () => {
    const live = await event("Big night", "2099-05-01", { featured: true })
    await event("Old night", "2020-05-01", { featured: true })
    const running = await featuredEvents(siteId, { spots: "running", limit: 50, offset: 0 }, database)
    expect(running.rows.map((row) => [row.eventId, row.kind])).toEqual([[live.id, "admin"]])
    const all = await featuredEvents(siteId, { spots: "all", limit: 50, offset: 0 }, database)
    expect(all.total).toBe(2)
    expect(all.rows.find((row) => row.eventTitle === "Old night")?.running).toBe(false)
    const found = await featuredEvents(siteId, { spots: "all", search: "big", limit: 50, offset: 0 }, database)
    expect(found.rows.map((row) => row.eventTitle)).toEqual(["Big night"])
  })

  it("keeps a repeating event featured while any of its dates is to come", async () => {
    const weekly = await event("Trivia", "2020-01-07", { featured: true })
    await saveEventAndDates(siteId, weekly.id, { repeat: { freq: "weekly", weekdays: [2], until: null } }, database)
    const running = await featuredEvents(siteId, { spots: "running", limit: 50, offset: 0 }, database)
    expect(running.rows.map((row) => row.eventId)).toEqual([weekly.id])
  })
})
