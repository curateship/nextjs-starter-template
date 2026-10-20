import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BOARD_FULL_MESSAGE,
  EXTRA_NOT_FOUND_MESSAGE,
  EXTRA_PICTURE_MISSING_MESSAGE,
} from "@/lib/video/extras"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { addSheetPicture, createActor } from "@/server/video/asset-factories/actors"
import {
  createExtra,
  deleteExtras,
  listExtras,
  readProjectExtraPicks,
  saveProjectExtraPicks,
  updateExtra,
} from "@/server/video/asset-factories/extras"
import {
  createFirstFrames,
  listFirstFrames,
} from "@/server/video/asset-factories/first-frames"
import { mediaStillInUse } from "@/server/video/media-in-use"
import { createOwnedProject, duplicateOwnedProject } from "@/server/video/projects"
import { videoExtras, videoFirstFrames, videoProjects } from "@/server/video/schema"

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  getPublicMediaUrl: async (storagePath: string) =>
    `https://media.test/${storagePath}`,
}))

// No picture model is called: each request is recorded and answered with a
// new Media row. A person board is recorded by the files on it;
// person-board.test.ts stitches real ones.
type SentReference = { id?: string; tileMediaIds?: string[] }
const requests = vi.hoisted(
  () => [] as { prompt: string; references: SentReference[] }[]
)
vi.mock("@/server/video/asset-factories/images", () => ({
  generateImage: async (options: { prompt: string; references: SentReference[] }) => {
    requests.push({ prompt: options.prompt, references: options.references })
    return { bytes: new Uint8Array([1]), mimeType: "image/png" }
  },
}))
vi.mock("@/server/video/asset-factories/person-board", () => ({
  buildPersonBoard: async (tiles: { id: string }[]) => ({
    bytes: new Uint8Array([1]),
    mimeType: "image/jpeg",
    tileMediaIds: tiles.map((tile) => tile.id),
  }),
}))
vi.mock("@/server/video/asset-factories/media", () => ({
  saveGeneratedAsset: async (options: { userId: string }) => {
    const id = await insertPicture(options.userId)
    const [row] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, id))
    return row
  },
  discardGeneratedAsset: async () => undefined,
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
  requests.length = 0
})

afterEach(async () => {
  await client.close()
})

async function insertPicture(userId = user.id) {
  const id = uuid()
  const timestamp = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId,
    filename: `${id}.png`,
    originalName: `${id}.png`,
    fileSize: 8,
    mimeType: "image/png",
    fileType: "image",
    storagePath: `${userId}/${id}.png`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

const urlOf = (mediaId: string, userId = user.id) =>
  `https://media.test/${userId}/${mediaId}.png`

async function uploadedExtra(
  kind: "clothing" | "backdrop" | "prop" | "hair",
  name: string,
  prompt: string
) {
  const mediaId = await insertPicture()
  return createExtra(user.id, { kind, name, prompt, imageMediaUrl: urlOf(mediaId) }, false)
}

describe("an extra", () => {
  it("is made from a picture in Media, or drawn from its description", async () => {
    const jacket = await uploadedExtra("clothing", "Green jacket", "green wool jacket")
    expect(requests).toEqual([])
    const kitchen = await createExtra(
      user.id,
      { kind: "backdrop", name: "Kitchen", prompt: "bright kitchen" },
      true
    )
    expect(requests[0].prompt).toBe(
      "Draw this place as an empty background for a video, with nobody in it and no text. bright kitchen."
    )
    expect(requests[0].references).toEqual([])
    const { extras } = await listExtras(user.id)
    expect(extras.map((extra) => [extra.kind, extra.name])).toEqual([
      [kitchen.kind, "Kitchen"],
      [jacket.kind, "Green jacket"],
    ])
  })

  it("needs a picture unless it is drawn, and never takes another person's file", async () => {
    await expect(
      createExtra(user.id, { kind: "prop", name: "Mug", prompt: "white mug" }, false)
    ).rejects.toThrow(EXTRA_PICTURE_MISSING_MESSAGE)
    const someone = await insertUser(database)
    const theirs = await insertPicture(someone.id)
    await expect(
      createExtra(
        user.id,
        { kind: "prop", name: "Mug", prompt: "white mug", imageMediaUrl: urlOf(theirs, someone.id) },
        false
      )
    ).rejects.toThrow(EXTRA_PICTURE_MISSING_MESSAGE)
  })

  it("keeps the old picture in Media when it is drawn again, and its kind", async () => {
    const jacket = await uploadedExtra("clothing", "Green jacket", "green wool jacket")
    const redrawn = await updateExtra(
      user.id,
      jacket.id,
      { name: "Green jacket", prompt: "green wool jacket, brass buttons" },
      true
    )
    expect(redrawn.kind).toBe("clothing")
    expect(redrawn.image_media_id).not.toBe(jacket.image_media_id)
    expect(requests[0].prompt).toContain("Draw this outfit on its own")
    const [old] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, jacket.image_media_id))
    expect(old).toBeDefined()
  })

  it("is never changed or deleted by another person", async () => {
    const jacket = await uploadedExtra("clothing", "Green jacket", "green wool jacket")
    const someone = await insertUser(database)
    await expect(
      updateExtra(someone.id, jacket.id, { name: "Mine", prompt: "mine" }, true)
    ).rejects.toThrow(EXTRA_NOT_FOUND_MESSAGE)
    expect(await deleteExtras(someone.id, [jacket.id])).toEqual({ deleted_ids: [] })
    expect((await listExtras(someone.id)).extras).toEqual([])
    expect(requests).toEqual([])
  })

  it("leaves its file in Media when deleted, and the file cannot go while the extra uses it", async () => {
    const jacket = await uploadedExtra("clothing", "Green jacket", "green wool jacket")
    expect(await mediaStillInUse(user.id, [jacket.image_media_id], database)).toEqual(
      new Set([jacket.image_media_id])
    )
    await expect(
      database.delete(customShellMedia).where(eq(customShellMedia.id, jacket.image_media_id))
    ).rejects.toThrow()

    expect(await deleteExtras(user.id, [jacket.id])).toEqual({ deleted_ids: [jacket.id] })
    const [file] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, jacket.image_media_id))
    expect(file).toBeDefined()
  })

  it("refuses a kind outside the four in the database", async () => {
    const mediaId = await insertPicture()
    await expect(
      database.insert(videoExtras).values({
        id: uuid(),
        userId: user.id,
        kind: "shoes",
        name: "Boots",
        prompt: "boots",
        imageMediaId: mediaId,
        createdAt: now(),
        updatedAt: now(),
      })
    ).rejects.toThrow()
  })
})

