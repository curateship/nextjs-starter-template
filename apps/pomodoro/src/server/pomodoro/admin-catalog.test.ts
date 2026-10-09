import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Files never really leave for the bucket in a test.
vi.mock("@/server/media/storage", () => ({
  deleteFromR2: vi.fn(async () => undefined),
  uploadToR2: vi.fn(async () => undefined),
  getPublicMediaUrl: vi.fn(async (path: string) => `https://files.test/${path}`),
  getFromR2: vi.fn(),
  R2StorageNotConfiguredError: class extends Error {},
}))

import { type CustomShellDb } from "@/server/db"
import { deleteFromR2 } from "@/server/media/storage"
import {
  CATALOG_MAX_ATTEMPTS,
  claimNextCatalogFile,
  createCatalogDrafts,
  deleteAdminCatalogItems,
  failCatalogFile,
  finishCatalogFile,
  listAdminCatalog,
  reorderAdminCatalog,
  saveAdminCatalogItem,
  setAdminCatalogLocked,
  setAdminCatalogStatus,
  type CatalogItemInput,
} from "@/server/pomodoro/admin-catalog"
import { forgetMediaCatalog, loadMediaCatalog } from "@/server/pomodoro/catalog"
import { savePersonalSound } from "@/server/pomodoro/personal-room"
import {
  pomodoroAuditLogs,
  pomodoroCatalogItems,
  pomodoroPersonalRooms,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { SOUND_GRAPHICS } from "@/lib/pomodoro/admin-catalog"

/**
 * The catalogue against a real database: the sixteen built-in items the
 * migration copied in, what members see, and every change an admin makes.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetMediaCatalog()
})

afterEach(async () => {
  await client.close()
})

const SOURCE = "pomodoro-catalog/sources/0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10.mp3"

function soundInput(overrides: Partial<CatalogItemInput> = {}): CatalogItemInput {
  return {
    label: "Rain on a tin roof",
    hint: "Patter and drips",
    descriptor: "ambient",
    locked: false,
    status: "draft",
    pictureUrl: "https://files.test/picture.png",
    tags: [" Rain ", "night", "rain"],
    volume: 80,
    artist: null,
    sourceUrl: null,
    licence: "bought",
    licenceNote: null,
    source: { path: SOURCE, kind: "audio" },
    clearFile: false,
    ...overrides,
  }
}

async function itemByKey(kind: "theme" | "sound", key: string) {
  const [row] = await db
    .select()
    .from(pomodoroCatalogItems)
    .where(and(eq(pomodoroCatalogItems.kind, kind), eq(pomodoroCatalogItems.key, key)))
  return row
}

describe("the built-in items", () => {
  it("are all in the catalogue with their old keys, files and prices", async () => {
    const catalog = await loadMediaCatalog(db)
    expect(catalog.themes.map((theme) => theme.key)).toEqual([
      "lofi", "ambient", "plain", "stars", "rain", "forest", "ocean", "fireplace",
    ])
    expect(catalog.sounds.map((sound) => sound.key)).toEqual([
      "lofi", "rain", "cafe", "brown", "forest", "ocean", "fire", "piano",
    ])
    expect(catalog.themes[0]).toMatchObject({
      stillUrl: "/backgrounds/thumbs-lofi_girl.png",
      videoUrl: "/backgrounds/uploads-265816_small.mp4",
      locked: false,
    })
    expect(catalog.sounds.find((sound) => sound.key === "piano")).toMatchObject({
      fileUrl: "/sounds/audio-piano.mp3",
      locked: true,
      volume: 100,
    })
  })
})

describe("saving an item", () => {
  it("makes a key from the name, queues the file and keeps a Draft from members", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput(),
      actorUserId: admin,
    })
    expect(saved).toMatchObject({
      key: "rain-on-a-tin-roof",
      tags: ["rain", "night"],
      status: "draft",
      fileStatus: "queued",
      publishedAt: null,
    })
    const catalog = await loadMediaCatalog(db)
    expect(catalog.sounds.some((sound) => sound.key === "rain-on-a-tin-roof")).toBe(false)
    const [log] = await db.select().from(pomodoroAuditLogs)
    expect(log).toMatchObject({ action: "catalog_create", resource: "catalog" })
  })

  it("never reuses a key, so a second item of the same name gets its own", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const first = await saveAdminCatalogItem({ id: null, kind: "sound", input: soundInput(), actorUserId: admin })
    const second = await saveAdminCatalogItem({ id: null, kind: "sound", input: soundInput(), actorUserId: admin })
    expect([first.key, second.key]).toEqual(["rain-on-a-tin-roof", "rain-on-a-tin-roof-2"])
  })

  it("makes a sound Live with no picture of its own, using a built-in graphic", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput({ status: "live", pictureUrl: null }),
      actorUserId: admin,
    })
    expect(saved.status).toBe("live")
    expect(SOUND_GRAPHICS).toContain(saved.pictureUrl)
  })

  it("still refuses to make a theme Live with no picture", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    await expect(
      saveAdminCatalogItem({
        id: null,
        kind: "theme",
        input: soundInput({ status: "live", pictureUrl: null, descriptor: "static", source: null }),
        actorUserId: admin,
      })
    ).rejects.toThrow("CATALOG_NEEDS_PICTURE")
  })

  it("shows a Live sound to members once its file is finished, with the NEW date set", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput({ status: "live" }),
      actorUserId: admin,
    })
    expect(saved.publishedAt).not.toBeNull()
    expect((await loadMediaCatalog(db)).sounds.some((sound) => sound.key === saved.key)).toBe(false)

    await finishCatalogFile({
      id: saved.id,
      sourcePath: SOURCE,
      fileUrl: "https://files.test/done.mp3",
      filePath: "pomodoro-catalog/sounds/done.mp3",
      poster: null,
      durationSeconds: 185,
    })
    forgetMediaCatalog()
    const sound = (await loadMediaCatalog(db)).sounds.find((item) => item.key === saved.key)
    expect(sound).toMatchObject({ fileUrl: "https://files.test/done.mp3", volume: 80 })
  })

  it("keeps the old file playing when a replacement is refused", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const rain = await itemByKey("sound", "rain")
    await saveAdminCatalogItem({
      id: rain!.id,
      kind: "sound",
      input: soundInput({ label: "Rain", status: "live", pictureUrl: "/sounds/sounds-rain.png" }),
      actorUserId: admin,
    })
    await failCatalogFile({ id: rain!.id, sourcePath: SOURCE, reason: "This sound is 0:48. Sounds need to run 2 to 5 minutes.", retry: false })
    forgetMediaCatalog()
    const after = await itemByKey("sound", "rain")
    expect(after).toMatchObject({ fileStatus: "failed", fileUrl: "/sounds/audio-rain.mp3" })
    expect(after!.fileError).toContain("0:48")
    expect((await loadMediaCatalog(db)).sounds.some((sound) => sound.key === "rain")).toBe(true)
  })
})

describe("what members can pick", () => {
  it("refuses a Draft sound and falls back once a picked one goes Draft", async () => {
    const member = (await insertUser(db)).id
    const admin = (await insertUser(db, { role: "admin" })).id
    await savePersonalSound(member, "curated:rain")
    const rain = await itemByKey("sound", "rain")

    await setAdminCatalogStatus({ ids: [rain!.id], status: "draft", actorUserId: admin })

    await expect(savePersonalSound(member, "curated:rain")).rejects.toThrow("UNKNOWN_SOUND")
    // The saved choice is left as it was, so it comes back if the sound does.
    const [room] = await db
      .select()
      .from(pomodoroPersonalRooms)
      .where(eq(pomodoroPersonalRooms.userId, member))
    expect(room.sound).toBe("curated:rain")
    expect((await loadMediaCatalog(db)).sounds.some((sound) => sound.key === "rain")).toBe(false)
  })
})

describe("changes over ticked rows", () => {
  it("counts what changed, what was already that way and what could not go Live", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const drafts = await createCatalogDrafts({
      kind: "sound",
      files: [{ name: "night_rain.mp3", path: SOURCE, kind: "audio", url: null }],
      actorUserId: admin,
    })
    const lofi = await itemByKey("sound", "lofi")

    const result = await setAdminCatalogStatus({
      ids: [lofi!.id, drafts[0]],
      status: "live",
      actorUserId: admin,
    })
    // The draft has no file and no picture yet, so it cannot go Live.
    expect(result).toEqual({ changed: [], same: [lofi!.id], skipped: [drafts[0]] })

    const priced = await setAdminCatalogLocked({ ids: [lofi!.id], locked: true, actorUserId: admin })
    expect(priced.changed).toEqual([lofi!.id])
    forgetMediaCatalog()
    expect((await loadMediaCatalog(db)).sounds.find((sound) => sound.key === "lofi")?.locked).toBe(true)
  })

  it("gives a sound saved with no picture one of the built-in graphics", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput({ pictureUrl: null, label: "No picture" }),
      actorUserId: admin,
    })
    expect(SOUND_GRAPHICS).toContain(saved.pictureUrl)
    const [id] = await createCatalogDrafts({
      kind: "sound",
      files: [{ name: "dropped.mp3", path: SOURCE, kind: "audio", url: null }],
      actorUserId: admin,
    })
    const [dropped] = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, id))
    expect(SOUND_GRAPHICS).toContain(dropped.pictureUrl)
  })

  it("names a dropped file after itself and makes it a Draft", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [id] = await createCatalogDrafts({
      kind: "sound",
      files: [{ name: "night_rain-long.mp3", path: SOURCE, kind: "audio", url: null }],
      actorUserId: admin,
    })
    const [row] = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, id))
    expect(row).toMatchObject({ label: "Night rain long", status: "draft", fileStatus: "queued" })
  })

  it("puts one kind in the dragged order", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const { rows } = await listAdminCatalog({
      kind: "theme",
      search: "",
      status: "all",
      access: "all",
      tag: null,
      sort: "position",
      direction: "asc",
      page: 1,
      pageSize: 25,
    })
    const reversed = rows.map((row) => row.id).reverse()
    await reorderAdminCatalog({ kind: "theme", ids: reversed, actorUserId: admin })
    forgetMediaCatalog()
    expect((await loadMediaCatalog(db)).themes[0].key).toBe("fireplace")
  })

  it("deletes items, removes their uploaded files and never touches the built-in ones", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({ id: null, kind: "sound", input: soundInput(), actorUserId: admin })
    const plain = await itemByKey("theme", "plain")
    vi.mocked(deleteFromR2).mockClear()

    const result = await deleteAdminCatalogItems({ ids: [saved.id, plain!.id], actorUserId: admin })

    expect(result.deleted.sort()).toEqual([saved.id, plain!.id].sort())
    expect(vi.mocked(deleteFromR2).mock.calls.map(([path]) => path)).toEqual([SOURCE])
  })

  it("counts who has each item, in personal rooms", async () => {
    const member = (await insertUser(db)).id
    await savePersonalSound(member, "curated:cafe")
    const { rows } = await listAdminCatalog({
      kind: "sound",
      search: "café",
      status: "all",
      access: "all",
      tag: null,
      sort: "position",
      direction: "asc",
      page: 1,
      pageSize: 25,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: "cafe", personalCount: 1, roomCount: 0 })
  })
})

describe("the worker", () => {
  it("fails a job whose worker died on its last attempt, rather than taking it again", async () => {
    const [item] = await db.select().from(pomodoroCatalogItems).limit(1)
    await db
      .update(pomodoroCatalogItems)
      .set({
        sourcePath: "pomodoro-catalog/sources/dead.mp4",
        sourceKind: "video",
        fileStatus: "processing",
        attempts: CATALOG_MAX_ATTEMPTS,
        claimedAt: new Date(Date.now() - 60 * 60_000),
      })
      .where(eq(pomodoroCatalogItems.id, item.id))

    expect(await claimNextCatalogFile()).toBeNull()
    const [after] = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, item.id))
    expect(after.fileStatus).toBe("failed")
    expect(after.fileError).toMatch(/stopped processing three times/)
  })
})
