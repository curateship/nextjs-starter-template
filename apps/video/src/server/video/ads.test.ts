import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AD_FILE_KIND_MESSAGE,
  AD_FILE_NOT_FOUND_MESSAGE,
  AD_LOOKS_FULL_MESSAGE,
  AD_NOT_FOUND_MESSAGE,
  DEFAULT_AD_RULES,
  DEFAULT_TEXT_AD_LOOK,
} from "@/lib/video/ads"
import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { clipAdTemplate, placeAds } from "@/lib/video/ads"
import { renderRefusalReason } from "@/server/video/render"
import {
  addClipAd,
  addClipAdFromUrl,
  addTextAd,
  getAdRules,
  listAdLooks,
  listAds,
  measureLoudness,
  removeAdLook,
  removeShelfAd,
  saveAdLook,
  saveAdRules,
} from "@/server/video/ads"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser
let workspaceId: string

const hadPublicUrl = Object.prototype.hasOwnProperty.call(process.env, "CUSTOM_SHELL_R2_PUBLIC_URL")
const originalPublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
  if (hadPublicUrl) process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalPublicUrl
  else delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
})

async function insertFile(ownerId: string, fileType: "audio" | "video" | "image" = "video") {
  const timestamp = new Date()
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: ownerId,
      filename: `${uuid()}.mp4`,
      originalName: "sponsor.mp4",
      fileSize: 1000,
      mimeType: fileType === "audio" ? "audio/mpeg" : fileType === "video" ? "video/mp4" : "image/png",
      fileType,
      storagePath: `${ownerId}/${uuid()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return row
}

describe("the ads shelf", () => {
  it("keeps a sponsor clip and a text ad, and shows them in every project", async () => {
    const file = await insertFile(user.id)
    await addClipAd(user.id, file.id, database)
    await addTextAd(user.id, { text: "  Use code TYLER  ", look: DEFAULT_TEXT_AD_LOOK }, database)
    const shelf = await listAds(user.id, database)
    expect(shelf.map((ad) => [ad.kind, ad.name])).toEqual(
      expect.arrayContaining([
        ["clip", "sponsor.mp4"],
        ["text", "Use code TYLER"],
      ])
    )
    const clip = shelf.find((ad) => ad.kind === "clip")
    expect(clip?.media).toMatchObject({ id: file.id, file_type: "video" })
    expect(shelf.find((ad) => ad.kind === "text")?.look).toEqual(DEFAULT_TEXT_AD_LOOK)
    // Nobody else sees it.
    expect(await listAds(other.id, database)).toEqual([])
  })

  it("takes a video or a sound picked in the media library by its address", async () => {
    const video = await insertFile(user.id, "video")
    const sound = await insertFile(user.id, "audio")
    const base = "https://video-media.example.test"
    await addClipAdFromUrl(user.id, `${base}/${video.storagePath}`, database)
    await addClipAdFromUrl(user.id, `${base}/${sound.storagePath}`, database)
    const shelf = await listAds(user.id, database)
    expect(shelf.map((ad) => ad.media?.file_type).sort()).toEqual(["audio", "video"])
    const theirs = await insertFile(other.id, "video")
    await expect(
      addClipAdFromUrl(user.id, `${base}/${theirs.storagePath}`, database)
    ).rejects.toThrow(AD_FILE_NOT_FOUND_MESSAGE)
  })

  it("refuses somebody else's file and a picture", async () => {
    const theirs = await insertFile(other.id)
    await expect(addClipAd(user.id, theirs.id, database)).rejects.toThrow(AD_FILE_NOT_FOUND_MESSAGE)
    const picture = await insertFile(user.id, "image")
    await expect(addClipAd(user.id, picture.id, database)).rejects.toThrow(AD_FILE_KIND_MESSAGE)
  })

  it("takes an ad off only for its owner, and keeps the file", async () => {
    const file = await insertFile(user.id)
    const id = await addClipAd(user.id, file.id, database)
    await expect(removeShelfAd(other.id, id, database)).rejects.toThrow(AD_NOT_FOUND_MESSAGE)
    await removeShelfAd(user.id, id, database)
    expect(await listAds(user.id, database)).toEqual([])
    const files = await database.select().from(customShellMedia)
    expect(files.some((row) => row.id === file.id)).toBe(true)
  })
})

describe("saved text ad looks", () => {
  it("saves a named look and takes it off again", async () => {
    const saved = await saveAdLook(
      user.id,
      { name: "Yellow box", look: { ...DEFAULT_TEXT_AD_LOOK, boxColor: "#ffd400", color: "#000000" } },
      database
    )
    expect(await listAdLooks(user.id, database)).toEqual([saved])
    expect(await listAdLooks(other.id, database)).toEqual([])
    await removeAdLook(user.id, saved.id, database)
    expect(await listAdLooks(user.id, database)).toEqual([])
  })

  it("keeps at most 50, and says so rather than hiding the 51st", async () => {
    for (let index = 0; index < 50; index++) {
      await saveAdLook(user.id, { name: `Look ${index}`, look: DEFAULT_TEXT_AD_LOOK }, database)
    }
    await expect(
      saveAdLook(user.id, { name: "One more", look: DEFAULT_TEXT_AD_LOOK }, database)
    ).rejects.toThrow(AD_LOOKS_FULL_MESSAGE)
  })
})

describe("the ad rules", () => {
  it("start at the defaults and keep what is saved", async () => {
    expect(await getAdRules(database)).toEqual(DEFAULT_AD_RULES)
    await saveAdRules({ ...DEFAULT_AD_RULES, limitPercent: 20 }, database)
    expect((await getAdRules(database)).limitPercent).toBe(20)
  })
})

describe("how loud a file is", () => {
  it("measures each of your files once and keeps the answer", async () => {
    const file = await insertFile(user.id)
    const theirs = await insertFile(other.id)
    const measure = vi.fn(async () => -11.5)
    expect(await measureLoudness(user.id, [file.id, theirs.id], database, measure)).toEqual({
      [file.id]: -11.5,
      [theirs.id]: null,
    })
    await measureLoudness(user.id, [file.id], database, measure)
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it("keeps nothing when a file could not be measured, so the next ad tries again", async () => {
    const file = await insertFile(user.id)
    const failing = vi.fn(async () => "unmeasured" as const)
    expect(await measureLoudness(user.id, [file.id], database, failing)).toEqual({ [file.id]: null })
    const working = vi.fn(async () => -14)
    expect(await measureLoudness(user.id, [file.id], database, working)).toEqual({ [file.id]: -14 })
  })
})

describe("a timeline with ads", () => {
  it("is one the export takes", () => {
    const tracks = placeAds(
      [
        {
          id: "a",
          muted: false,
          clips: [
            { id: "talk", kind: "video", name: "Talk", mediaId: "talk", startMs: 0, durationMs: 720_000, trimStartMs: 0 },
          ],
        },
      ],
      clipAdTemplate({
        shelfId: "shelf-1",
        name: "Sponsor",
        mediaId: "sponsor",
        url: "https://example.com/sponsor.mp4",
        fileType: "video",
        durationMs: 30_000,
      }),
      2,
      () => uuid()
    )
    if (!Array.isArray(tracks)) throw new Error(tracks.refusal)
    const locked = tracks.map((track) => (track.ads ? { ...track, locked: true } : track))
    expect(renderRefusalReason({ tracks: locked, aspect: "16:9" })).toBeNull()
  })
})