describe("a project's picks", () => {
  it("are kept on the project, pass over an extra deleted since, and go with a copy", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const jacket = await uploadedExtra("clothing", "Green jacket", "green wool jacket")
    const kitchen = await uploadedExtra("backdrop", "Kitchen", "bright kitchen")
    await saveProjectExtraPicks(user.id, project.id, {
      clothing: jacket.id,
      backdrop: kitchen.id,
    })
    expect(await readProjectExtraPicks(user.id, project.id)).toEqual({
      picks: { clothing: jacket.id, backdrop: kitchen.id },
    })

    const copy = await duplicateOwnedProject(user.id, project.id, database)
    expect((await readProjectExtraPicks(user.id, copy.id)).picks).toEqual({
      clothing: jacket.id,
      backdrop: kitchen.id,
    })

    await deleteExtras(user.id, [jacket.id])
    expect(await readProjectExtraPicks(user.id, project.id)).toEqual({
      picks: { backdrop: kitchen.id },
    })
  })

  it("refuse another person's extra, one picked as the wrong kind, and another person's project", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const kitchen = await uploadedExtra("backdrop", "Kitchen", "bright kitchen")
    await expect(
      saveProjectExtraPicks(user.id, project.id, { clothing: kitchen.id })
    ).rejects.toThrow(EXTRA_NOT_FOUND_MESSAGE)
    const someone = await insertUser(database)
    await expect(
      saveProjectExtraPicks(someone.id, project.id, { backdrop: kitchen.id })
    ).rejects.toThrow(EXTRA_NOT_FOUND_MESSAGE)
    await expect(saveProjectExtraPicks(someone.id, project.id, {})).rejects.toThrow()
    const [row] = await database
      .select({ picks: videoProjects.extraPicks })
      .from(videoProjects)
      .where(eq(videoProjects.id, project.id))
    expect(row.picks).toEqual({})
  })
})

