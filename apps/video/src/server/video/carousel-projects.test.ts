import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CAROUSEL_PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/carousel-projects"
import { CAROUSEL_NOT_FOUND_MESSAGE } from "@/lib/video/carousel-schema"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import {
  createCarouselFolder,
  createOwnedCarouselProject,
  deleteOwnedCarouselProjects,
  duplicateOwnedCarouselProject,
  listOwnedCarouselProjects,
  moveCarouselProjectsToFolder,
  saveCarouselProjectSettings,
  setCarouselProjectsArchived,
  summarizeCarouselProjectDelete,
} from "@/server/video/carousel-projects"
import {
  carouselProjectOf,
  createCarouselFromTemplate,
  createOwnedCarousel,
  duplicateOwnedCarousel,
  getOwnedCarouselDetail,
  listOwnedTemplates,
  listProjectCarousels,
  moveCarousels,
  openProjectCarousel,
  rememberOpenCarousel,
  setCarouselPinned,
  setCarouselsArchived,
  setCarouselStatus,
  setCarouselTemplate,
  writeCarousel,
} from "@/server/video/carousels"
import { attachMediaToScope, mediaIdsForScope } from "@/server/video/media-list"
import { videoCarousels } from "@/server/video/schema"

/**
 * Carousel projects hold many carousels (workspace/tasks/projects/
 * 01-projects-hold-many.md, section B; workspace/docs/carousel-project-carousels.md).
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date("2026-11-01T09:00:00Z"), toFake: ["Date"] })
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  vi.useRealTimers()
  await client.close()
})

/** Moves the clock on, so each new or changed carousel has its own time. */
function later(minutes = 1) {
  vi.setSystemTime(new Date(Date.now() + minutes * 60_000))
}

async function newProject(name = "Weekly tips") {
  return createOwnedCarouselProject(user.id, name, null, database)
}

describe("a carousel project", () => {
  it("starts with one carousel named after it", async () => {
    const made = await newProject()
    const opened = await openProjectCarousel({ userId: user.id, projectId: made.project.id, database })
    expect(opened).toMatchObject({ id: made.carousel, name: "Weekly tips", carousel_project_id: made.project.id })
    expect(made.project).toMatchObject({ carousel_count: 1, slide_count: 1, formats: ["4:5"] })
  })

  it("holds 500 carousels and lists them 200 at a time", async () => {
    const { project } = await newProject()
    const at = now()
    const [first] = await database.select().from(videoCarousels).where(eq(videoCarousels.carouselProjectId, project.id))
    await database.insert(videoCarousels).values(
      Array.from({ length: 499 }, (_, index) => ({
        ...first,
        id: uuid(),
        name: `Carousel ${index}`,
        createdAt: at,
        updatedAt: at,
      }))
    )
    const page = await listProjectCarousels({ userId: user.id, projectId: project.id, database })
    expect([page.total, page.carousels.length, page.total_pages]).toEqual([500, 200, 3])
  })

  it("searches, filters by status and keeps pinned carousels on top", async () => {
    const { project } = await newProject("Tips")
    later()
    const pricing = await createOwnedCarousel(user.id, project.id, "Pricing 100%", "4:5", database)
    later()
    const hooks = await createOwnedCarousel(user.id, project.id, "Hooks", "1:1", database)
    await setCarouselStatus(user.id, hooks.id, "posted", database)
    await setCarouselPinned(user.id, pricing.id, true, database)
    const names = async (options: Partial<Parameters<typeof listProjectCarousels>[0]>) =>
      (await listProjectCarousels({ userId: user.id, projectId: project.id, database, ...options })).carousels.map(
        (carousel) => carousel.name
      )
    expect(await names({ search: "100%" })).toEqual(["Pricing 100%"])
    expect(await names({ status: "posted" })).toEqual(["Hooks"])
    expect(await names({})).toEqual(["Pricing 100%", "Hooks", "Tips"])
    expect(await names({ sort: "name" })).toEqual(["Pricing 100%", "Hooks", "Tips"])
  })

  it("archives carousels, takes their pin off, and brings them back", async () => {
    const made = await newProject()
    await setCarouselPinned(user.id, made.carousel, true, database)
    const result = await setCarouselsArchived(user.id, [made.carousel, made.carousel], true, database)
    expect(result).toEqual({ done_ids: [made.carousel], skipped_ids: [] })
    const listed = await listProjectCarousels({ userId: user.id, projectId: made.project.id, archived: true, database })
    expect(listed.carousels[0]).toMatchObject({ archived: true, pinned: false })
    await setCarouselsArchived(user.id, [made.carousel], false, database)
    expect((await listProjectCarousels({ userId: user.id, projectId: made.project.id, database })).total).toBe(1)
  })

  it("never shows one person's carousels to another", async () => {
    const made = await newProject()
    const stranger = await insertUser(database)
    await expect(
      listProjectCarousels({ userId: stranger.id, projectId: made.project.id, database })
    ).rejects.toThrow(CAROUSEL_PROJECT_NOT_FOUND_MESSAGE)
    await expect(
      createOwnedCarousel(stranger.id, made.project.id, "Mine now", "4:5", database)
    ).rejects.toThrow(CAROUSEL_PROJECT_NOT_FOUND_MESSAGE)
    expect(await carouselProjectOf(stranger.id, made.carousel, database)).toBeNull()
  })
})

