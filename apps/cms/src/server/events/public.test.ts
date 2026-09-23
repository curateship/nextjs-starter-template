import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { saveDirectoryTimeZone } from "@/server/directory/settings"
import { createEvent, updateEvent } from "@/server/events/events"
import { readPublicEvent } from "@/server/events/public"
import { EVENT_CONTENT_TYPE } from "@/server/events/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * What a visitor can reach: a published event on the site they are visiting,
 * never a draft and never another site's event.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let other: VisitorSite

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  const beta = await insertWorkspace(database, { name: "Beta" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  other = { id: beta.id, name: beta.name, url: "https://beta.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function event(
  siteId: string,
  title: string,
  status: "draft" | "published"
) {
  const created = await createEvent(
    siteId,
    { title, when: { startDate: "2026-09-26", startTime: "18:00" } },
    database
  )
  return updateEvent(
    siteId,
    created.id,
    {
      status,
      placeName: "Trinity Bellwoods Park",
      placeAddress: "790 Queen St W",
    },
    database
  )
}

describe("an event's page", () => {
  it("shows a published event and never a draft", async () => {
    const live = await event(site.id, "Night market", "published")
    const draft = await event(site.id, "Unfinished market", "draft")

    const page = await readPublicEvent(site, live.slug, database)
    expect(page?.event).toMatchObject({
      title: "Night market",
      startDate: "2026-09-26",
      startTime: "18:00",
      placeName: "Trinity Bellwoods Park",
    })
    expect(await readPublicEvent(site, draft.slug, database)).toBeNull()
  })

  it("goes when the event is taken back to draft", async () => {
    const live = await event(site.id, "Short run", "published")
    expect(await readPublicEvent(site, live.slug, database)).not.toBeNull()

    await updateEvent(site.id, live.id, { status: "draft" }, database)
    expect(await readPublicEvent(site, live.slug, database)).toBeNull()
  })

  it("never shows another site's event", async () => {
    const theirs = await event(other.id, "Beta market", "published")
    expect(await readPublicEvent(site, theirs.slug, database)).toBeNull()
  })

  it("carries its categories and the site's time zone", async () => {
    const markets = await createCategory(site.id, { name: "Markets" }, database)
    const live = await event(site.id, "Night market", "published")
    await setContentCategories(
      site.id,
      EVENT_CONTENT_TYPE,
      live.id,
      [markets.id],
      database
    )
    await saveDirectoryTimeZone(site.id, "America/Vancouver", database)

    const page = await readPublicEvent(site, live.slug, database)
    expect(page?.event.categories).toEqual([
      { name: "Markets", slug: markets.slug },
    ])
    expect(page?.timeZone).toBe("America/Vancouver")
  })
})