describe("a first frame with extras", () => {
  async function setup() {
    const actor = await createActor(user.id, {
      name: "Mia",
      prompt: "Short grey hair",
      model: "gemini-2.5-flash-image",
      status: "active",
      tags: "",
    })
    const project = await createOwnedProject(user.id, "Reel", database)
    const jacket = await uploadedExtra("clothing", "Green jacket", "green wool jacket")
    const bob = await uploadedExtra("hair", "Grey bob", "short grey bob")
    const mug = await uploadedExtra("prop", "Mug", "white mug")
    const kitchen = await uploadedExtra("backdrop", "Kitchen", "bright kitchen, white tiles")
    requests.length = 0
    return { actor, project, jacket, bob, mug, kitchen }
  }

  it("sends what it always sent with one picture and no extras", async () => {
    const { actor, project } = await setup()
    await createFirstFrames(user.id, {
      projectId: project.id,
      actorId: actor.id,
      prompt: "Holding a coffee",
      variants: 1,
      extras: {},
    })
    expect(requests[0].references.map((reference) => reference.id)).toEqual([
      actor.image_media_id,
    ])
    expect(requests[0].prompt).toBe(
      "Create a polished opening frame for a short video. Preserve the actor's identity. Actor: Mia. Actor description: Short grey hair. Direction: Holding a coffee. Variant 1 of 1."
    )
  })

  it("puts the actor, clothing, hair and prop on one board and sends the backdrop second", async () => {
    const { actor, project, jacket, bob, mug, kitchen } = await setup()
    const lookPicture = await insertPicture()
    await database
      .update(videoProjects)
      .set({ styleMediaId: lookPicture })
      .where(eq(videoProjects.id, project.id))
    const { firstFrames } = await createFirstFrames(user.id, {
      projectId: project.id,
      actorId: actor.id,
      prompt: "Holding a coffee",
      variants: 1,
      extras: { backdrop: kitchen.id, prop: mug.id, clothing: jacket.id, hair: bob.id },
    })

    const [board, place, look] = requests[0].references
    expect(board.tileMediaIds).toEqual([
      actor.image_media_id,
      jacket.image_media_id,
      bob.image_media_id,
      mug.image_media_id,
    ])
    expect(place.id).toBe(kitchen.image_media_id)
    expect(look.id).toBe(lookPicture)
    expect(requests[0].prompt).toContain(
      "The first picture is a board of one person, Mia: tile 1 main picture, tile 2 their clothing (Green jacket), tile 3 their hair and makeup (Grey bob), tile 4 what they hold (Mug). Draw one person, not the board. The second picture is the place to put Mia in: Kitchen."
    )
    expect(requests[0].prompt).toContain(
      "Actor description: Short grey hair. Wearing: green wool jacket. Hair and makeup: short grey bob. Holding: white mug. The place is: bright kitchen, white tiles. Direction: Holding a coffee."
    )

    const [row] = await database.select().from(videoFirstFrames)
    expect(row.extras.map((extra) => [extra.kind, extra.media_id])).toEqual([
      ["clothing", jacket.image_media_id],
      ["hair", bob.image_media_id],
      ["prop", mug.image_media_id],
      ["backdrop", kitchen.image_media_id],
    ])
    expect(firstFrames[0].made_with).toEqual(["Green jacket", "Grey bob", "Mug", "Kitchen"])

    await deleteExtras(user.id, [mug.id])
    const listed = await listFirstFrames(user.id, project.id)
    expect(listed.firstFrames[0].made_with).toEqual([
      "Green jacket",
      "Grey bob",
      "a removed extra",
      "Kitchen",
    ])
  })

  it("sends the actor's one picture alone, not a board, with only a backdrop", async () => {
    const { actor, project, kitchen } = await setup()
    await createFirstFrames(user.id, {
      projectId: project.id,
      actorId: actor.id,
      prompt: "Holding a coffee",
      variants: 1,
      extras: { backdrop: kitchen.id },
    })
    expect(requests[0].references.map((reference) => reference.id)).toEqual([
      actor.image_media_id,
      kitchen.image_media_id,
    ])
    expect(requests[0].prompt).not.toContain("board")
  })

  it("refuses a fifth tile, and an extra picked as the wrong kind, before anything is paid for", async () => {
    const { actor, project, jacket, bob, mug, kitchen } = await setup()
    const side = await addSheetPicture(user.id, actor.id, {
      mediaId: await insertPicture(),
      label: "Side",
    })
    await expect(
      createFirstFrames(user.id, {
        projectId: project.id,
        actorId: actor.id,
        prompt: "Holding a coffee",
        variants: 1,
        sheetPictureIds: side.sheet.map((picture) => picture.id),
        extras: { clothing: jacket.id, hair: bob.id, prop: mug.id },
      })
    ).rejects.toThrow(BOARD_FULL_MESSAGE)
    await expect(
      createFirstFrames(user.id, {
        projectId: project.id,
        actorId: actor.id,
        prompt: "Holding a coffee",
        variants: 1,
        extras: { clothing: kitchen.id },
      })
    ).rejects.toThrow(EXTRA_NOT_FOUND_MESSAGE)
    expect(requests).toEqual([])
    expect(await database.select().from(videoFirstFrames)).toEqual([])
  })
})
