import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { createEvent, updateEvent } from "@/server/events/events"
import { eventSitemapFile, eventSitemapFiles } from "@/server/events/public"
import { createPost, updatePost } from "@/server/posts/posts"
import { postSitemapFile, postSitemapFiles } from "@/server/posts/public"
import {
  SITEMAP_CHUNK_SIZE,
  directoryListingChunkEntries,
  directorySitemapChunkFiles,
  directorySitemapEntries,
} from "@/server/directory/sitemap"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  resetPublicDirectoryCacheForTests()
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function listing(
  workspaceId: string,
  title: string,
  status: "draft" | "published"
) {
  const row = await createListing(
    workspaceId,
    { title, slug: title.toLowerCase().replaceAll(" ", "-") },
    database
  )
  if (status === "draft") return row
  return updateListing(workspaceId, row.id, { status }, database)
}

/**
 * Enough listings to need two numbered files, written in one statement.
 *
 * The point of the whole feature is what happens either side of the five
 * thousandth address, and there is no way to see that without really having
 * that many.
 */
async function bulkListings(workspaceId: string, count: number) {
  await database.execute(sql`
    INSERT INTO directory_listings
      (id, workspace_id, title, slug, status, contact_links, body,
       created_at, updated_at)
    SELECT
      left(${workspaceId}, 8) || '-' || lpad(n::text, 10, '0'),
      ${workspaceId},
      'Listing ' || n,
      'listing-' || lpad(n::text, 10, '0'),
      'published',
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    FROM generate_series(1, ${count}) AS n
  `)
}

describe("the flat rows a site adds to the shell's sitemap", () => {
  it("is its categories, and never a draft or another site's", async () => {
    const alphaPublished = await listing(alpha, "Alpha open", "published")
    const alphaDraft = await listing(alpha, "Alpha draft", "draft")
    const betaPublished = await listing(beta, "Beta open", "published")

    const alphaOpenCategory = await createCategory(
      alpha,
      { name: "Alpha food", slug: "alpha-food" },
      database
    )
    const alphaDraftCategory = await createCategory(
      alpha,
      { name: "Draft food", slug: "draft-food" },
      database
    )
    const betaCategory = await createCategory(
      beta,
      { name: "Beta food", slug: "beta-food" },
      database
    )

    await setListingCategories(
      alpha,
      alphaPublished.id,
      [alphaOpenCategory.id],
      alphaOpenCategory.id,
      database
    )
    await setListingCategories(
      alpha,
      alphaDraft.id,
      [alphaDraftCategory.id],
      alphaDraftCategory.id,
      database
    )
    await setListingCategories(
      beta,
      betaPublished.id,
      [betaCategory.id],
      betaCategory.id,
      database
    )

    const paths = (await directorySitemapEntries(alpha, database)).map(
      (entry) => entry.path
    )

    expect(paths).toEqual(["/directory/category/alpha-food"])
    expect(paths).not.toContain("/directory/category/draft-food")
    expect(paths).not.toContain("/directory/category/beta-food")
    // Listings are in the numbered files now, never in the flat one.
    expect(paths).not.toContain("/directory/alpha-open")
  })
})

describe("the numbered files an index points at", () => {
  /**
   * One test, because every one of these builds a whole database first. The
   * order is the story: nothing published, then a little, then either side of
   * the file that does not exist.
   */
  it("appears only once there is something to put in it", async () => {
    await listing(alpha, "Alpha draft", "draft")

    // No files means the shell keeps serving one flat /sitemap.xml, which is
    // what every ordinary small site should get.
    expect(await directorySitemapChunkFiles(alpha, database)).toEqual([])
    // File zero is still a real, empty, valid file rather than a 404.
    expect(await directoryListingChunkEntries(alpha, 0, database)).toEqual([])

    await listing(alpha, "Alpha open", "published")
    const newest = await listing(alpha, "Alpha two", "published")

    const files = await directorySitemapChunkFiles(alpha, database)
    expect(files.map((file) => file.path)).toEqual(["/directory-sitemaps/0"])
    expect(files[0]?.updatedAt?.toISOString()).toBe(
      newest.updatedAt.toISOString()
    )

    // Publishing cleared this site's public cache, so this read is fresh.
    expect(
      (await directoryListingChunkEntries(alpha, 0, database))?.map(
        (entry) => entry.path
      )
    ).toEqual(["/directory/alpha-open", "/directory/alpha-two"])

    // Anything past the last file, and anything that is not a file number.
    expect(await directoryListingChunkEntries(alpha, 1, database)).toBeNull()
    expect(await directoryListingChunkEntries(alpha, 42, database)).toBeNull()
    expect(await directoryListingChunkEntries(alpha, -1, database)).toBeNull()
    expect(await directoryListingChunkEntries(alpha, 1.5, database)).toBeNull()

    // A crawler asking for nonsense gets a 404, not a fallen-over server. Five
    // thousand times a nineteen-digit number is more than the database can
    // count to, and it says so by erroring rather than by finding nothing.
    expect(
      await directoryListingChunkEntries(alpha, Number("9999999999999999999"), database)
    ).toBeNull()
  })

  it("splits at five thousand and serves each part", async () => {
    await bulkListings(alpha, SITEMAP_CHUNK_SIZE + 1)

    const files = await directorySitemapChunkFiles(alpha, database)
    expect(files.map((file) => file.path)).toEqual([
      "/directory-sitemaps/0",
      "/directory-sitemaps/1",
    ])

    const first = await directoryListingChunkEntries(alpha, 0, database)
    const second = await directoryListingChunkEntries(alpha, 1, database)

    expect(first).toHaveLength(SITEMAP_CHUNK_SIZE)
    expect(second).toHaveLength(1)
    expect(first?.[0]?.path).toBe("/directory/listing-0000000001")
    expect(second?.[0]?.path).toBe(
      `/directory/listing-${String(SITEMAP_CHUNK_SIZE + 1).padStart(10, "0")}`
    )

    // No address is in two files and none is missed.
    const everything = new Set([
      ...(first ?? []).map((entry) => entry.path),
      ...(second ?? []).map((entry) => entry.path),
    ])
    expect(everything.size).toBe(SITEMAP_CHUNK_SIZE + 1)

    expect(await directoryListingChunkEntries(alpha, 2, database)).toBeNull()
  })

  it("never lets one site's listing into another site's file", async () => {
    await listing(alpha, "Alpha open", "published")
    await listing(beta, "Beta open", "published")

    const alphaPaths = (
      (await directoryListingChunkEntries(alpha, 0, database)) ?? []
    ).map((entry) => entry.path)
    const betaPaths = (
      (await directoryListingChunkEntries(beta, 0, database)) ?? []
    ).map((entry) => entry.path)

    expect(alphaPaths).toEqual(["/directory/alpha-open"])
    expect(betaPaths).toEqual(["/directory/beta-open"])
  })
})