describe("opening a carousel project", () => {
  it("opens the one named, else the one last open, else the first", async () => {
    const made = await newProject()
    later()
    const second = await createOwnedCarousel(user.id, made.project.id, "Second", "4:5", database)
    const open = (carouselId?: string) =>
      openProjectCarousel({ userId: user.id, projectId: made.project.id, carouselId, database })
    // First open: the first in the tab's order, the last edited.
    expect((await open())?.id).toBe(second.id)
    await rememberOpenCarousel(user.id, made.carousel, database)
    expect((await open())?.id).toBe(made.carousel)
    expect((await open(second.id))?.id).toBe(second.id)
    await expect(open(uuid())).rejects.toThrow(CAROUSEL_NOT_FOUND_MESSAGE)
  })

  it("answers null for a project with no carousels, and writes nothing", async () => {
    const made = await newProject()
    await database.delete(videoCarousels).where(eq(videoCarousels.id, made.carousel))
    expect(await openProjectCarousel({ userId: user.id, projectId: made.project.id, database })).toBeNull()
    expect((await listProjectCarousels({ userId: user.id, projectId: made.project.id, database })).total).toBe(0)
  })

  it("finds the project of a carousel from an old address", async () => {
    const made = await newProject()
    expect(await carouselProjectOf(user.id, made.carousel, database)).toBe(made.project.id)
  })
})

describe("copies and moves", () => {
  it("puts a duplicate in the same project, just under its original", async () => {
    const made = await newProject()
    later()
    const other = await createOwnedCarousel(user.id, made.project.id, "Other", "4:5", database)
    later()
    await setCarouselStatus(user.id, made.carousel, "ready", database)
    // The original was changed last, then the copy sits right under it.
    await database
      .update(videoCarousels)
      .set({ updatedAt: now() })
      .where(eq(videoCarousels.id, made.carousel))
    const copy = await duplicateOwnedCarousel(user.id, made.carousel, undefined, database)
    expect(copy).toMatchObject({ carousel_project_id: made.project.id, name: "Weekly tips copy", status: "ready" })
    const order = (await listProjectCarousels({ userId: user.id, projectId: made.project.id, database })).carousels
    expect(order.map((carousel) => carousel.id)).toEqual([made.carousel, copy.id, other.id])
  })

  it("moves carousels to another project and forgets them as last open", async () => {
    const from = await newProject("From")
    const to = await newProject("To")
    await rememberOpenCarousel(user.id, from.carousel, database)
    const result = await moveCarousels(user.id, [from.carousel, to.carousel], to.project.id, database)
    expect(result).toEqual({ done_ids: [from.carousel], skipped_ids: [to.carousel] })
    expect(await carouselProjectOf(user.id, from.carousel, database)).toBe(to.project.id)
    expect(await openProjectCarousel({ userId: user.id, projectId: from.project.id, database })).toBeNull()
  })

  it("copies a whole project with every carousel and its shelf", async () => {
    const made = await newProject()
    await createOwnedCarousel(user.id, made.project.id, "Second", "1:1", database)
    const copy = await duplicateOwnedCarouselProject(user.id, made.project.id, database)
    expect(copy).toMatchObject({ name: "Weekly tips copy", carousel_count: 2 })
    const original = (await listProjectCarousels({ userId: user.id, projectId: made.project.id, database })).carousels
    const copied = (await listProjectCarousels({ userId: user.id, projectId: copy.id, database })).carousels
    expect(copied.map((carousel) => carousel.name).sort()).toEqual(original.map((carousel) => carousel.name).sort())
    expect(copied.some((carousel) => original.some((item) => item.id === carousel.id))).toBe(false)
  })
})

