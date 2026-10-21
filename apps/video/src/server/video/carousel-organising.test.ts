import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CAROUSEL_NOT_FOUND_MESSAGE } from "@/lib/video/carousel-schema"
import { BREAK_MS, KEEP_VERSIONS } from "@/lib/video/project-versions"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  carouselVersionDue,
  listOwnedCarouselVersions,
  restoreOwnedCarouselVersion,
} from "@/server/video/carousel-versions"
import {
  createCarouselFromTemplate,
  createOwnedCarousel,
  duplicateOwnedCarousel,
  getOwnedCarouselDetail,
  listOwnedTemplates,
  listProjectCarousels,
  setCarouselTemplate,
  writeCarousel,
} from "@/server/video/carousels"
import {
  createOwnedProject,
  deleteOwnedProjects,
  summarizeProjectDelete,
} from "@/server/video/projects"
import { videoCarousels, videoCarouselVersions } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let stranger: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  stranger = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

async function renameFirstText(carouselId: string, text: string) {
  const detail = await getOwnedCarouselDetail(user.id, carouselId, database)
  const [slide] = detail.slides
  return writeCarousel(
    user.id,
    carouselId,
    {
      slides: [
        {
          ...slide,
          items: slide.items.map((item) =>
            item.type === "text" ? { ...item, text } : item
          ),
        },
      ],
      format: detail.format,
      caption: detail.caption,
      expectedVersion: detail.version,
    },
    database
  )
}

// Pretend the last save was long ago, so the next save keeps a version.
async function ageCarousel(carouselId: string, ms: number) {
  const past = new Date(Date.now() - ms)
  await database
    .update(videoCarousels)
    .set({ updatedAt: past, createdAt: past })
    .where(eq(videoCarousels.id, carouselId))
  // Versions kept so far are older still, as they would be by then.
  await database
    .update(videoCarouselVersions)
    .set({ createdAt: new Date(past.getTime() - 1000) })
    .where(eq(videoCarouselVersions.carouselId, carouselId))
}

describe("templates", () => {
  it("copies a template into a new carousel and leaves the template alone", async () => {
    const template = await createOwnedCarousel(user.id, "Tips layout", database)
    await renameFirstText(template.id, "Template words")
    await setCarouselTemplate(user.id, template.id, true, database)
    expect((await listOwnedTemplates(user.id, database)).map((item) => item.id)).toEqual([
      template.id,
    ])

    const made = await createCarouselFromTemplate(user.id, template.id, "Monday tips", database)
    expect(made).toMatchObject({ name: "Monday tips", is_template: false })
    const copy = await getOwnedCarouselDetail(user.id, made.id, database)
    const original = await getOwnedCarouselDetail(user.id, template.id, database)
    expect(copy.slides[0].items[0]).toMatchObject({ text: "Template words" })
    // New ids, so editing the copy can never touch the template.
    expect(copy.slides[0].id).not.toBe(original.slides[0].id)

    await renameFirstText(made.id, "Changed in the copy")
    const after = await getOwnedCarouselDetail(user.id, template.id, database)
    expect(after.slides[0].items[0]).toMatchObject({ text: "Template words" })
  })

  it("refuses a carousel that is not a template, and somebody else's", async () => {
    const plain = await createOwnedCarousel(user.id, "Plain", database)
    await expect(
      createCarouselFromTemplate(user.id, plain.id, "Copy", database)
    ).rejects.toThrow(CAROUSEL_NOT_FOUND_MESSAGE)
    await setCarouselTemplate(user.id, plain.id, true, database)
    await expect(
      createCarouselFromTemplate(stranger.id, plain.id, "Copy", database)
    ).rejects.toThrow(CAROUSEL_NOT_FOUND_MESSAGE)
    expect(await listOwnedTemplates(stranger.id, database)).toEqual([])
  })

  it("does not pass the template mark on to a duplicate", async () => {
    const template = await createOwnedCarousel(user.id, "Layout", database)
    await setCarouselTemplate(user.id, template.id, true, database)
    const copy = await duplicateOwnedCarousel(user.id, template.id, undefined, database)
    expect(copy.is_template).toBe(false)
  })
})

