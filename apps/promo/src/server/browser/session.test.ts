import type { PGlite } from "@electric-sql/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import { DockerRequestError } from "./docker"
import {
  promoBrowserSessions,
  promoBrowserSettings,
  promoProfileEvents,
  promoProfiles,
  promoProxies,
} from "./schema"

vi.mock("./docker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./docker")>()
  return { ...actual, dockerRequest: vi.fn() }
})

vi.mock("./command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./command")>()
  return {
    ...actual,
    browserHealth: vi.fn().mockResolvedValue({ ok: true }),
    browserIdentityId: vi.fn(),
    browserIdentity: vi.fn(),
  }
})

const command = await import("./command")
const identityId = vi.mocked(command.browserIdentityId)
const identityReading = vi.mocked(command.browserIdentity)
const reading = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
  platform: "Win32",
  oscpu: "",
  hardwareConcurrency: 8,
  screen: { width: 1536, height: 960, colorDepth: 24 },
  devicePixelRatio: 1,
  gpuVendor: "",
  gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar",
  fonts: ["Arial"],
  timezone: "UTC",
  languages: ["en-US"],
}

const { dockerRequest } = await import("./docker")
const docker = vi.mocked(dockerRequest)

const { createProfile } = await import("./profiles")
const {
  ensureSession,
  reapIdleSessions,
  markDeadSessions,
  removeOrphanContainers,
  stopSession,
  streamWindow,
} = await import("./session")

/**
 * The browser housekeeping that needs no key: closing one gently, noticing one
 * that died, and clearing away containers nothing claims. Docker is faked, so
 * what is checked is what was asked of it and what the rows say afterwards.
 */
