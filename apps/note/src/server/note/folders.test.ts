import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  reorderFolders,
} from "@/server/note/folders"
import { noteVideos } from "@/server/note/schema"
import { moveVideo, saveLink } from "@/server/note/videos"

/**
 * A flat list of folders, each person's own: names compared without capitals
 * or extra spaces, deleting one keeps its videos, and the dragged order is
 * the order that comes back.
 */

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

describe("folder names", () => {
  it("refuses a name already taken, whatever its capitals and spaces", async () => {
    await createFolder(user.id, "Pricing ideas")
    await expect(createFolder(user.id, "  pricing   IDEAS ")).rejects.toThrow(
      "A folder with that name already exists"
    )
  })

  it("lets two people use the same name", async () => {
    const other = await insertUser(database)
    await createFolder(user.id, "Pricing")
    await expect(createFolder(other.id, "Pricing")).resolves.toBeDefined()
  })

  it("refuses a rename onto a name already taken", async () => {
    await createFolder(user.id, "Pricing")
    const list = await createFolder(user.id, "Hooks")
    const hooks = list.folders.find((folder) => folder.name === "Hooks")
    await expect(renameFolder(user.id, hooks!.id, "PRICING")).rejects.toThrow(
      "A folder with that name already exists"
    )
  })

  it("refuses an empty name", async () => {
    await expect(createFolder(user.id, "   ")).rejects.toThrow("Give the folder a name")
  })
})

describe("deleting a folder", () => {
  it("keeps its videos on the list, in no folder", async () => {
    const folderId = (await createFolder(user.id, "Pricing")).folders[0].id
    const video = (await saveLink(user.id, "https://youtu.be/dQw4w9WgXcQ")).video
    await moveVideo(user.id, video.id, folderId)

    const { looseCount, folders } = await deleteFolder(user.id, folderId)

    expect(looseCount).toBe(1)
    expect(folders.folders).toEqual([])
    expect(folders).toMatchObject({ allCount: 1, noFolderCount: 1 })
    const [row] = await database.select().from(noteVideos).where(eq(noteVideos.id, video.id))
    expect(row.folderId).toBeNull()
  })

  it("will not delete somebody else's folder", async () => {
    const other = await insertUser(database)
    const theirs = (await createFolder(other.id, "Theirs")).folders[0].id
    await expect(deleteFolder(user.id, theirs)).rejects.toThrow("Folder not found")
  })
})

describe("the order", () => {
  it("comes back in the order it was dragged into, with each folder's count", async () => {
    await createFolder(user.id, "A")
    await createFolder(user.id, "B")
    const list = await createFolder(user.id, "C")
    const [a, b, c] = list.folders
    const video = (await saveLink(user.id, "https://youtu.be/dQw4w9WgXcQ")).video
    await moveVideo(user.id, video.id, b.id)

    const reordered = await reorderFolders(user.id, [c.id, a.id, b.id])

    expect(reordered.folders.map((folder) => [folder.name, folder.videoCount])).toEqual([
      ["C", 0],
      ["A", 0],
      ["B", 1],
    ])
    expect((await listFolders(user.id)).folders.map((folder) => folder.name)).toEqual(["C", "A", "B"])
  })

  it("refuses an order that leaves a folder out or names someone else's", async () => {
    await createFolder(user.id, "A")
    const [a, b] = (await createFolder(user.id, "B")).folders
    const other = await insertUser(database)
    const theirs = (await createFolder(other.id, "Theirs")).folders[0].id
    await expect(reorderFolders(user.id, [a.id])).rejects.toThrow("Folder not found")
    await expect(reorderFolders(user.id, [a.id, b.id, theirs])).rejects.toThrow("Folder not found")
  })
})
