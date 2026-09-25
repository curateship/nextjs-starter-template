import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  FOLDER_NAME_REQUIRED_MESSAGE,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
} from "@/lib/video/project-folders"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createOwnedFolder,
  deleteOwnedFolder,
  listOwnedFolders,
  moveOwnedProjectsToFolder,
  renameOwnedFolder,
} from "@/server/video/project-folders"
import {
  createOwnedProject,
  deleteOwnedProjects,
  duplicateOwnedProject,
  listOwnedProjects,
} from "@/server/video/projects"
import { videoProjectFolderItems, videoProjects } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

// Listing projects builds picture addresses, which need the R2 base.
const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
  if (originalR2PublicUrl === undefined) {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  } else {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
  }
})

async function listedNames(folderId?: string | null) {
  const listed = await listOwnedProjects({
    userId: user.id,
    folderId,
    database,
  })
  return listed.projects.map((project) => project.name).sort()
}

describe("project folders", () => {
  it("lists by name, ignoring case, and counts projects", async () => {
    const beta = await createOwnedFolder(user.id, "beta", database)
    await createOwnedFolder(user.id, "Alpha", database)
    const project = await createOwnedProject(user.id, "Reel", database)
    await moveOwnedProjectsToFolder(user.id, [project.id], beta.id, database)

    const listed = await listOwnedFolders(user.id, database)
    expect(listed).toEqual([
      { id: expect.any(String), name: "Alpha", project_count: 0 },
      { id: beta.id, name: "beta", project_count: 1 },
    ])
  })

  it("refuses a name that only differs by case or spacing, and a blank one", async () => {
    await createOwnedFolder(user.id, "Client A", database)
    await expect(
      createOwnedFolder(user.id, "  client   a ", database)
    ).rejects.toThrowError(FOLDER_NAME_TAKEN_MESSAGE)
    await expect(
      createOwnedFolder(user.id, "   ", database)
    ).rejects.toThrowError(FOLDER_NAME_REQUIRED_MESSAGE)
    // Another person can have the same name.
    const stranger = await insertUser(database)
    await expect(
      createOwnedFolder(stranger.id, "Client A", database)
    ).resolves.toMatchObject({ name: "Client A" })
  })

  it("renames, refusing a taken name and a stranger's folder", async () => {
    await createOwnedFolder(user.id, "Hooks", database)
    const other = await createOwnedFolder(user.id, "Logos", database)
    await expect(
      renameOwnedFolder(user.id, other.id, "hooks", database)
    ).rejects.toThrowError(FOLDER_NAME_TAKEN_MESSAGE)

    const stranger = await insertUser(database)
    await expect(
      renameOwnedFolder(stranger.id, other.id, "Mine now", database)
    ).rejects.toThrowError(FOLDER_NOT_FOUND_MESSAGE)

    await expect(
      renameOwnedFolder(user.id, other.id, " Brand  logos ", database)
    ).resolves.toEqual({ id: other.id, name: "Brand logos" })
  })

  it("keeps a project in one folder at most", async () => {
    const first = await createOwnedFolder(user.id, "First", database)
    const second = await createOwnedFolder(user.id, "Second", database)
    const project = await createOwnedProject(user.id, "Reel", database)

    await moveOwnedProjectsToFolder(user.id, [project.id], first.id, database)
    const moved = await moveOwnedProjectsToFolder(
      user.id,
      [project.id],
      second.id,
      database
    )

    expect(moved.moved_ids).toEqual([project.id])
    const rows = await database.select().from(videoProjectFolderItems)
    expect(rows).toHaveLength(1)
    expect(rows[0].folderId).toBe(second.id)
  })

  it("reports projects already there, and ids that are not the caller's", async () => {
    const folder = await createOwnedFolder(user.id, "Client A", database)
    const inside = await createOwnedProject(user.id, "Inside", database)
    const outside = await createOwnedProject(user.id, "Outside", database)
    await moveOwnedProjectsToFolder(user.id, [inside.id], folder.id, database)
    const stranger = await insertUser(database)
    const strangers = await createOwnedProject(stranger.id, "Theirs", database)

    const result = await moveOwnedProjectsToFolder(
      user.id,
      [inside.id, outside.id, strangers.id, "gone"],
      folder.id,
      database
    )

    expect(result).toEqual({
      moved_ids: [outside.id],
      unchanged_ids: [inside.id],
      skipped_ids: [strangers.id, "gone"],
    })
    const rows = await database.select().from(videoProjectFolderItems)
    expect(rows.map((row) => row.projectId).sort()).toEqual(
      [inside.id, outside.id].sort()
    )
  })

  it("never moves anything into a stranger's folder", async () => {
    const stranger = await insertUser(database)
    const theirFolder = await createOwnedFolder(stranger.id, "Theirs", database)
    const project = await createOwnedProject(user.id, "Reel", database)

    await expect(
      moveOwnedProjectsToFolder(user.id, [project.id], theirFolder.id, database)
    ).rejects.toThrowError(FOLDER_NOT_FOUND_MESSAGE)
    expect(await database.select().from(videoProjectFolderItems)).toEqual([])
  })

  it("takes projects out of their folders with a null folder", async () => {
    const folder = await createOwnedFolder(user.id, "Client A", database)
    const filed = await createOwnedProject(user.id, "Filed", database)
    const loose = await createOwnedProject(user.id, "Loose", database)
    await moveOwnedProjectsToFolder(user.id, [filed.id], folder.id, database)

    const result = await moveOwnedProjectsToFolder(
      user.id,
      [filed.id, loose.id],
      null,
      database
    )

    expect(result.moved_ids).toEqual([filed.id])
    expect(result.unchanged_ids).toEqual([loose.id])
    expect(await database.select().from(videoProjectFolderItems)).toEqual([])
  })

  it("lists one folder, or the projects in no folder", async () => {
    const folder = await createOwnedFolder(user.id, "Client A", database)
    const filed = await createOwnedProject(user.id, "Filed", database)
    await createOwnedProject(user.id, "Loose", database)
    await moveOwnedProjectsToFolder(user.id, [filed.id], folder.id, database)

    expect(await listedNames()).toEqual(["Filed", "Loose"])
    expect(await listedNames(folder.id)).toEqual(["Filed"])
    expect(await listedNames(null)).toEqual(["Loose"])
    const counted = await listOwnedProjects({
      userId: user.id,
      folderId: folder.id,
      database,
    })
    expect(counted.total).toBe(1)
  })

  it("deleting a folder keeps its projects and says how many", async () => {
    const folder = await createOwnedFolder(user.id, "Client A", database)
    const first = await createOwnedProject(user.id, "First", database)
    const second = await createOwnedProject(user.id, "Second", database)
    await moveOwnedProjectsToFolder(
      user.id,
      [first.id, second.id],
      folder.id,
      database
    )

    await expect(
      deleteOwnedFolder(user.id, folder.id, database)
    ).resolves.toEqual({ loose_count: 2 })

    expect(await database.select().from(videoProjects)).toHaveLength(2)
    expect(await listedNames(null)).toEqual(["First", "Second"])
    expect(await listOwnedFolders(user.id, database)).toEqual([])
  })

  it("refuses to delete a stranger's folder", async () => {
    const stranger = await insertUser(database)
    const theirFolder = await createOwnedFolder(stranger.id, "Theirs", database)
    await expect(
      deleteOwnedFolder(user.id, theirFolder.id, database)
    ).rejects.toThrowError(FOLDER_NOT_FOUND_MESSAGE)
    expect(await listOwnedFolders(stranger.id, database)).toHaveLength(1)
  })

  it("deleting a project takes it out of its folder's count", async () => {
    const folder = await createOwnedFolder(user.id, "Client A", database)
    const project = await createOwnedProject(user.id, "Reel", database)
    await moveOwnedProjectsToFolder(user.id, [project.id], folder.id, database)

    await deleteOwnedProjects(user.id, [project.id], database)

    const [listed] = await listOwnedFolders(user.id, database)
    expect(listed.project_count).toBe(0)
  })

  it("files a new project straight into the folder it was made in", async () => {
    const folder = await createOwnedFolder(user.id, "Client A", database)
    await createOwnedProject(user.id, "Made here", database, folder.id)
    expect(await listedNames(folder.id)).toEqual(["Made here"])
  })

  it("makes nothing when the new project's folder is not the caller's", async () => {
    const stranger = await insertUser(database)
    const theirFolder = await createOwnedFolder(stranger.id, "Theirs", database)
    await expect(
      createOwnedProject(user.id, "Reel", database, theirFolder.id)
    ).rejects.toThrowError(FOLDER_NOT_FOUND_MESSAGE)
    expect(await database.select().from(videoProjects)).toEqual([])
  })

  it("puts a copy in the same folder as the original", async () => {
    const folder = await createOwnedFolder(user.id, "Client A", database)
    const filed = await createOwnedProject(
      user.id,
      "Filed",
      database,
      folder.id
    )
    const loose = await createOwnedProject(user.id, "Loose", database)

    await duplicateOwnedProject(user.id, filed.id, database)
    await duplicateOwnedProject(user.id, loose.id, database)

    expect(await listedNames(folder.id)).toEqual(["Filed", "Filed copy"])
    expect(await listedNames(null)).toEqual(["Loose", "Loose copy"])
  })
})