describe("carousels in projects", () => {
  async function projectWithCarousels() {
    const project = await createOwnedProject(user.id, "Launch", database)
    const carousel = await createOwnedCarousel(user.id, "Launch carousel", database)
    await database
      .update(videoCarousels)
      .set({ projectId: project.id })
      .where(eq(videoCarousels.id, carousel.id))
    return { project, carousel }
  }

  it("lists a project's carousels and counts them for the delete window", async () => {
    const { project, carousel } = await projectWithCarousels()
    await createOwnedCarousel(user.id, "Somewhere else", database)
    expect(
      (await listProjectCarousels(user.id, project.id, database)).map((item) => item.id)
    ).toEqual([carousel.id])
    expect(await summarizeProjectDelete(user.id, [project.id], database)).toMatchObject({
      carousels: 1,
    })
    await expect(
      listProjectCarousels(stranger.id, project.id, database)
    ).rejects.toThrow()
  })

  it("keeps the carousels, with no project, when the delete window says keep", async () => {
    const { project, carousel } = await projectWithCarousels()
    await deleteOwnedProjects(user.id, [project.id], database, false)
    const kept = await getOwnedCarouselDetail(user.id, carousel.id, database)
    expect(kept.project_id).toBeNull()
  })

  it("deletes the carousels too when the delete window says delete", async () => {
    const { project, carousel } = await projectWithCarousels()
    await deleteOwnedProjects(user.id, [project.id], database, true)
    await expect(
      getOwnedCarouselDetail(user.id, carousel.id, database)
    ).rejects.toThrow(CAROUSEL_NOT_FOUND_MESSAGE)
  })
})

describe("earlier versions", () => {
  it("follows the projects' rule: after a break, then hourly", () => {
    const at = new Date("2099-01-01T12:00:00Z")
    const createdAt = new Date("2099-01-01T11:50:00Z")
    expect(
      carouselVersionDue(
        { createdAt, updatedAt: new Date(at.getTime() - BREAK_MS) },
        null,
        at
      )
    ).toBe("break")
    expect(
      carouselVersionDue({ createdAt, updatedAt: new Date(at.getTime() - 1000) }, null, at)
    ).toBeNull()
    expect(
      carouselVersionDue(
        { createdAt: new Date("2099-01-01T10:00:00Z"), updatedAt: new Date(at.getTime() - 1000) },
        null,
        at
      )
    ).toBe("hourly")
  })

  it("keeps yesterday's slides when today's first save replaces them", async () => {
    const carousel = await createOwnedCarousel(user.id, "Post", database)
    await renameFirstText(carousel.id, "Yesterday")
    await ageCarousel(carousel.id, BREAK_MS + 60_000)
    await renameFirstText(carousel.id, "Today")

    const versions = await listOwnedCarouselVersions(user.id, carousel.id, database)
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ reason: "break", slide_count: 1 })
    expect(versions[0].slides[0].items[0]).toMatchObject({ text: "Yesterday" })
    expect(await listOwnedCarouselVersions(stranger.id, carousel.id, database)).toEqual([])
  })

  it("brings a version back and keeps what was there first", async () => {
    const carousel = await createOwnedCarousel(user.id, "Post", database)
    await renameFirstText(carousel.id, "Yesterday")
    await ageCarousel(carousel.id, BREAK_MS + 60_000)
    await renameFirstText(carousel.id, "Today")
    const [version] = await listOwnedCarouselVersions(user.id, carousel.id, database)
    const before = await getOwnedCarouselDetail(user.id, carousel.id, database)

    const restored = await restoreOwnedCarouselVersion(
      user.id,
      carousel.id,
      version.id,
      database
    )
    expect(restored.version).toBe(before.version + 1)
    const after = await getOwnedCarouselDetail(user.id, carousel.id, database)
    expect(after.slides[0].items[0]).toMatchObject({ text: "Yesterday" })
    const versions = await listOwnedCarouselVersions(user.id, carousel.id, database)
    expect(versions[0]).toMatchObject({ reason: "restore" })
    expect(versions[0].slides[0].items[0]).toMatchObject({ text: "Today" })
    await expect(
      restoreOwnedCarouselVersion(stranger.id, carousel.id, version.id, database)
    ).rejects.toThrow(CAROUSEL_NOT_FOUND_MESSAGE)
  })

  it(`keeps no more than the newest ${KEEP_VERSIONS}`, async () => {
    const carousel = await createOwnedCarousel(user.id, "Post", database)
    for (let index = 0; index < KEEP_VERSIONS + 3; index += 1) {
      await renameFirstText(carousel.id, `Take ${index}`)
      await ageCarousel(carousel.id, BREAK_MS + 60_000)
    }
    const rows = await database
      .select({ id: videoCarouselVersions.id })
      .from(videoCarouselVersions)
      .where(eq(videoCarouselVersions.carouselId, carousel.id))
    expect(rows).toHaveLength(KEEP_VERSIONS)
  })
})
