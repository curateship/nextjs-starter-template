import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  describeActorPictures,
  MAIN_PICTURE_REMOVE_MESSAGE,
  MAX_SHEET_PICTURES,
  SHEET_DUPLICATE_MESSAGE,
  SHEET_FULL_MESSAGE,
  SHEET_PICTURE_NOT_FOUND_MESSAGE,
} from "@/lib/video/asset-factories"
import { BOARD_FULL_MESSAGE } from "@/lib/video/extras"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  addSheetPicture,
  createActor,
  deleteActors,
  labelSheetPicture,
  listActors,
  makeMainSheetPicture,
  removeSheetPicture,
  updateActor,
} from "@/server/video/asset-factories/actors"
import {
  createFirstFrames,
  listFirstFrames,
} from "@/server/video/asset-factories/first-frames"
import { mediaStillInUse } from "@/server/video/media-in-use"
import { createOwnedProject } from "@/server/video/projects"
import {
  videoActors,
  videoActorSheetPictures,
  videoFirstFrames,
  videoProjects,
} from "@/server/video/schema"

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  getPublicMediaUrl: async (storagePath: string) =>
    `https://media.test/${storagePath}`,
}))

// No picture model is called: each request is recorded and answered with a
// new Media row, the way a saved AI picture lands. A person board is
// recorded by the files on it; person-board.test.ts stitches real ones.
type SentReference = { id?: string; tileMediaIds?: string[] }
const requests = vi.hoisted(
  () => [] as { prompt: string; references: SentReference[] }[]
)
vi.mock("@/server/video/asset-factories/images", () => ({
  generateImage: async (options: {
    prompt: string
    references: SentReference[]
  }) => {
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
    return getMedia(id)
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

async function getMedia(id: string) {
  const [row] = await database
    .select()
    .from(customShellMedia)
    .where(eq(customShellMedia.id, id))
  return row
}

const urlOf = (mediaId: string) => `https://media.test/${user.id}/${mediaId}.png`

function newActor() {
  return createActor(user.id, {
    name: "Mia",
    prompt: "Short grey hair, green jacket",
    model: "gemini-2.5-flash-image",
    status: "active",
    tags: "",
  })
}

describe("the migration", () => {
  it("gives every actor already saved a one-picture sheet of its main picture, once", async () => {
    const imageMediaId = await insertPicture()
    const at = now()
    const actorId = uuid()
    await database.insert(videoActors).values({
      id: actorId,
      userId: user.id,
      name: "Old actor",
      prompt: "Made before sheets",
      model: "gemini-2.5-flash-image",
      status: "active",
      tags: [],
      imageMediaId,
      createdAt: at,
      updatedAt: at,
    })
    const migration = await readFile(
      new URL("../../../drizzle/0119_video_actor_sheet_pictures.sql", import.meta.url),
      "utf8"
    )
    await client.exec(migration)
    await client.exec(migration)

    const sheet = await database.select().from(videoActorSheetPictures)
    expect(sheet).toHaveLength(1)
    expect(sheet[0]).toMatchObject({ actorId, mediaId: imageMediaId, label: null })
    expect(sheet[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    const { actors } = await listActors(user.id)
    expect(actors[0].sheet).toEqual([
      expect.objectContaining({ media_id: imageMediaId, main: true }),
    ])
  })
})

describe("an actor's character sheet", () => {
  it("starts with the picture the actor was made from, marked main", async () => {
    const actor = await newActor()
    expect(actor.sheet).toEqual([
      expect.objectContaining({ media_id: actor.image_media_id, main: true, label: null }),
    ])
  })

  it("adds, labels and changes the main picture, main first", async () => {
    const actor = await newActor()
    const side = await insertPicture()
    let changed = await addSheetPicture(user.id, actor.id, { mediaUrl: urlOf(side) })
    const sidePicture = changed.sheet[1]
    changed = await labelSheetPicture(user.id, sidePicture.id, "  Side   view ")
    expect(changed.sheet[1].label).toBe("Side view")

    changed = await makeMainSheetPicture(user.id, sidePicture.id)
    expect(changed.image_media_id).toBe(side)
    expect(changed.sheet.map((picture) => [picture.media_id, picture.main])).toEqual([
      [side, true],
      [actor.image_media_id, false],
    ])

    changed = await labelSheetPicture(user.id, sidePicture.id, "")
    expect(changed.sheet[0].label).toBeNull()
  })

  it("refuses the same file twice, another person's file, and a full sheet", async () => {
    const actor = await newActor()
    await expect(
      addSheetPicture(user.id, actor.id, { mediaUrl: urlOf(actor.image_media_id) })
    ).rejects.toThrow(SHEET_DUPLICATE_MESSAGE)

    const stranger = await insertUser(database)
    const theirs = await insertPicture(stranger.id)
    await expect(
      addSheetPicture(user.id, actor.id, { mediaId: theirs })
    ).rejects.toThrow("Media not found")

    for (let added = 1; added < MAX_SHEET_PICTURES; added += 1) {
      await addSheetPicture(user.id, actor.id, { mediaId: await insertPicture() })
    }
    await expect(
      addSheetPicture(user.id, actor.id, { mediaId: await insertPicture() })
    ).rejects.toThrow(SHEET_FULL_MESSAGE)
  })

  it("refuses to remove the main picture until another is main", async () => {
    const actor = await newActor()
    const side = await insertPicture()
    const withSide = await addSheetPicture(user.id, actor.id, { mediaId: side })
    const main = withSide.sheet[0]

    await expect(removeSheetPicture(user.id, main.id)).rejects.toThrow(
      MAIN_PICTURE_REMOVE_MESSAGE
    )
    await makeMainSheetPicture(user.id, withSide.sheet[1].id)
    const after = await removeSheetPicture(user.id, main.id)
    expect(after.sheet.map((picture) => picture.media_id)).toEqual([side])
  })

  it("never lets another person change a sheet picture", async () => {
    const actor = await newActor()
    const stranger = await insertUser(database)
    const picture = actor.sheet[0].id
    await expect(labelSheetPicture(stranger.id, picture, "Mine")).rejects.toThrow(
      SHEET_PICTURE_NOT_FOUND_MESSAGE
    )
    await expect(makeMainSheetPicture(stranger.id, picture)).rejects.toThrow(
      SHEET_PICTURE_NOT_FOUND_MESSAGE
    )
    await expect(removeSheetPicture(stranger.id, picture)).rejects.toThrow(
      SHEET_PICTURE_NOT_FOUND_MESSAGE
    )
  })

  it("keeps the old pose on the sheet when the actor is re-posed", async () => {
    const actor = await newActor()
    const reposed = await updateActor(
      user.id,
      actor.id,
      {
        name: "Mia",
        prompt: "Arms crossed",
        model: "gemini-2.5-flash-image",
        status: "active",
        tags: "",
      },
      true
    )
    expect(reposed.image_media_id).not.toBe(actor.image_media_id)
    expect(reposed.sheet.map((picture) => [picture.media_id, picture.main])).toEqual([
      [reposed.image_media_id, true],
      [actor.image_media_id, false],
    ])
  })
})

describe("what removing and deleting keeps", () => {
  it("keeps the file in Media when a picture comes off the sheet or the actor is deleted", async () => {
    const actor = await newActor()
    const side = await insertPicture()
    const withSide = await addSheetPicture(user.id, actor.id, { mediaId: side })
    await removeSheetPicture(user.id, withSide.sheet[1].id)
    expect(await getMedia(side)).toBeDefined()

    await deleteActors(user.id, [actor.id])
    expect(await database.select().from(videoActorSheetPictures)).toEqual([])
    expect(await getMedia(actor.image_media_id)).toBeDefined()
  })

  it("takes a file deleted from Media off the sheet, but the main picture cannot be deleted", async () => {
    const actor = await newActor()
    const side = await insertPicture()
    await addSheetPicture(user.id, actor.id, { mediaId: side })

    await database.delete(customShellMedia).where(eq(customShellMedia.id, side))
    const [listed] = (await listActors(user.id)).actors
    expect(listed.sheet.map((picture) => picture.media_id)).toEqual([
      actor.image_media_id,
    ])
    await expect(
      database
        .delete(customShellMedia)
        .where(eq(customShellMedia.id, actor.image_media_id))
    ).rejects.toThrow()
  })

  it("counts a sheet picture as in use, so clearing out a project keeps it", async () => {
    const actor = await newActor()
    const side = await insertPicture()
    await addSheetPicture(user.id, actor.id, { mediaId: side })
    const loose = await insertPicture()
    expect(await mediaStillInUse(user.id, [side, loose], database)).toEqual(
      new Set([side])
    )
  })
})

describe("first frames from the sheet", () => {
  async function setup() {
    const actor = await newActor()
    const side = await insertPicture()
    const front = await insertPicture()
    let sheet = (await addSheetPicture(user.id, actor.id, { mediaId: side, label: "Side" })).sheet
    sheet = (await addSheetPicture(user.id, actor.id, { mediaId: front, label: "Front" })).sheet
    const project = await createOwnedProject(user.id, "Reel", database)
    requests.length = 0
    return { actor, side, front, sheet, project }
  }

  it("sends the main picture alone, with the prompt as before, when none is picked", async () => {
    const { actor, project } = await setup()
    const { firstFrames } = await createFirstFrames(user.id, {
      projectId: project.id,
      actorId: actor.id,
      prompt: "In a kitchen",
      variants: 1,
    })
    expect(requests[0].references.map((reference) => reference.id)).toEqual([
      actor.image_media_id,
    ])
    expect(requests[0].prompt).toContain("Preserve the actor's identity. Actor: Mia.")
    expect(firstFrames[0].made_from).toEqual(["main picture"])
  })

  it("sends the picked pictures main first on one board, and records them on the frame", async () => {
    const { actor, side, sheet, project } = await setup()
    const sidePicture = sheet.find((picture) => picture.media_id === side)!
    const { firstFrames } = await createFirstFrames(user.id, {
      projectId: project.id,
      actorId: actor.id,
      prompt: "In a kitchen",
      variants: 1,
      sheetPictureIds: [sidePicture.id, sheet[0].id],
    })
    expect(requests[0].references).toHaveLength(1)
    expect(requests[0].references[0].tileMediaIds).toEqual([
      actor.image_media_id,
      side,
    ])
    expect(requests[0].prompt).toContain(
      "The first picture is a board of one person, Mia: tile 1 main picture, tile 2 Side. Draw one person, not the board."
    )
    const [row] = await database.select().from(videoFirstFrames)
    expect(row.actorMediaIds).toEqual([actor.image_media_id, side])
    expect(firstFrames[0].made_from).toEqual(["main picture", "Side"])

    await removeSheetPicture(user.id, sidePicture.id)
    const listed = await listFirstFrames(user.id, project.id)
    expect(listed.firstFrames[0].made_from).toEqual([
      "main picture",
      "a removed picture",
    ])
  })

  it("sends all three angles on one board even with a look picture, which goes last", async () => {
    const { actor, sheet, project } = await setup()
    const lookPicture = await insertPicture()
    await database
      .update(videoProjects)
      .set({ styleMediaId: lookPicture })
      .where(eq(videoProjects.id, project.id))

    await createFirstFrames(user.id, {
      projectId: project.id,
      actorId: actor.id,
      prompt: "In a kitchen",
      variants: 1,
      sheetPictureIds: sheet.map((picture) => picture.id),
    })
    expect(requests[0].references).toHaveLength(2)
    expect(requests[0].references[0].tileMediaIds).toHaveLength(3)
    expect(requests[0].references[1].id).toBe(lookPicture)
  })

  it("refuses a fifth picture on the board before anything is paid for", async () => {
    const { actor, project } = await setup()
    for (const label of ["Back", "Smiling"]) {
      await addSheetPicture(user.id, actor.id, { mediaId: await insertPicture(), label })
    }
    const [listed] = (await listActors(user.id)).actors
    expect(listed.sheet).toHaveLength(5)
    await expect(
      createFirstFrames(user.id, {
        projectId: project.id,
        actorId: actor.id,
        prompt: "In a kitchen",
        variants: 1,
        sheetPictureIds: listed.sheet.map((picture) => picture.id),
      })
    ).rejects.toThrow(BOARD_FULL_MESSAGE)
    expect(requests).toEqual([])
    expect(await database.select().from(videoFirstFrames)).toEqual([])
  })

  it("refuses a picture from another actor's sheet", async () => {
    const { actor, project } = await setup()
    const other = await newActor()
    await expect(
      createFirstFrames(user.id, {
        projectId: project.id,
        actorId: actor.id,
        prompt: "In a kitchen",
        variants: 1,
        sheetPictureIds: [other.sheet[0].id],
      })
    ).rejects.toThrow(SHEET_PICTURE_NOT_FOUND_MESSAGE)
  })
})

describe("naming what a frame was made from", () => {
  it("uses labels, then main or unlabelled, and says when a picture was removed", () => {
    expect(
      describeActorPictures(
        ["main", "side", "plain", "gone"],
        [
          { mediaId: "main", label: null },
          { mediaId: "side", label: "Side" },
          { mediaId: "plain", label: null },
        ],
        "main"
      )
    ).toEqual(["main picture", "Side", "unlabelled picture", "a removed picture"])
  })
})
