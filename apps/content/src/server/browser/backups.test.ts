import type { PGlite } from "@electric-sql/pglite"
import { gzipSync } from "node:zlib"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { DockerRequestError } from "./docker"
import { promoBrowserSessions, promoProfileBackups, promoProfileEvents } from "./schema"

vi.mock("./docker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./docker")>()
  return { ...actual, dockerRequest: vi.fn(), dockerBytes: vi.fn() }
})

vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(),
  deleteFromR2: vi.fn(),
  getFromR2: vi.fn(),
}))

const docker = await import("./docker")
const dockerRequest = vi.mocked(docker.dockerRequest)
const dockerBytes = vi.mocked(docker.dockerBytes)
const storage = await import("@/server/media/storage")
const upload = vi.mocked(storage.uploadToR2)
const remove = vi.mocked(storage.deleteFromR2)
const download = vi.mocked(storage.getFromR2)

const { createProfile } = await import("./profiles")
const { backupProfile, restoreProfile, sealBackup, openBackup, KEEP_BACKUPS } = await import("./backups")

const ARCHIVE = Buffer.from("profile/cookies.sqlite: signed in as someone")

/**
 * Backing a profile's volume up to R2 and restoring it. Docker and R2 are
 * faked, so what is checked is what was asked of them, what was stored, and
 * what was refused.
 */
