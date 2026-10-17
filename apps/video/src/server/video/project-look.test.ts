import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE } from "@/lib/video/visual-style"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { readProjectLook } from "@/server/video/project-look"
import {
  createOwnedProject,
  duplicateOwnedProject,
  listOwnedProjects,
  saveOwnedProjectSettings,
  writeProjectTimeline,
} from "@/server/video/projects"
import { videoProjects } from "@/server/video/schema"

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  getPublicMediaUrl: async (storagePath: string) =>
    `https://media.test/${storagePath}`,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
})

async function insertMedia(
  id: string,
  { userId = user.id, fileType = "image" } = {}
) {
  const timestamp = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId,
    filename: `${id}.png`,
    originalName: `${id}.png`,
    altText: null,
    fileSize: 8,
    mimeType: fileType === "image" ? "image/png" : "video/mp4",
    fileType,
    storagePath: `${userId}/${id}.png`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return `https://media.test/${userId}/${id}.png`
}

function settings(
  projectId: string,
  look: { style?: string | null; lookPictureUrl?: string | null }
) {
  return saveOwnedProjectSettings(
    user.id,
    projectId,
    {
      name: "Explainer",
      style: look.style ?? null,
      lookPictureUrl: look.lookPictureUrl ?? null,
      spendLimitCents: null,
    },
    database
  )
}

describe("saving a project's settings", () => {
  it("keeps the name, the trimmed style and the picture's library id", async () => {
    const url = await insertMedia("look-1")
    const project = await createOwnedProject(user.id, "Old name", database)
    const saved = await settings(project.id, {
      style: "  Flat illustration, warm palette  ",
      lookPictureUrl: url,
    })
    expect(saved.name).toBe("Explainer")
    expect(saved.look).toEqual({
      style: "Flat illustration, warm palette",
      picture_url: url,
    })
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, project.id))
    expect(row.styleMediaId).toBe("look-1")
  })

  it("never moves the timeline's version, so an open editor keeps saving", async () => {
    const project = await createOwnedProject(user.id, "Explainer", database)
    await settings(project.id, { style: "Clay" })
    const saved = await writeProjectTimeline(
      user.id,
      project.id,
      { aspect: "9:16", tracks: [] },
      project.version,
      database
    )
    expect(saved.version).toBe(project.version + 1)
    expect(saved.look?.style).toBe("Clay")
  })

  it("refuses somebody else's picture, and anything that is not a picture", async () => {
    const stranger = await insertUser(database, { email: "other@example.test" })
    const theirs = await insertMedia("theirs", { userId: stranger.id })
    const clip = await insertMedia("clip", { fileType: "video" })
    const project = await createOwnedProject(user.id, "Explainer", database)
    await expect(settings(project.id, { lookPictureUrl: theirs })).rejects.toThrow(
      LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE
    )
    await expect(settings(project.id, { lookPictureUrl: clip })).rejects.toThrow(
      LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE
    )
  })

  it("clears the look when both are empty", async () => {
    const url = await insertMedia("look-1")
    const project = await createOwnedProject(user.id, "Explainer", database)
    await settings(project.id, { style: "Clay", lookPictureUrl: url })
    const cleared = await settings(project.id, { style: "   " })
    expect(cleared.look).toBeNull()
  })

  it("never saves into somebody else's project", async () => {
    const project = await createOwnedProject(user.id, "Explainer", database)
    const stranger = await insertUser(database, { email: "other@example.test" })
    await expect(
      saveOwnedProjectSettings(
        stranger.id,
        project.id,
        { name: "Mine now", style: "Clay", lookPictureUrl: null, spendLimitCents: null },
        database
      )
    ).rejects.toThrow("Project not found")
  })
})

describe("a project's look elsewhere", () => {
  it("is on every row of the projects list, and null with none", async () => {
    const url = await insertMedia("look-1")
    const styled = await createOwnedProject(user.id, "Styled", database)
    await createOwnedProject(user.id, "Plain", database)
    await settings(styled.id, { style: "Clay", lookPictureUrl: url })
    const { projects } = await listOwnedProjects({ userId: user.id, database })
    expect(
      Object.fromEntries(projects.map((project) => [project.name, project.look]))
    ).toEqual({
      Explainer: { style: "Clay", picture_url: url },
      Plain: null,
    })
  })

  it("goes with a duplicate, so a series can start from the same look", async () => {
    const url = await insertMedia("look-1")
    const project = await createOwnedProject(user.id, "Episode 1", database)
    await settings(project.id, { style: "Clay", lookPictureUrl: url })
    const copy = await duplicateOwnedProject(user.id, project.id, database)
    expect(copy.look).toEqual({ style: "Clay", picture_url: url })
  })

  it("loses only the picture when the picture is deleted", async () => {
    const url = await insertMedia("look-1")
    const project = await createOwnedProject(user.id, "Explainer", database)
    await settings(project.id, { style: "Clay", lookPictureUrl: url })
    await database.delete(customShellMedia).where(eq(customShellMedia.id, "look-1"))
    const look = await readProjectLook(user.id, project.id, database)
    expect(look).toEqual({ style: "Clay", picture: null })
  })
})

describe("a project's look, read for the AI tools", () => {
  it("hands back the style and the picture's stored file", async () => {
    const url = await insertMedia("look-1")
    const project = await createOwnedProject(user.id, "Explainer", database)
    await settings(project.id, { style: "Clay", lookPictureUrl: url })
    const look = await readProjectLook(user.id, project.id, database)
    expect(look.style).toBe("Clay")
    expect(look.picture?.storagePath).toBe(`${user.id}/look-1.png`)
  })

  it("is empty for a project with no look", async () => {
    const project = await createOwnedProject(user.id, "Old", database)
    expect(await readProjectLook(user.id, project.id, database)).toEqual({
      style: null,
      picture: null,
    })
  })

  it("never reads somebody else's project", async () => {
    const project = await createOwnedProject(user.id, "Explainer", database)
    const stranger = await insertUser(database, { email: "other@example.test" })
    await expect(
      readProjectLook(stranger.id, project.id, database)
    ).rejects.toThrow("Project not found")
  })
})