describe("looking after the browsers", () => {
  // The window's password is stored encrypted, which needs a key.
  beforeAll(() => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  let client: PGlite
  let db: TestDatabase
  let userId: string
  let profileId: string

  beforeEach(async () => {
    docker.mockReset()
    identityId.mockReset().mockResolvedValue({ id: "machine-1", made: true })
    identityReading.mockReset().mockResolvedValue(reading)
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    profileId = await createProfile(userId, { name: "Main" }, db)
  })

  afterEach(async () => {
    await client.close()
  })

  async function liveSession(status: "running" | "starting" = "running") {
    const id = uuid()
    await db.insert(promoBrowserSessions).values({
      id,
      userId,
      profileId,
      status,
      containerId: `container-${id.slice(0, 6)}`,
      commandPort: 7900,
      streamPort: 8900,
      streamPasswordEncrypted: encryptSecret("watch-me"),
    })
    return id
  }

  async function row(id: string) {
    const rows = await db.select().from(promoBrowserSessions)
    return rows.find((each) => each.id === id)!
  }

  it("opens a browser on the volume stored on the profile, whatever it is called", async () => {
    // The adopted profiles keep their account's old volume name, so the name
    // must come from the row and never be worked out from the profile's id.
    await db.update(promoProfiles).set({ volumeName: "promo-profile-the-old-account" })
    docker.mockImplementation(async (_connection, _method, path) =>
      path.startsWith("/containers/create") ? { Id: "new-container" } : {}
    )

    const live = await ensureSession(userId, profileId, db)

    const volume = docker.mock.calls.find(([, , path]) => path === "/volumes/create")
    expect(volume?.[3]).toMatchObject({ Name: "promo-profile-the-old-account" })
    const created = docker.mock.calls.find(([, , path]) => path.startsWith("/containers/create"))
    const spec = created?.[3] as { HostConfig: { Binds: string[] }; Env: string[] }
    expect(spec.HostConfig.Binds).toEqual(["promo-profile-the-old-account:/data/profile"])

    // The command key is in memory only; the window's password is on the row,
    // encrypted, so a dashboard can show it without the key.
    const saved = await row(live.id)
    expect(saved.status).toBe("running")
    expect(saved.streamPasswordEncrypted).not.toBe("")
    expect(JSON.stringify(saved)).not.toContain(live.target.token)
    expect(spec.Env.some((line) => line.includes(saved.streamPasswordEncrypted))).toBe(false)
  })

  it("refuses to open behind a proxy that failed its last test, and says which", async () => {
    await db.insert(promoProxies).values({
      id: "dead",
      userId,
      label: "US-residential-3",
      host: "gate.example.test",
      port: 8080,
      lastTestedAt: new Date(2099, 5, 10, 14, 2),
      lastTestResult: { ok: false, error: "timed out" },
    })
    await db.update(promoProfiles).set({ proxyId: "dead" })

    await expect(ensureSession(userId, profileId, db)).rejects.toThrow(
      "The proxy US-residential-3 failed its last test at 14:02. Test it on the Proxies dashboard."
    )
    // Nothing was started, and the refusal is in the profile's history.
    expect(docker).not.toHaveBeenCalled()
    const [event] = await db.select().from(promoProfileEvents)
    expect(event.kind).toBe("proxy_refused")
  })

  it("records the proxy and country a browser opened with", async () => {
    await db.insert(promoProxies).values({
      id: "line",
      userId,
      host: "gate.example.test",
      port: 8080,
      lastTestResult: { ok: true, country: "de" },
    })
    await db.update(promoProfiles).set({ proxyId: "line" })
    docker.mockImplementation(async (_connection, _method, path) =>
      path.startsWith("/containers/create") ? { Id: "new-container" } : {}
    )

    const live = await ensureSession(userId, profileId, db)

    const saved = await row(live.id)
    expect(saved.proxyId).toBe("line")
    expect(saved.exitCountry).toBe("DE")
  })

  it("says an idle browser was shut for being idle", async () => {
    const id = await liveSession()
    await db.update(promoBrowserSessions).set({ lastActivityAt: new Date(Date.now() - 2 * 60 * 60_000) })
    docker.mockResolvedValue({})

    expect(await reapIdleSessions(db)).toBe(1)
    expect((await row(id)).endedBy).toBe("idle")
  })

  it("shuts an idle browser after the minutes set in Settings, not before", async () => {
    await db.update(promoBrowserSettings).set({ idleMinutes: 180 })
    const id = await liveSession()
    await db.update(promoBrowserSessions).set({ lastActivityAt: new Date(Date.now() - 2 * 60 * 60_000) })
    docker.mockResolvedValue({})

    expect(await reapIdleSessions(db)).toBe(0)
    expect((await row(id)).status).toBe("running")
  })

  /** Docker that answers a create with an id and an inspect with an image. */
  function dockerThatStarts(image = "sha256:build-1") {
    docker.mockImplementation(async (_connection, method, path) => {
      if (path.startsWith("/containers/create")) return { Id: "new-container" }
      if (method === "GET" && path.endsWith("/json")) return { Image: image }
      return {}
    })
  }

  async function profileRow() {
    const [profile] = await db.select().from(promoProfiles)
    return profile
  }

  it("keeps the identity a first launch made, and what a page read through it", async () => {
    dockerThatStarts()
    const live = await ensureSession(userId, profileId, db)

    const { fingerprint } = await profileRow()
    expect(fingerprint).toMatchObject({ id: "machine-1", seen: reading })
    expect((await row(live.id)).imageId).toBe("sha256:build-1")
    // The first launch asked for no particular identity.
    const env = (docker.mock.calls.find(([, , path]) => path.startsWith("/containers/create"))?.[3] as { Env: string[] }).Env
    expect(env).not.toContain("FP_NEW_IDENTITY=1")
  })

  it("still opens when Docker will not say which image a container runs", async () => {
    docker.mockImplementation(async (_connection, method, path) => {
      if (path.startsWith("/containers/create")) return { Id: "new-container" }
      if (method === "GET" && path.endsWith("/json")) throw new DockerRequestError("GET", path, 500, "busy")
      return {}
    })

    const live = await ensureSession(userId, profileId, db)

    expect((await row(live.id)).status).toBe("running")
    expect((await row(live.id)).imageId).toBe("")
  })

  it("does not read the page again when the same identity comes back", async () => {
    dockerThatStarts()
    await ensureSession(userId, profileId, db)
    await stopSession(profileId, db)
    identityReading.mockClear()
    identityId.mockResolvedValue({ id: "machine-1", made: false })

    await ensureSession(userId, profileId, db)

    expect(identityReading).not.toHaveBeenCalled()
  })

  it("asks for a new identity once, and clears the request at that launch", async () => {
    dockerThatStarts()
    await db.update(promoProfiles).set({ fingerprint: { id: "machine-1", seen: reading, renew: true } })
    identityId.mockRejectedValue(new Error("the identity could not be read"))

    await ensureSession(userId, profileId, db)

    const env = (docker.mock.calls.find(([, , path]) => path.startsWith("/containers/create"))?.[3] as { Env: string[] }).Env
    expect(env).toContain("FP_NEW_IDENTITY=1")
    // Even with the read failing, the next launch will not make yet another.
    expect((await profileRow()).fingerprint?.renew).toBeUndefined()
  })

  it("refuses one browser past the limit, counting every open one, and says how many", async () => {
    await db.update(promoBrowserSettings).set({ maxOpen: 2 })
    await liveSession("starting")
    const other = await createProfile(userId, { name: "Other" }, db)
    dockerThatStarts()
    await ensureSession(userId, other, db)
    const third = await createProfile(userId, { name: "Third" }, db)

    await expect(ensureSession(userId, third, db)).rejects.toThrow(
      "2 browsers are open, which is the limit. Stop one on the Browser profiles dashboard, or raise the limit in Settings."
    )
    const rows = await db.select().from(promoBrowserSessions)
    expect(rows.filter((each) => each.profileId === third)).toHaveLength(0)
  })

  it("gives each browser a memory and processor ceiling with no swap on top", async () => {
    dockerThatStarts()

    await ensureSession(userId, profileId, db)

    const options = docker.mock.calls.find(([, , path]) => path.startsWith("/containers/create"))?.[3] as {
      HostConfig: { Memory: number; MemorySwap: number; NanoCpus: number }
    }
    expect(options.HostConfig.Memory).toBe(1536 * 1024 * 1024)
    expect(options.HostConfig.MemorySwap).toBe(options.HostConfig.Memory)
    expect(options.HostConfig.NanoCpus).toBe(1e9)
  })

  it("moves to the next ports when Docker says one is taken, leaving no failed run behind", async () => {
    let starts = 0
    docker.mockImplementation(async (_connection, method, path) => {
      if (path.startsWith("/containers/create")) return { Id: `container-${starts}` }
      if (path.endsWith("/start")) {
        starts += 1
        if (starts === 1) {
          throw new DockerRequestError(
            "POST",
            path,
            500,
            '{"message":"Bind for 127.0.0.1:7900 failed: port is already allocated"}'
          )
        }
      }
      if (method === "GET" && path.endsWith("/json")) return { Image: "sha256:build-1" }
      return {}
    })

    const live = await ensureSession(userId, profileId, db)

    expect(live.target.port).toBe(7901)
    const rows = await db.select().from(promoBrowserSessions)
    expect(rows.map((each) => each.status)).toEqual(["running"])
    expect(docker.mock.calls.some(([, method, path]) => method === "DELETE" && path.startsWith("/containers/container-0"))).toBe(true)
  })

  it("still fails at once on a start error that is not about ports", async () => {
    docker.mockImplementation(async (_connection, _method, path) => {
      if (path.startsWith("/containers/create")) return { Id: "new-container" }
      if (path.endsWith("/start")) throw new DockerRequestError("POST", path, 500, '{"message":"no such image"}')
      return {}
    })

    await expect(ensureSession(userId, profileId, db)).rejects.toThrow()
    const rows = await db.select().from(promoBrowserSessions)
    expect(rows.map((each) => each.status)).toEqual(["error"])
  })

  it("gives a second profile a volume of its own", async () => {
    const second = await createProfile(userId, { name: "Second" }, db)
    const profiles = await db.select().from(promoProfiles)
    const volumes = profiles.map((profile) => profile.volumeName)

    expect(new Set(volumes).size).toBe(2)
    expect(volumes).toContain(`promo-profile-${second}`)
  })

  it("asks a browser to stop and waits before removing it, keeping the volume", async () => {
    const id = await liveSession()
    docker.mockResolvedValue({})

    await stopSession(profileId, db)

    const calls = docker.mock.calls.map(([, method, path]) => `${method} ${path}`)
    expect(calls[0]).toMatch(/^POST \/containers\/container-[^/]+\/stop\?t=10$/)
    expect(calls[1]).toMatch(/^DELETE \/containers\/container-[^/]+\?force=true&v=false$/)
    expect((await row(id)).status).toBe("stopped")
    expect((await row(id)).endedBy).toBe("closed")
  })

  it("still removes a browser that had already stopped", async () => {
    await liveSession()
    docker
      .mockRejectedValueOnce(new DockerRequestError("POST", "/stop", 404, "no such container"))
      .mockResolvedValueOnce({})

    await stopSession(profileId, db)

    expect(docker.mock.calls[1][1]).toBe("DELETE")
  })

  it("marks a browser dead when its container has stopped, with why and when", async () => {
    const id = await liveSession()
    docker.mockResolvedValue({ State: { Running: false, ExitCode: 137 } })

    expect(await markDeadSessions(db)).toBe(1)

    const dead = await row(id)
    expect(dead.status).toBe("error")
    expect(dead.endedBy).toBe("dead")
    expect(dead.lastError).toContain("exit code 137")
    expect(dead.endedAt).toBeInstanceOf(Date)
    const [event] = await db.select().from(promoProfileEvents)
    expect(event).toMatchObject({ kind: "browser_dead", profileId })
  })

  it("marks a browser dead when its container was removed by hand", async () => {
    const id = await liveSession()
    docker.mockRejectedValue(new DockerRequestError("GET", "/json", 404, "no such container"))

    expect(await markDeadSessions(db)).toBe(1)
    expect((await row(id)).lastError).toContain("removed outside the app")
  })

  it("leaves a running browser alone", async () => {
    const id = await liveSession()
    docker.mockResolvedValue({ State: { Running: true } })

    expect(await markDeadSessions(db)).toBe(0)
    expect((await row(id)).status).toBe("running")
  })

  it("never calls a browser dead just because Docker did not answer", async () => {
    const id = await liveSession()
    docker.mockRejectedValue(new DockerRequestError("GET", "/json", 500, "daemon trouble"))

    await expect(markDeadSessions(db)).rejects.toThrow()
    expect((await row(id)).status).toBe("running")
  })

  it("does not ask about a browser that is still starting", async () => {
    await liveSession("starting")

    expect(await markDeadSessions(db)).toBe(0)
    expect(docker).not.toHaveBeenCalled()
  })

  it("removes a promo container no live row claims and keeps a claimed one", async () => {
    const claimed = await liveSession()
    docker.mockImplementation(async (_connection, method, path) => {
      if (method === "GET" && path.startsWith("/containers/json")) {
        return [
          { Id: "mine", Labels: { "com.systemeverything.session-id": claimed } },
          { Id: "left-behind", Labels: { "com.systemeverything.session-id": uuid() } },
          { Id: "no-session-label", Labels: {} },
        ]
      }
      return {}
    })

    expect(await removeOrphanContainers(db)).toBe(2)

    const removed = docker.mock.calls
      .filter(([, method]) => method === "DELETE")
      .map(([, , path]) => path)
    expect(removed).toEqual([
      "/containers/left-behind?force=true&v=false",
      "/containers/no-session-label?force=true&v=false",
    ])
  })

  it("only lists containers carrying this database's mark", async () => {
    await liveSession()
    docker.mockResolvedValue([])

    await removeOrphanContainers(db)

    const [, , path] = docker.mock.calls[0]
    const filters = JSON.parse(
      decodeURIComponent(path.slice(path.indexOf("filters=") + "filters=".length))
    )
    // Other worktrees share this Docker with promo databases of their own.
    expect(filters.label[0]).toMatch(/^com\.systemeverything\.promo-owner=[0-9a-f]{16}$/)
  })

  it("asks Docker nothing when no browser was ever opened", async () => {
    expect(await removeOrphanContainers(db)).toBe(0)
    expect(docker).not.toHaveBeenCalled()
  })

  it("hands a dashboard the window's address and its password from the row", () => {
    expect(
      streamWindow({ streamPort: 8901, streamPasswordEncrypted: encryptSecret("watch-me") })
    ).toEqual({ streamUrl: "http://127.0.0.1:8901/", streamPassword: "watch-me" })
    expect(streamWindow({ streamPort: 8901, streamPasswordEncrypted: "" })).toBeNull()
  })
})
