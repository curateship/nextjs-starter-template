import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { addSocialCreator } from "@/server/trade/social-creators"
import {
  createSocialFolder,
  deleteSocialFolder,
  loadSocialFolders,
  renameSocialFolder,
  saveSocialFolderOrder,
  setCreatorInFolder,
} from "@/server/trade/social-folders"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

describe("folders of creators", () => {
  it("refuses two folders whose names differ only in case", async () => {
    const user = await insertUser(database)
    await createSocialFolder(user.id, { name: "Trusted" })
    await expect(
      createSocialFolder(user.id, { name: "  trusted " })
    ).rejects.toThrow("You already have a folder with that name.")
    // Another member is free to use the same name.
    const other = await insertUser(database)
    const folders = await createSocialFolder(other.id, { name: "trusted" })
    expect(folders).toHaveLength(1)
  })

  it("holds one creator in two folders at once", async () => {
    const user = await insertUser(database)
    const creator = await addSocialCreator(user.id, "cryptosam")
    await createSocialFolder(user.id, { name: "Trusted", creatorId: creator.id })
    let folders = await createSocialFolder(user.id, { name: "Stocks" })
    const stocks = folders.find((folder) => folder.name === "Stocks")!
    await setCreatorInFolder(user.id, {
      folderId: stocks.id,
      creatorId: creator.id,
      saved: true,
    })
    folders = await loadSocialFolders(user.id)
    expect(
      folders.map((folder) => folder.creatorIds.includes(creator.id))
    ).toEqual([true, true])

    // Out of one folder leaves them in the other.
    await setCreatorInFolder(user.id, {
      folderId: stocks.id,
      creatorId: creator.id,
      saved: false,
    })
    folders = await loadSocialFolders(user.id)
    expect(folders.find((folder) => folder.name === "Trusted")!.creatorIds)
      .toEqual([creator.id])
    expect(folders.find((folder) => folder.name === "Stocks")!.creatorIds)
      .toEqual([])
  })

  it("keeps the creators when their folder is deleted", async () => {
    const user = await insertUser(database)
    const creator = await addSocialCreator(user.id, "cryptosam")
    const folders = await createSocialFolder(user.id, {
      name: "Trusted",
      creatorId: creator.id,
    })
    await deleteSocialFolder(user.id, folders[0].id)
    expect(await loadSocialFolders(user.id)).toEqual([])
    // The creator is untouched; only the folder rows went.
    const fresh = await addSocialCreator(user.id, "cryptosam").catch(
      (error: Error) => error.message
    )
    expect(fresh).toContain("SOCIAL_CREATOR_EXISTS")
  })

  it("never touches another member's folders or creators", async () => {
    const owner = await insertUser(database)
    const stranger = await insertUser(database)
    const creator = await addSocialCreator(owner.id, "cryptosam")
    const [folder] = await createSocialFolder(owner.id, { name: "Trusted" })

    await expect(
      renameSocialFolder(stranger.id, folder.id, "Mine now")
    ).rejects.toThrow("That folder no longer exists.")
    await expect(
      deleteSocialFolder(stranger.id, folder.id)
    ).rejects.toThrow("That folder no longer exists.")
    await expect(
      setCreatorInFolder(stranger.id, {
        folderId: folder.id,
        creatorId: creator.id,
        saved: true,
      })
    ).rejects.toThrow("That folder no longer exists.")

    const [strangerFolder] = await createSocialFolder(stranger.id, {
      name: "Theirs",
    })
    await expect(
      setCreatorInFolder(stranger.id, {
        folderId: strangerFolder.id,
        creatorId: creator.id,
        saved: true,
      })
    ).rejects.toThrow("That creator is not one you track.")
  })

  it("saves the order and the eye in one write, and refuses a drifted list", async () => {
    const user = await insertUser(database)
    await createSocialFolder(user.id, { name: "One" })
    await createSocialFolder(user.id, { name: "Two" })
    const folders = await createSocialFolder(user.id, { name: "Three" })
    const byName = new Map(folders.map((folder) => [folder.name, folder.id]))

    const saved = await saveSocialFolderOrder(user.id, {
      folderIds: [byName.get("Three")!, byName.get("One")!, byName.get("Two")!],
      hiddenFolderIds: [byName.get("One")!],
    })
    expect(saved.map((folder) => folder.name)).toEqual(["Three", "One", "Two"])
    expect(saved.map((folder) => folder.hidden)).toEqual([false, true, false])

    // A list missing a folder, repeating one, or naming a stranger's is
    // refused whole, leaving the saved arrangement alone.
    await expect(
      saveSocialFolderOrder(user.id, {
        folderIds: [byName.get("One")!, byName.get("Two")!],
        hiddenFolderIds: [],
      })
    ).rejects.toThrow("That folder arrangement could not be saved.")
    const kept = await loadSocialFolders(user.id)
    expect(kept.map((folder) => folder.name)).toEqual(["Three", "One", "Two"])
  })

  it("renames a folder, refusing a name another folder holds", async () => {
    const user = await insertUser(database)
    await createSocialFolder(user.id, { name: "One" })
    const folders = await createSocialFolder(user.id, { name: "Two" })
    const two = folders.find((folder) => folder.name === "Two")!
    await expect(
      renameSocialFolder(user.id, two.id, "ONE")
    ).rejects.toThrow("You already have a folder with that name.")
    const renamed = await renameSocialFolder(user.id, two.id, "Watching")
    expect(renamed.map((folder) => folder.name)).toContain("Watching")
  })
})
