import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { createEvent, listEvents, updateEvent } from "@/server/events/events"
import { eventViewsForPages, eventViewsKey } from "@/server/events/views"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { recordVisit } from "@/server/traffic"

/**
 * Event view counts: the traffic the site already keeps, matched on the
 * event page's address as it is now, counted inside one site only.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

const saturday = { startDate: "2026-09-26", startTime: "18:00" }
const DAY_MS = 24 * 60 * 60 * 1000
const today = new Date()
const longAgo = new Date(today.getTime() - 90 * DAY_MS)

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

async function view(workspaceId: string, slug: string, at: Date = today) {
  await recordVisit(
    {
      workspaceId,
      path: `/events/${slug}`,
      referrerDomain: "direct",
      device: "computer",
      audience: "visitor",
      visitorHash: uuid(),
    },
    database,
    at
  )
}

function make(workspaceId: string, title: string, slug?: string) {
  return createEvent(workspaceId, { title, slug, when: saturday }, database)
}

describe("both counts for an event page", () => {
  it("separates the last 30 days from all time", async () => {
    await make(alpha, "Night market", "night-market")
    await view(alpha, "night-market")
    await view(alpha, "night-market")
    await view(alpha, "night-market", longAgo)

    const counts = await eventViewsForPages(
      [{ workspaceId: alpha, slug: "night-market" }],
      database,
      today
    )
    expect(counts.get(eventViewsKey(alpha, "night-market"))).toEqual({
      recent: 2,
      all: 3,
    })
  })

  it("keeps the same address's views inside its own site", async () => {
    await make(alpha, "Night market", "night-market")
    await make(beta, "Night market", "night-market")
    await view(alpha, "night-market")
    await view(alpha, "night-market")
    await view(beta, "night-market")

    const counts = await eventViewsForPages(
      [
        { workspaceId: alpha, slug: "night-market" },
        { workspaceId: beta, slug: "night-market" },
      ],
      database,
      today
    )
    expect(counts.get(eventViewsKey(alpha, "night-market"))?.all).toBe(2)
    expect(counts.get(eventViewsKey(beta, "night-market"))?.all).toBe(1)
  })

  it("leaves a page nobody has opened out of the map", async () => {
    await make(alpha, "Quiet night", "quiet-night")
    const counts = await eventViewsForPages(
      [{ workspaceId: alpha, slug: "quiet-night" }],
      database,
      today
    )
    expect(counts.size).toBe(0)
  })
})

describe("the admin list's Views column", () => {
  it("counts each event's own address and 0 for the rest", async () => {
    await make(alpha, "Night market", "night-market")
    await make(alpha, "Quiet night", "quiet-night")
    await view(alpha, "night-market")
    await view(alpha, "night-market")

    const { events } = await listEvents(alpha, { sort: "title" }, database)
    expect(events.map((event) => [event.slug, event.views])).toEqual([
      ["night-market", 2],
      ["quiet-night", 0],
    ])
  })

  it("orders the whole list by the count, biggest first", async () => {
    await make(alpha, "One", "one")
    await make(alpha, "Two", "two")
    await make(alpha, "Three", "three")
    await view(alpha, "two")
    await view(alpha, "two")
    await view(alpha, "two")
    await view(alpha, "three")

    const { events } = await listEvents(alpha, { sort: "views" }, database)
    expect(events.map((event) => event.slug)).toEqual(["two", "three", "one"])
  })

  it("counts only the last 30 days when that range is asked for", async () => {
    await make(alpha, "One", "one")
    await make(alpha, "Two", "two")
    await view(alpha, "one", longAgo)
    await view(alpha, "two")

    const { events } = await listEvents(
      alpha,
      { sort: "views", viewDays: 30 },
      database
    )
    expect(events.map((event) => [event.slug, event.views])).toEqual([
      ["two", 1],
      ["one", 0],
    ])
  })

  it("leaves the old address's views behind when an event is renamed", async () => {
    const event = await make(alpha, "Night market", "night-market")
    await view(alpha, "night-market")
    await updateEvent(alpha, event.id, { slug: "winter-market" }, database)

    const { events } = await listEvents(alpha, {}, database)
    expect(events.map((each) => [each.slug, each.views])).toEqual([
      ["winter-market", 0],
    ])
  })

  it("never counts another site's traffic", async () => {
    await make(alpha, "Night market", "night-market")
    await make(beta, "Night market", "night-market")
    await view(beta, "night-market")

    const { events } = await listEvents(alpha, {}, database)
    expect(events.map((event) => event.views)).toEqual([0])
  })
})