describe("events and posts in numbered files", () => {
  // A Saturday in the middle of the bulk events' run, so none is past its 30
  // days and every one is listed.
  const at = new Date("2026-09-26T16:00:00Z")

  async function bulkEvents(workspaceId: string, count: number) {
    await database.execute(sql`
      INSERT INTO events
        (id, workspace_id, title, slug, body, status, visibility, start_date,
         start_time, published_at, created_at, updated_at)
      SELECT
        left(${workspaceId}, 8) || '-' || lpad(n::text, 10, '0'),
        ${workspaceId},
        'Event ' || n,
        'event-' || lpad(n::text, 10, '0'),
        '{}'::jsonb,
        'published',
        'public',
        '2026-10-01',
        '18:00',
        now(),
        timestamp '2026-01-01' + n * interval '1 second',
        now()
      FROM generate_series(1, ${count}) AS n
    `)
  }

  async function event(
    workspaceId: string,
    title: string,
    patch: { status: "draft" | "published"; visibility?: "public" | "private" }
  ) {
    const created = await createEvent(
      workspaceId,
      { title, when: { startDate: "2026-10-01", startTime: "18:00" } },
      database
    )
    return updateEvent(workspaceId, created.id, patch, database)
  }

  async function post(
    workspaceId: string,
    title: string,
    status: "draft" | "published"
  ) {
    const created = await createPost(workspaceId, { title }, database)
    return updatePost(workspaceId, created.id, { status }, database)
  }

  async function paths(
    read: (chunk: number) => Promise<readonly { path: string }[] | null>,
    chunk: number
  ) {
    return ((await read(chunk)) ?? []).map((entry) => entry.path)
  }

  it("splits eleven thousand events into three files, and the index lists each once", async () => {
    await bulkEvents(alpha, 11_000)

    const files = await eventSitemapFiles(alpha, database, at)
    expect(files.map((file) => file.path)).toEqual([
      "/event-sitemaps/0",
      "/event-sitemaps/1",
      "/event-sitemaps/2",
    ])

    const read = (chunk: number) =>
      eventSitemapFile(alpha, chunk, database, at)
    const first = await paths(read, 0)
    const second = await paths(read, 1)
    const third = await paths(read, 2)
    expect([first.length, second.length, third.length]).toEqual([
      SITEMAP_CHUNK_SIZE,
      SITEMAP_CHUNK_SIZE,
      1000,
    ])
    // Oldest first, so the newest events are at the end of the last file.
    expect(first[0]).toBe("/events/event-0000000001")
    expect(third.at(-1)).toBe("/events/event-0000011000")
    expect(new Set([...first, ...second, ...third]).size).toBe(11_000)

    // Every file the index names answers, and nothing past the last does.
    expect(await read(3)).toBeNull()
  })

  it("puts a dozen posts in one file that is not empty", async () => {
    for (let n = 1; n <= 12; n += 1) await post(alpha, `Post ${n}`, "published")

    const files = await postSitemapFiles(alpha, database)
    expect(files.map((file) => file.path)).toEqual(["/post-sitemaps/0"])
    expect(files[0]?.updatedAt).toBeInstanceOf(Date)

    const read = (chunk: number) => postSitemapFile(alpha, chunk, database)
    expect(await paths(read, 0)).toHaveLength(12)
    expect(await read(1)).toBeNull()
  })

  it("never lists a private event or a draft post, nor counts a file for them", async () => {
    await event(alpha, "Members market", {
      status: "published",
      visibility: "private",
    })
    await event(alpha, "Unfinished market", { status: "draft" })
    await post(alpha, "Unfinished post", "draft")

    expect(await eventSitemapFiles(alpha, database, at)).toEqual([])
    expect(await postSitemapFiles(alpha, database)).toEqual([])
    // File zero still answers, empty, rather than a 404.
    expect(await eventSitemapFile(alpha, 0, database, at)).toEqual([])
    expect(await postSitemapFile(alpha, 0, database)).toEqual([])

    const open = await event(alpha, "Night market", { status: "published" })
    const published = await post(alpha, "Night market guide", "published")
    expect(
      await paths((chunk) => eventSitemapFile(alpha, chunk, database, at), 0)
    ).toEqual([`/events/${open.slug}`])
    expect(
      await paths((chunk) => postSitemapFile(alpha, chunk, database), 0)
    ).toEqual([`/posts/${published.slug}`])

    // Another site's are never in this site's files.
    expect(await eventSitemapFile(beta, 0, database, at)).toEqual([])
    expect(await postSitemapFile(beta, 0, database)).toEqual([])
  })
})
