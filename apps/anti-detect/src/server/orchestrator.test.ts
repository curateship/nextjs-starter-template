import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type Db } from "@/server/db"
import {
  DockerConnectionError,
  DockerRequestError,
  dockerConnection,
  dockerCreateOptions,
  listActiveUserSessions,
  serializeBrowserSessionSummary,
  startSession,
  stopSession,
  type BrowserContainerSpec,
  type BrowserDockerClient,
  type OrchestratorConfig,
} from "@/server/orchestrator"
import { createUserProfile, listUserProfiles } from "@/server/profiles"
import { browserSessions, users } from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

const TEST_KEY = "b".repeat(64)

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  process.env.ANTIDETECT_ENCRYPTION_KEY = TEST_KEY
  client = new PGlite()
  const baseline = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const profilesProxies = await readFile(
    new URL("../../drizzle/0004_profiles_proxies.sql", import.meta.url),
    "utf8"
  )
  const proxyProtocol = await readFile(
    new URL("../../drizzle/0005_proxy_protocol.sql", import.meta.url),
    "utf8"
  )
  const organization = await readFile(
    new URL("../../drizzle/0006_profile_organization.sql", import.meta.url),
    "utf8"
  )
  const statusUnique = await readFile(
    new URL("../../drizzle/0007_profile_status_unique.sql", import.meta.url),
    "utf8"
  )
  const browserSession = await readFile(
    new URL("../../drizzle/0008_browser_sessions.sql", import.meta.url),
    "utf8"
  )
  await client.exec(baseline)
  await client.exec(profilesProxies)
  await client.exec(proxyProtocol)
  await client.exec(organization)
  await client.exec(statusUnique)
  await client.exec(browserSession)
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as Db)
})

afterEach(async () => {
  await client.close()
})

const testDb = () => database as unknown as Db