describe("what the project gives a new carousel", () => {
  it("starts a new carousel in the project's look, with the caption footer", async () => {
    const { project } = await newProject()
    await saveCarouselProjectSettings(
      user.id,
      project.id,
      {
        name: "Weekly tips",
        look: { fontId: "playfair-display", textColor: "#ff0000", backgroundColor: "#123456", outlineWidth: 2 },
        captionFooter: "  #tips #fitness ",
      },
      database
    )
    const made = await createOwnedCarousel(user.id, project.id, "Monday", "1:1", database)
    const detail = await getOwnedCarouselDetail(user.id, made.id, database)
    expect(detail.caption).toBe("#tips #fitness")
    expect(detail.slides[0].backgroundColor).toBe("#123456")
    expect(detail.slides[0].items[0]).toMatchObject({
      fontId: "playfair-display",
      color: "#ff0000",
      outlineWidth: 2,
    })
  })

  it("keeps a template's design but adds the footer, and keeps a copy as it was", async () => {
    const { project } = await newProject()
    const template = await createOwnedCarousel(user.id, project.id, "Layout", "4:5", database)
    await setCarouselTemplate(user.id, template.id, true, database)
    await saveCarouselProjectSettings(
      user.id,
      project.id,
      { name: "Weekly tips", look: { backgroundColor: "#123456" }, captionFooter: "#tips" },
      database
    )
    const fromTemplate = await getOwnedCarouselDetail(
      user.id,
      (await createCarouselFromTemplate(user.id, project.id, template.id, "Monday", database)).id,
      database
    )
    expect(fromTemplate.slides[0].backgroundColor).toBe("#111827")
    expect(fromTemplate.caption).toBe("#tips")
    const copy = await getOwnedCarouselDetail(
      user.id,
      (await duplicateOwnedCarousel(user.id, template.id, undefined, database)).id,
      database
    )
    expect([copy.slides[0].backgroundColor, copy.caption]).toEqual(["#111827", ""])
  })

  it("offers the project's own templates first", async () => {
    const here = await newProject("Here")
    later()
    const there = await newProject("There")
    await setCarouselTemplate(user.id, here.carousel, true, database)
    later()
    await setCarouselTemplate(user.id, there.carousel, true, database)
    await database.update(videoCarousels).set({ updatedAt: now() }).where(eq(videoCarousels.id, there.carousel))
    const ids = async (projectId: string | null) =>
      (await listOwnedTemplates(user.id, projectId, database)).map((template) => template.id)
    expect(await ids(here.project.id)).toEqual([here.carousel, there.carousel])
    expect(await ids(null)).toEqual([there.carousel, here.carousel])
  })

  it("shares one picture shelf across the project's carousels", async () => {
    const made = await newProject()
    const other = await createOwnedCarousel(user.id, made.project.id, "Other", "4:5", database)
    const elsewhere = await newProject("Elsewhere")
    const workspaceId = (await insertWorkspace(database, { userId: user.id })).id
    const at = now()
    const [picture] = await database
      .insert(customShellMedia)
      .values({
        id: uuid(),
        workspaceId,
        userId: user.id,
        filename: "a.png",
        originalName: "a.png",
        fileSize: 8,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${user.id}/a.png`,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    await attachMediaToScope(user.id, { type: "carousel", id: made.carousel }, picture.id, database)
    const shelf = (carouselId: string) =>
      mediaIdsForScope(user.id, { type: "carousel", id: carouselId }, database)
    expect(await shelf(other.id)).toEqual([picture.id])
    expect(await shelf(elsewhere.carousel)).toEqual([])
  })
})

describe("the carousel projects table", () => {
  it("lists pinned first, files into folders and archives whole projects", async () => {
    const a = await newProject("A")
    later()
    const b = await newProject("B")
    const folder = await createCarouselFolder(user.id, "Clients", database)
    await moveCarouselProjectsToFolder(user.id, [a.project.id], folder.id, database)
    const names = async (options: Partial<Parameters<typeof listOwnedCarouselProjects>[0]> = {}) =>
      (await listOwnedCarouselProjects({ userId: user.id, database, ...options })).projects.map((project) => project.name)
    expect(await names()).toEqual(["B", "A"])
    expect(await names({ folderId: folder.id })).toEqual(["A"])
    expect(await names({ folderId: null })).toEqual(["B"])
    await setCarouselProjectsArchived(user.id, [b.project.id], true, database)
    expect(await names()).toEqual(["A"])
    expect(await names({ archived: true })).toEqual(["B"])
  })

  it("moves a project to the top when one of its carousels is saved", async () => {
    const older = await newProject("Older")
    later()
    await newProject("Newer")
    later()
    const detail = await getOwnedCarouselDetail(user.id, older.carousel, database)
    await writeCarousel(
      user.id,
      older.carousel,
      { slides: detail.slides, format: detail.format, caption: "Edited", expectedVersion: detail.version },
      database
    )
    const names = (await listOwnedCarouselProjects({ userId: user.id, database })).projects.map(
      (project) => project.name
    )
    expect(names).toEqual(["Older", "Newer"])
  })

  it("counts what a delete takes, then deletes every carousel in the project", async () => {
    const made = await newProject()
    await createOwnedCarousel(user.id, made.project.id, "Second", "4:5", database)
    expect(await summarizeCarouselProjectDelete(user.id, [made.project.id], database)).toEqual({
      carousels: 2,
      exports: 0,
    })
    const stranger = await insertUser(database)
    expect(await deleteOwnedCarouselProjects(stranger.id, [made.project.id], database)).toEqual({ deleted_ids: [] })
    expect(await deleteOwnedCarouselProjects(user.id, [made.project.id], database)).toEqual({
      deleted_ids: [made.project.id],
    })
    expect(await database.select().from(videoCarousels)).toEqual([])
  })
})
