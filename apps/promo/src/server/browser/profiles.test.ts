import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { promoAccounts } from "@/server/social/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import { DockerRequestError } from "./docker"
import {
  promoBrowserSessions,
  promoProfileEvents,
  promoProfiles,
  promoProxies,
} from "./schema"

vi.mock("./docker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./docker")>()
  return { ...actual, dockerRequest: vi.fn() }
})

const { dockerRequest } = await import("./docker")
const docker = vi.mocked(dockerRequest)

const {
  createLabel,
  createProfile,
  deleteProfiles,
  duplicateProfile,
  labelProfiles,
  listFoldersAndLabels,
  listProfiles,
  profileHistory,
  requestNewIdentity,
  tagProfiles,
  updateProfile,
} = await import("./profiles")
const { saveAccount } = await import("@/server/social/accounts")

/**
 * The Browser profiles dashboard's records. Docker is faked, so deleting a
 * profile is checked by what was asked of Docker and what the rows say.
 */
describe("browser profiles", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    docker.mockReset()
    docker.mockResolvedValue({})
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  async function proxy(country = "US") {
    const id = uuid()
    await db.insert(promoProxies).values({ id, userId, label: `${country} line`, host: "gate.example.test", port: 8080, country })
    return id
  }

  async function run(profileId: string, values: Partial<typeof promoBrowserSessions.$inferInsert>) {
    await db.insert(promoBrowserSessions).values({
      id: uuid(),
      userId,
      profileId,
      status: "stopped",
      ...values,
    })
  }

  const input = {
    name: "Main",
    proxyId: null,
    notes: "",
    folderId: null,
    labelId: null,
    tags: [],
  }

  it("shows whether the browser is open and who is signed in, from rows alone", async () => {
    const id = await createProfile(userId, { name: "Main" }, db)
    await db.insert(promoAccounts).values({ id: uuid(), userId, profileId: id, handle: "a_persona" })
    await run(id, { status: "running", commandPort: 7900, streamPort: 8900, exitCountry: "US" })

    const [row] = await listProfiles(userId, db)
    expect(row.browser).toBe("open")
    expect(row.lastCountry).toBe("US")
    expect(row.lastRanAt).toBeInstanceOf(Date)
  })

  it("says an open browser is still on its old proxy after the proxy changes", async () => {
    const first = await proxy("US")
    const second = await proxy("DE")
    const id = await createProfile(userId, { name: "Main", proxyId: first }, db)
    await run(id, { status: "running", commandPort: 7900, streamPort: 8900, proxyId: first })

    expect((await listProfiles(userId, db))[0].onOldProxy).toBe(false)
    await updateProfile(userId, id, { ...input, proxyId: second }, db)
    expect((await listProfiles(userId, db))[0].onOldProxy).toBe(true)

    // And the change is in the profile's history.
    const [event] = await db.select().from(promoProfileEvents)
    expect(event.kind).toBe("proxy_changed")
    expect(event.detail).toBe("US line to DE line")
  })

  it("refuses another person's proxy, folder or label", async () => {
    const other = (await insertUser(db, { role: "admin" })).id
    const theirs = uuid()
    await db.insert(promoProxies).values({ id: theirs, userId: other, host: "x.example.test", port: 1 })

    await expect(createProfile(userId, { name: "Main", proxyId: theirs }, db)).rejects.toThrow(
      "That proxy does not exist."
    )
  })

  describe("deleting", () => {
    it("removes the cookie volume, then the profile, and keeps its account with no profile", async () => {
      const id = await createProfile(userId, { name: "Main" }, db)
      await db.insert(promoAccounts).values({ id: "a1", userId, profileId: id, handle: "a_persona" })
      await run(id, { status: "stopped" })

      const result = await deleteProfiles(userId, [id], db)

      expect(result).toEqual({ deleted: [id], kept: [] })
      expect(docker).toHaveBeenCalledWith(expect.anything(), "DELETE", `/volumes/promo-profile-${id}`)
      const [account] = await db.select().from(promoAccounts)
      expect(account.profileId).toBeNull()
    })

    it("keeps a profile whose browser is open, and says why", async () => {
      const id = await createProfile(userId, { name: "Main" }, db)
      await run(id, { status: "running", commandPort: 7900, streamPort: 8900 })

      const result = await deleteProfiles(userId, [id], db)

      expect(result.kept).toEqual([{ id, name: "Main", reason: "its browser is open" }])
      expect(docker).not.toHaveBeenCalled()
    })

    it("keeps the profile when Docker will not remove its cookies", async () => {
      const id = await createProfile(userId, { name: "Main" }, db)
      await run(id, { status: "stopped" })
      docker.mockRejectedValue(new DockerRequestError("DELETE", "/volumes/x", 409, "volume in use"))

      const result = await deleteProfiles(userId, [id], db)

      expect(result.deleted).toEqual([])
      expect(result.kept[0].reason).toContain("could not remove its cookies")
      expect(await db.select().from(promoProfiles)).toHaveLength(1)
    })

    it("treats a volume that was never made as already gone", async () => {
      const id = await createProfile(userId, { name: "Gone already" }, db)
      await run(id, { status: "stopped" })
      docker.mockRejectedValue(new DockerRequestError("DELETE", "/volumes/x", 404, "no such volume"))

      expect((await deleteProfiles(userId, [id], db)).deleted).toEqual([id])
    })

    it("does not ask Docker about a profile whose browser never opened", async () => {
      const id = await createProfile(userId, { name: "Never opened" }, db)
      docker.mockRejectedValue(new Error("no Docker on this machine"))

      expect((await deleteProfiles(userId, [id], db)).deleted).toEqual([id])
      expect(docker).not.toHaveBeenCalled()
    })
  })

  it("duplicates with the same settings, its own volume, and none of the identity", async () => {
    const proxyId = await proxy()
    const id = await createProfile(userId, { name: "Main", proxyId, tags: ["warm"] }, db)
    await db.update(promoProfiles).set({ fingerprint: { id: "the-original-machine", seen: undefined } }).where(eq(promoProfiles.id, id))

    const copyId = await duplicateProfile(userId, id, db)

    const [copy] = await db.select().from(promoProfiles).where(eq(promoProfiles.id, copyId))
    expect(copy.name).toBe("Main copy")
    expect(copy.proxyId).toBe(proxyId)
    expect(copy.tags).toEqual(["warm"])
    expect(copy.volumeName).toBe(`promo-profile-${copyId}`)
    expect(copy.fingerprint).toBeNull()
  })

  describe("ticking several and changing them at once", () => {
    it("labels three and says three", async () => {
      const ids = [
        await createProfile(userId, { name: "A" }, db),
        await createProfile(userId, { name: "B" }, db),
        await createProfile(userId, { name: "C" }, db),
      ]
      const labelId = await createLabel(userId, "Warming up", db)

      const result = await labelProfiles(userId, ids, labelId, db)

      expect(result.done).toHaveLength(3)
      expect(result.skipped).toEqual([])
      const rows = await db.select().from(promoProfiles)
      expect(rows.every((row) => row.labelId === labelId)).toBe(true)
    })

    it("skips another person's profile and reports it", async () => {
      const other = (await insertUser(db, { role: "admin" })).id
      const mine = await createProfile(userId, { name: "Mine" }, db)
      const theirs = await createProfile(other, { name: "Theirs" }, db)

      const result = await tagProfiles(userId, [mine, theirs], "warm", db)

      expect(result).toEqual({ done: [mine], skipped: [theirs] })
    })

    it("adds a tag once, however it is capitalised", async () => {
      const id = await createProfile(userId, { name: "A", tags: ["Warm"] }, db)
      await tagProfiles(userId, [id], "warm", db)
      await tagProfiles(userId, [id], "us-east", db)

      const [row] = await db.select().from(promoProfiles)
      expect(row.tags).toEqual(["Warm", "us-east"])
    })
  })

  it("asks for a new identity without touching the one in use", async () => {
    const id = await createProfile(userId, { name: "Main" }, db)
    await db.update(promoProfiles).set({ fingerprint: { id: "machine-1" } })

    await requestNewIdentity(userId, id, db)

    const [row] = await db.select().from(promoProfiles)
    expect(row.fingerprint).toEqual({ id: "machine-1", renew: true })
  })

  it("starts a person with Ready, Warming and Banned", async () => {
    const { labels } = await listFoldersAndLabels(userId, db)
    expect(labels.map((one) => one.name)).toEqual(["Ready", "Warming", "Banned"])
    // And never twice.
    expect((await listFoldersAndLabels(userId, db)).labels).toHaveLength(3)
  })

  it("refuses a second label with the same name", async () => {
    await createLabel(userId, "Old", db)
    await expect(createLabel(userId, "old", db)).rejects.toThrow("already a label")
  })

  describe("the history in a profile's window", () => {
    it("lists runs and events newest first, saying how each run ended", async () => {
      const id = await createProfile(userId, { name: "Main" }, db)
      const at = (minutes: number) => new Date(Date.UTC(2099, 0, 1, 12, minutes))
      // A row from before endings were kept: the stored 120-second failure.
      await run(id, {
        status: "error",
        startedAt: at(0),
        endedAt: at(2),
        lastError: "The browser did not become ready within 120 seconds.",
      })
      await run(id, { status: "stopped", endedBy: "idle", startedAt: at(10), endedAt: at(70) })
      await db.insert(promoProfileEvents).values({
        id: uuid(),
        userId,
        profileId: id,
        kind: "browser_dead",
        detail: "The browser stopped on its own with exit code 137.",
        createdAt: at(80),
      })

      const history = await profileHistory(userId, id, db)

      expect(history.map((entry) => (entry.kind === "run" ? entry.ending : entry.kind))).toEqual([
        "browser_dead",
        "idle",
        "failed",
      ])
      const failed = history[2]
      expect(failed.kind === "run" && failed.reason).toBe(
        "The browser did not become ready within 120 seconds."
      )
    })

    it("marks the first run on a new browser build", async () => {
      const id = await createProfile(userId, { name: "Main" }, db)
      const at = (minutes: number) => new Date(Date.UTC(2099, 0, 1, 12, minutes))
      await run(id, { status: "stopped", startedAt: at(0), imageId: "" })
      await run(id, { status: "stopped", startedAt: at(10), imageId: "sha256:a" })
      await run(id, { status: "stopped", startedAt: at(20), imageId: "sha256:a" })
      await run(id, { status: "stopped", startedAt: at(30), imageId: "sha256:b" })

      const runs = (await profileHistory(userId, id, db)).filter((entry) => entry.kind === "run")

      // Newest first: only the run that moved from build a to build b says so.
      expect(runs.map((entry) => entry.kind === "run" && entry.newBuild)).toEqual([true, false, false, false])
    })

    it("shows nothing of another person's profile", async () => {
      const other = (await insertUser(db, { role: "admin" })).id
      const id = await createProfile(other, { name: "Theirs" }, db)
      await run(id, { userId: other, status: "stopped" })

      expect(await profileHistory(userId, id, db)).toEqual([])
    })
  })

  describe("picking a profile for the Reddit account", () => {
    it("refuses a profile that already holds another Reddit account, naming it", async () => {
      const id = await createProfile(userId, { name: "Main" }, db)
      await db.insert(promoAccounts).values({ id: "other", userId, profileId: id, platform: "reddit" })

      // The person's own Reddit account is not that one, so it is refused.
      await db.update(promoAccounts).set({ userId: (await insertUser(db, { role: "admin" })).id })
      await expect(
        saveAccount(userId, { profileId: id, voiceId: null }, db)
      ).rejects.toThrow("The profile Main already has a Reddit account in it.")
    })

    it("saves the pick and reads it back with the profile's name", async () => {
      const id = await createProfile(userId, { name: "Main" }, db)

      const saved = await saveAccount(userId, { profileId: id, voiceId: null }, db)

      expect(saved.profile).toEqual({ id, name: "Main" })
    })
  })
})