async function seedUser(email: string) {
  const id = uuid()
  const createdAt = now()
  await database.insert(users).values({
    id,
    email,
    name: "Test",
    role: "admin",
    passwordHash: await hash("password123"),
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

function testConfig(): OrchestratorConfig {
  return {
    nodeId: "local",
    image: "anti-detect-camoufox:test",
    streamHost: "127.0.0.1",
    streamBindHost: "127.0.0.1",
    streamPortStart: 18080,
    webrtcPortStart: 52000,
    webrtcPortsPerSession: 20,
    maxSessions: 8,
    nekoUserPassword: "neko",
    nekoAdminPassword: "admin",
    startUrl: "https://example.test",
    readyTimeoutMs: 1,
  }
}

function fakeDocker(): BrowserDockerClient {
  return {
    createVolume: vi.fn().mockResolvedValue(undefined),
    createContainer: vi.fn().mockResolvedValue({ id: "container-1" }),
    startContainer: vi.fn().mockResolvedValue(undefined),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    removeContainer: vi.fn().mockResolvedValue(undefined),
  }
}

describe("browser session orchestrator", () => {
  it("starts one Camoufox session for an owned profile", async () => {
    const userId = await seedUser("start@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const docker = fakeDocker()

    const session = await startSession(userId, profile.id, {
      db: testDb(),
      docker,
      config: testConfig(),
      waitForReady: async () => undefined,
    })

    expect(session.profileId).toBe(profile.id)
    expect(session.status).toBe("running")
    expect(session.streamUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(session.streamUsername).toBe("user")
    expect(session.streamPassword).toBe("neko")
    expect(docker.createVolume).toHaveBeenCalledTimes(1)
    expect(docker.createContainer).toHaveBeenCalledTimes(1)
    const createSpec = vi.mocked(docker.createContainer).mock.calls[0]?.[0]
    expect(createSpec).toEqual(
      expect.objectContaining({ bindHost: "127.0.0.1" })
    )
    expect(createSpec?.env).toEqual(
      expect.arrayContaining([
        "NEKO_MEMBER_MULTIUSER_USER_PASSWORD=neko",
        "NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=admin",
      ])
    )
    expect(docker.startContainer).toHaveBeenCalledWith("container-1")

    const [updatedProfile] = await listUserProfiles(userId, testDb())
    expect(updatedProfile.status).toBe("running")

    const [activeSession] = await listActiveUserSessions(userId, testDb())
    const activeSummary = serializeBrowserSessionSummary(activeSession!)
    expect("streamPassword" in activeSummary).toBe(false)
  })

  it("returns the active session when launch is repeated", async () => {
    const userId = await seedUser("reuse@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const docker = fakeDocker()
    const options = {
      db: testDb(),
      docker,
      config: testConfig(),
      waitForReady: async () => undefined,
    }

    const first = await startSession(userId, profile.id, options)
    const second = await startSession(userId, profile.id, options)

    expect(second.id).toBe(first.id)
    expect(second.streamPassword).toBe(first.streamPassword)
    expect(docker.createContainer).toHaveBeenCalledTimes(1)
  })

  it("deduplicates concurrent launches for the same profile", async () => {
    const userId = await seedUser("concurrent@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const docker = fakeDocker()
    const options = {
      db: testDb(),
      docker,
      config: testConfig(),
      waitForReady: async () => undefined,
    }

    const [first, second] = await Promise.all([
      startSession(userId, profile.id, options),
      startSession(userId, profile.id, options),
    ])

    expect(second.id).toBe(first.id)
    expect(docker.createContainer).toHaveBeenCalledTimes(1)
  })

  it("binds Docker-published ports to the configured host", () => {
    const spec: BrowserContainerSpec = {
      image: "anti-detect-camoufox:test",
      name: "antidetect-session-1",
      labels: {},
      env: [],
      volumeName: "antidetect-profile-1",
      bindHost: "127.0.0.1",
      streamPort: 18080,
      webrtcStartPort: 52000,
      webrtcEndPort: 52001,
    }

    const options = dockerCreateOptions(spec)

    expect(options.HostConfig.PortBindings["8080/tcp"]).toEqual([
      { HostIp: "127.0.0.1", HostPort: "18080" },
    ])
    expect(options.HostConfig.PortBindings["52000/udp"]).toEqual([
      { HostIp: "127.0.0.1", HostPort: "52000" },
    ])
  })

  it("rejects plain HTTP for non-local Docker hosts", () => {
    expect(() =>
      dockerConnection({ ANTIDETECT_DOCKER_HOST: "docker.example.com" })
    ).toThrow("requires https")
    expect(() =>
      dockerConnection({
        ANTIDETECT_DOCKER_HOST: "http://docker.example.com:2375",
      })
    ).toThrow("requires https")
    expect(
      dockerConnection({ ANTIDETECT_DOCKER_HOST: "127.0.0.1" })
    ).toMatchObject({
      type: "http",
      protocol: "http:",
      hostname: "127.0.0.1",
    })
    expect(
      dockerConnection({ ANTIDETECT_DOCKER_HOST: "https://docker.example.com:2376" })
    ).toMatchObject({
      type: "http",
      protocol: "https:",
      hostname: "docker.example.com",
      port: 2376,
    })
  })

  it("sanitizes Docker request failures before returning them", async () => {
    const userId = await seedUser("docker-error@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const docker = fakeDocker()
    vi.mocked(docker.createVolume).mockRejectedValue(
      new DockerRequestError(
        "POST",
        "/containers/create?name=antidetect-session-secret",
        404,
        "No such image: private-image:latest"
      )
    )

    try {
      await startSession(userId, profile.id, {
        db: testDb(),
        docker,
        config: testConfig(),
        waitForReady: async () => undefined,
      })
      throw new Error("Expected startSession to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toBe("Browser session start failed. Check Docker host logs.")
      expect(message).not.toContain("private-image")
      expect(message).not.toContain("antidetect-session-secret")
    }
  })

  it("sanitizes Docker connection failures before returning them", async () => {
    const userId = await seedUser("docker-connect@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const docker = fakeDocker()
    vi.mocked(docker.createVolume).mockRejectedValue(
      new DockerConnectionError(
        "POST",
        "/volumes/create",
        "connect ENOENT /var/run/docker.sock"
      )
    )

    await expect(
      startSession(userId, profile.id, {
        db: testDb(),
        docker,
        config: testConfig(),
        waitForReady: async () => undefined,
      })
    ).rejects.toThrow("Browser session start failed. Check Docker host logs.")
  })

  it("stops only sessions owned by the caller", async () => {
    const owner = await seedUser("owner@test.dev")
    const other = await seedUser("other@test.dev")
    const profile = await createUserProfile(
      owner,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const docker = fakeDocker()
    const session = await startSession(owner, profile.id, {
      db: testDb(),
      docker,
      config: testConfig(),
      waitForReady: async () => undefined,
    })

    await expect(
      stopSession(other, session.id, {
        db: testDb(),
        docker,
        config: testConfig(),
      })
    ).rejects.toThrow("Session not found")

    const stopped = await stopSession(owner, session.id, {
      db: testDb(),
      docker,
      config: testConfig(),
    })

    expect(stopped.status).toBe("stopped")
    expect(docker.stopContainer).toHaveBeenCalledWith("container-1")
    expect(docker.removeContainer).toHaveBeenCalledWith("container-1")

    const [row] = await database
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.id, session.id))
    expect(row.endedAt).toBeInstanceOf(Date)

    const [updatedProfile] = await listUserProfiles(owner, testDb())
    expect(updatedProfile.status).toBe("stopped")
  })
})