describe("profile backups", () => {
  beforeAll(() => vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only"))
  afterAll(() => vi.unstubAllEnvs())

  let client: PGlite
  let db: TestDatabase
  let userId: string
  let profileId: string
  /** Whether the profile's volume exists, as Docker would say. */
  let volume: boolean

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    profileId = await createProfile(userId, { name: "Main" }, db)
    volume = true
    dockerRequest.mockReset().mockImplementation(async (_connection, method, path) => {
      if (method === "GET" && path.startsWith("/volumes/")) {
        if (volume) return {}
        throw new DockerRequestError("GET", path, 404, "no such volume")
      }
      if (path.startsWith("/containers/create")) return { Id: "helper-1" }
      if (method === "DELETE" && path.startsWith("/volumes/")) volume = false
      if (path === "/volumes/create") volume = true
      return {}
    })
    dockerBytes.mockReset().mockResolvedValue(ARCHIVE)
    upload.mockReset()
    remove.mockReset()
    download.mockReset()
  })

  afterEach(async () => {
    await client.close()
  })

  /** Hands back, from the fake R2, exactly what the last upload stored. */
  function storeUploads() {
    const objects = new Map<string, Uint8Array>()
    upload.mockImplementation(async (key, data) => {
      objects.set(key, data)
    })
    download.mockImplementation(async (key) => {
      const data = objects.get(key)!
      return { Body: { transformToByteArray: async () => data } } as never
    })
    return objects
  }

  it("seals an archive that opens again only with the same key", () => {
    const sealed = sealBackup(ARCHIVE)

    expect(sealed.subarray(0, 4).toString()).toBe("PRB1")
    expect(sealed.includes(ARCHIVE)).toBe(false)
    expect(openBackup(sealed).equals(ARCHIVE)).toBe(true)

    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "some other server's key")
    expect(() => openBackup(sealed)).toThrow("made with a different server key")
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
  })

  it("sends R2 only the encrypted volume, and records it", async () => {
    const objects = storeUploads()

    await backupProfile(userId, profileId, db)

    const [stored] = [...objects.values()]
    expect(Buffer.from(stored).includes(ARCHIVE)).toBe(false)
    expect(Buffer.from(stored).includes(gzipSync(ARCHIVE).subarray(10))).toBe(false)
    const [row] = await db.select().from(promoProfileBackups)
    expect(row.sizeBytes).toBe(stored.length)
    expect(row.objectKey).toBe(`promo-backups/${profileId}/${row.id}.bin`)
    // The helper that read the volume never ran and is gone.
    expect(dockerRequest.mock.calls.some(([, , path]) => path.endsWith("/start"))).toBe(false)
    expect(dockerRequest.mock.calls.some(([, method, path]) => method === "DELETE" && path.startsWith("/containers/helper-1"))).toBe(true)
    const events = await db.select().from(promoProfileEvents)
    expect(events.map((event) => event.kind)).toEqual(["backed_up"])
  })

  it("refuses while the browser is open, and when there is nothing to back up", async () => {
    await db.insert(promoBrowserSessions).values({
      id: uuid(),
      userId,
      profileId,
      status: "running",
      commandPort: 7900,
      streamPort: 8900,
      streamPasswordEncrypted: "x.y.z",
    })
    await expect(backupProfile(userId, profileId, db)).rejects.toThrow("Main's browser is open. Stop it first")

    await db.delete(promoBrowserSessions)
    volume = false
    await expect(backupProfile(userId, profileId, db)).rejects.toThrow("has never opened a browser")
    expect(upload).not.toHaveBeenCalled()
  })

  it(`keeps the newest ${KEEP_BACKUPS} and drops the oldest from R2 and the list`, async () => {
    storeUploads()
    for (let made = 0; made < KEEP_BACKUPS + 1; made += 1) {
      await backupProfile(userId, profileId, db)
      // Apart in time, so newest-first is certain.
      await db.update(promoProfileBackups).set({ createdAt: new Date(Date.now() - (10 - made) * 60_000) })
    }

    const rows = await db.select().from(promoProfileBackups)
    expect(rows).toHaveLength(KEEP_BACKUPS)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it("restores onto a machine with no volume, and refuses to replace one unless told", async () => {
    storeUploads()
    await backupProfile(userId, profileId, db)
    const [backup] = await db.select().from(promoProfileBackups)

    // A volume is already here: refused, and nothing on the machine changed.
    dockerRequest.mockClear()
    await expect(restoreProfile(userId, profileId, { backupId: backup.id, replace: false }, db)).rejects.toThrow(
      "already has browser data on this machine"
    )
    expect(dockerRequest.mock.calls.some(([, method]) => method === "DELETE" || method === "POST")).toBe(false)

    // Gone, as on a new machine: restored, and the archive written back whole.
    volume = false
    await restoreProfile(userId, profileId, { backupId: backup.id, replace: false }, db)
    const put = dockerBytes.mock.calls.find(([, method]) => method === "PUT")
    expect(put?.[2]).toContain("/archive?path=%2Fdata")
    expect(put?.[3].body?.equals(ARCHIVE)).toBe(true)

    // Told to replace: the volume is deleted and made again.
    await restoreProfile(userId, profileId, { backupId: backup.id, replace: true }, db)
    expect(dockerRequest.mock.calls.some(([, method, path]) => method === "DELETE" && path.startsWith("/volumes/"))).toBe(true)
  })

  it("leaves the volume alone when the backup cannot be opened", async () => {
    storeUploads()
    await backupProfile(userId, profileId, db)
    const [backup] = await db.select().from(promoProfileBackups)
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "some other server's key")
    dockerRequest.mockClear()

    await expect(restoreProfile(userId, profileId, { backupId: backup.id, replace: true }, db)).rejects.toThrow(
      "cannot be opened"
    )
    expect(dockerRequest.mock.calls.some(([, method]) => method === "DELETE")).toBe(false)
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
  })

  it("says Docker failed in one sentence, and logs Docker's own reason", async () => {
    dockerBytes.mockRejectedValue(new DockerRequestError("GET", "/containers/helper-1/archive", 500, "disk full on /var/lib/docker"))
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(backupProfile(userId, profileId, db)).rejects.toThrow(
      "The browser could not be backed up. Check the Docker logs."
    )
    expect(JSON.stringify(logged.mock.calls)).toContain("disk full")
    logged.mockRestore()
  })

  it("refuses another person's profile and backup", async () => {
    const stranger = (await insertUser(db, { role: "admin" })).id
    storeUploads()
    await backupProfile(userId, profileId, db)
    const [backup] = await db.select().from(promoProfileBackups)

    await expect(backupProfile(stranger, profileId, db)).rejects.toThrow("does not exist")
    await expect(restoreProfile(stranger, profileId, { backupId: backup.id, replace: true }, db)).rejects.toThrow(
      "does not exist"
    )
  })
})
