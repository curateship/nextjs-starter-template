import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  CAROUSEL_CONFLICT_MESSAGE,
  CAROUSEL_NOT_FOUND_MESSAGE,
} from "@/lib/video/carousel-schema"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createOwnedCarousel,
  deleteOwnedCarousels,
  duplicateOwnedCarousel,
  getOwnedCarouselDetail,
  listOwnedCarousels,
  writeCarousel,
} from "@/server/video/carousels"
import { videoCarousels } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

describe("carousels", () => {
  it("creates a validated starter carousel at version 1", async () => {
    const created = await createOwnedCarousel(
      user.id,
      "  Swipe   post  ",
      database
    )
    expect(created.name).toBe("Swipe post")
    expect(created.format).toBe("4:5")
    expect(created.slide_count).toBe(1)
    expect(created.version).toBe(1)

    const detail = await getOwnedCarouselDetail(user.id, created.id, database)
    expect(detail.slides[0].items[0]).toMatchObject({ type: "text" })
  })

  it("saves only validated slides and keeps format beside them", async () => {
    const created = await createOwnedCarousel(user.id, "Post", database)
    const detail = await getOwnedCarouselDetail(user.id, created.id, database)
    const saved = await writeCarousel(
      user.id,
      created.id,
      {
        slides: detail.slides,
        format: "1:1",
        caption: "Read the full story.",
        expectedVersion: detail.version,
      },
      database
    )
    expect(saved.format).toBe("1:1")
    expect(saved.version).toBe(2)

    await expect(
      writeCarousel(
        user.id,
        created.id,
        {
          slides: [{ nope: true }] as never,
          format: "4:5",
          caption: "",
          expectedVersion: saved.version,
        },
        database
      )
    ).rejects.toThrow()
  })

  it("refuses a stale tab without overwriting the newer save", async () => {
    const created = await createOwnedCarousel(user.id, "Post", database)
    const detail = await getOwnedCarouselDetail(user.id, created.id, database)
    await writeCarousel(
      user.id,
      created.id,
      {
        slides: detail.slides,
        format: "1:1",
        caption: "First tab",
        expectedVersion: detail.version,
      },
      database
    )
    await expect(
      writeCarousel(
        user.id,
        created.id,
        {
          slides: detail.slides,
          format: "9:16",
          caption: "Second tab",
          expectedVersion: detail.version,
        },
        database
      )
    ).rejects.toThrowError(CAROUSEL_CONFLICT_MESSAGE)

    const [row] = await database
      .select()
      .from(videoCarousels)
      .where(eq(videoCarousels.id, created.id))
    expect(row.format).toBe("1:1")
    expect(row.caption).toBe("First tab")
  })

  it("keeps every read and write inside its owner", async () => {
    const stranger = await insertUser(database)
    const theirs = await createOwnedCarousel(stranger.id, "Theirs", database)
    await expect(
      getOwnedCarouselDetail(user.id, theirs.id, database)
    ).rejects.toThrowError(CAROUSEL_NOT_FOUND_MESSAGE)
    expect(
      (await deleteOwnedCarousels(user.id, [theirs.id], database)).deleted_ids
    ).toEqual([])
  })

  it("duplicates into an independent version-1 document", async () => {
    const created = await createOwnedCarousel(user.id, "Post", database)
    const copy = await duplicateOwnedCarousel(user.id, created.id, database)
    expect(copy.name).toBe("Post copy")
    expect(copy.id).not.toBe(created.id)
    expect(copy.version).toBe(1)
    expect(copy.slide_count).toBe(created.slide_count)
  })

  it("searches names literally and lists only the owner", async () => {
    await createOwnedCarousel(user.id, "100% useful", database)
    await createOwnedCarousel(user.id, "Another post", database)
    const stranger = await insertUser(database)
    await createOwnedCarousel(stranger.id, "100% theirs", database)

    const result = await listOwnedCarousels({
      userId: user.id,
      search: "100%",
      database,
    })
    expect(result.carousels.map((item) => item.name)).toEqual(["100% useful"])
  })
})
