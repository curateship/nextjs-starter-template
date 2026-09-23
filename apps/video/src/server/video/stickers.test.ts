import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  BUILT_IN_STICKERS,
  STICKER_DUPLICATE_MESSAGE,
  STICKER_NOT_EMOJI_MESSAGE,
  STICKER_PICTURE_NOT_FOUND_MESSAGE,
} from "@/lib/video/stickers"
import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { videoStickerLists } from "@/server/video/schema"
import {
  addSticker,
  getStickers,
  removeSticker,
} from "@/server/video/stickers"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

// serializeMedia builds public URLs, which need the R2 base.
const hadOriginalR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
  if (hadOriginalR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

async function insertPicture(
  ownerId: string,
  overrides: Partial<typeof customShellMedia.$inferInsert> = {}
) {
  const timestamp = new Date(Date.UTC(2026, 8, 23))
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: ownerId,
      filename: `${uuid()}.png`,
      originalName: "logo.png",
      fileSize: 1000,
      mimeType: "image/png",
      fileType: "image",
      storagePath: `${ownerId}/${uuid()}.png`,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()
  return row
}

function emojiOf(list: Awaited<ReturnType<typeof getStickers>>) {
  return list.map((sticker) =>
    sticker.kind === "emoji" ? sticker.emoji : sticker.mediaId
  )
}

describe("a person's stickers", () => {
  it("start as the built-in eight, with nothing stored", async () => {
    expect(await getStickers(user.id, database)).toEqual(BUILT_IN_STICKERS)
    expect(await database.select().from(videoStickerLists)).toEqual([])
  })

  it("keep an added emoji at the end, after the eight", async () => {
    await addSticker(user.id, { kind: "emoji", emoji: "🚀" }, database)
    const list = await getStickers(user.id, database)
    expect(list).toHaveLength(9)
    expect(list.at(-1)).toEqual({ kind: "emoji", emoji: "🚀" })
  })

  it("can lose one of the eight for good", async () => {
    await removeSticker(user.id, { kind: "emoji", emoji: "☕" }, database)
    expect(emojiOf(await getStickers(user.id, database))).toEqual([
      "🔥",
      "✨",
      "👀",
      "💯",
      "➡️",
      "❤️",
      "⭐",
    ])
  })

  it("refuse something that is not one emoji, and a repeat", async () => {
    await expect(
      addSticker(user.id, { kind: "emoji", emoji: "hello" }, database)
    ).rejects.toThrow(STICKER_NOT_EMOJI_MESSAGE)
    await expect(
      addSticker(user.id, { kind: "emoji", emoji: "🔥" }, database)
    ).rejects.toThrow(STICKER_DUPLICATE_MESSAGE)
  })

  it("belong to one person only", async () => {
    const other = await insertUser(database)
    await addSticker(user.id, { kind: "emoji", emoji: "🚀" }, database)
    expect(await getStickers(other.id, database)).toEqual(BUILT_IN_STICKERS)
  })
})

describe("picture stickers", () => {
  it("carry the picture's address and name", async () => {
    const picture = await insertPicture(user.id)
    const list = await addSticker(
      user.id,
      { kind: "image", mediaId: picture.id },
      database
    )
    expect(list.at(-1)).toMatchObject({
      kind: "image",
      mediaId: picture.id,
      name: "logo.png",
      url: expect.stringContaining(picture.storagePath),
    })
  })

  it("refuse somebody else's picture, and a file that is not a picture", async () => {
    const other = await insertUser(database)
    const theirs = await insertPicture(other.id)
    const sound = await insertPicture(user.id, {
      fileType: "audio",
      mimeType: "audio/mpeg",
    })
    for (const mediaId of [theirs.id, sound.id, uuid()]) {
      await expect(
        addSticker(user.id, { kind: "image", mediaId }, database)
      ).rejects.toThrow(STICKER_PICTURE_NOT_FOUND_MESSAGE)
    }
  })

  it("drop off the list when the file is deleted", async () => {
    const picture = await insertPicture(user.id)
    await addSticker(user.id, { kind: "image", mediaId: picture.id }, database)
    await database
      .delete(customShellMedia)
      .where(eq(customShellMedia.id, picture.id))
    expect(await getStickers(user.id, database)).toEqual(BUILT_IN_STICKERS)
  })
})
