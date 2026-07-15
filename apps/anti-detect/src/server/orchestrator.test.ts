import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type Db } from "@/server/db"
import {
  DockerConnectionError,
  DockerRequestError,
  calculateNodeCapacity,
  dockerConnection,
  dockerCreateOptions,
  getCapacitySummary,
  listActiveUserSessions,
  serializeBrowserSessionSummary,
  startSession,
  stopSession,
  type BrowserContainerSpec,
  type BrowserDockerClient,
  type OrchestratorConfig,
} from "@/server/orchestrator"
import { createAlert } from "@/server/notifications"
import { createUserProfile, listUserProfiles } from "@/server/profiles"
import {
  browserSessions,
  capacityConfig,
  nodes,
  notifications,
  users,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

const TEST_KEY = "b".repeat(64)

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
let queries: string[]

beforeEach(async () => {
  process.env.ANTIDETECT_ENCRYPTION_KEY = TEST_KEY
  queries = []
  client = new PGlite()
  const baseline = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const workspaces = await readFile(
    new URL("../../drizzle/0003_workspaces.sql", import.meta.url),
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
  const operationalAlerts = await readFile(
    new URL("../../drizzle/0011_operational_alerts.sql", import.meta.url),
    "utf8"
  )
  const capacity = await readFile(
    new URL("../../drizzle/0012_capacity.sql", import.meta.url),
    "utf8"
  )
  await client.exec(baseline)
  await client.exec(workspaces)
  await client.exec(profilesProxies)
  await client.exec(proxyProtocol)
  await client.exec(organization)
  await client.exec(statusUnique)
  await client.exec(browserSession)
  await client.exec(operationalAlerts)
  await client.exec(capacity)
  database = drizzle(client, {
    schema,
    logger: {
      logQuery(query) {
        queries.push(query)
      },
    },
  })
  setDbForTests(database as unknown as Db)
})

afterEach(async () => {
  vi.unstubAllEnvs()
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
    getContainerStats: vi.fn().mockResolvedValue({
      memoryUsageBytes: 768 * 1024 * 1024,
      usedVcpu: 0.25,
    }),
  }
}

describe("browser session orchestrator", () => {
  it("calculates headroom and remaining profiles from reserved budgets", () => {
    expect(
      calculateNodeCapacity({
        totalRamMb: 8192,
        totalVcpu: 4,
        activeSessions: 2,
        liveRamUsedMb: 2500,
        liveVcpuUsed: 0.7,
        profileRamMb: 1536,
        profileVcpu: 0.5,
      })
    ).toEqual({
      ramUsedMb: 3072,
      ramHeadroomMb: 5120,
      liveRamUsedMb: 2500,
      reservedRamMb: 3072,
      vcpuUsed: 1,
      vcpuHeadroom: 3,
      liveVcpuUsed: 0.7,
      reservedVcpu: 1,
      estimatedRemainingProfiles: 3,
    })
  })

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

  it("loads capacity without browser launch credentials", async () => {
    vi.stubEnv("ANTIDETECT_NEKO_USER_PASSWORD", "")
    vi.stubEnv("ANTIDETECT_NEKO_ADMIN_PASSWORD", "")

    await expect(getCapacitySummary({ db: testDb() })).resolves.toMatchObject({
      nodes: [expect.objectContaining({ id: "local", activeSessions: 0 })],
      users: [],
    })
  })

  it("returns live node capacity and active-user concurrency meters", async () => {
    const userId = await seedUser("capacity@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const docker = fakeDocker()
    await startSession(userId, profile.id, {
      db: testDb(),
      docker,
      config: testConfig(),
      waitForReady: async () => undefined,
    })
    await createAlert({
      recipientUserId: userId,
      type: "session_reaped",
      severity: "info",
      title: "Idle browser session stopped",
      entityType: "profile",
      entityId: profile.id,
      database: testDb(),
    })

    const summary = await getCapacitySummary({
      db: testDb(),
      docker,
      config: testConfig(),
    })

    expect(summary.budget).toEqual({ ramMbPerProfile: 1536, vcpuPerProfile: 0.5 })
    expect(summary.nodes[0]).toMatchObject({
      id: "local",
      activeSessions: 1,
      ramUsedMb: 1536,
      liveRamUsedMb: 768,
      vcpuUsed: 0.5,
      liveVcpuUsed: 0.25,
      estimatedRemainingProfiles: 4,
      statsStatus: "live",
    })
    expect(summary.users).toEqual([
      expect.objectContaining({
        userId,
        activeSessions: 1,
        concurrencyCap: 5,
      }),
    ])
    expect(summary.reapEvents).toEqual([
      expect.objectContaining({ userName: "Test", profileId: profile.id }),
    ])
    expect(docker.getContainerStats).toHaveBeenCalledWith("container-1")
  })

  it("rejects a launch when the user concurrency cap is reached", async () => {
    const userId = await seedUser("user-cap@test.dev")
    const firstProfile = await createUserProfile(
      userId,
      { name: "One", engine: "camoufox", os: "windows" },
      testDb()
    )
    const secondProfile = await createUserProfile(
      userId,
      { name: "Two", engine: "camoufox", os: "windows" },
      testDb()
    )
    await database
      .update(capacityConfig)
      .set({ perUserConcurrencyCap: 1 })
      .where(eq(capacityConfig.key, "default"))
    const docker = fakeDocker()
    const options = {
      db: testDb(),
      docker,
      config: testConfig(),
      waitForReady: async () => undefined,
    }

    await startSession(userId, firstProfile.id, options)
    await expect(
      startSession(userId, secondProfile.id, options)
    ).rejects.toThrow("User concurrency limit of 1 reached")
    expect(docker.createContainer).toHaveBeenCalledTimes(1)
  })

  it("locks the user before enforcing the global concurrency cap", async () => {
    const userId = await seedUser("locked-user@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "Locked", engine: "camoufox", os: "windows" },
      testDb()
    )
    queries = []

    await startSession(userId, profile.id, {
      db: testDb(),
      docker: fakeDocker(),
      config: testConfig(),
      waitForReady: async () => undefined,
    })

    const userLock = queries.findIndex(
      (query) => query.includes('from "users"') && query.includes("for update")
    )
    const nodeLock = queries.findIndex(
      (query) => query.includes('from "nodes"') && query.includes("for update")
    )
    expect(userLock).toBeGreaterThanOrEqual(0)
    expect(nodeLock).toBeGreaterThan(userLock)
  })

  it("rejects a launch when the node has no profile capacity", async () => {
    const userId = await seedUser("node-cap@test.dev")
    const firstProfile = await createUserProfile(
      userId,
      { name: "One", engine: "camoufox", os: "windows" },
      testDb()
    )
    const secondProfile = await createUserProfile(
      userId,
      { name: "Two", engine: "camoufox", os: "windows" },
      testDb()
    )
    await database
      .update(capacityConfig)
      .set({ perUserConcurrencyCap: 10 })
      .where(eq(capacityConfig.key, "default"))
    await database
      .update(nodes)
      .set({ totalRamMb: 1536, totalVcpu: 1 })
      .where(eq(nodes.id, "local"))
    const docker = fakeDocker()
    const options = {
      db: testDb(),
      docker,
      config: testConfig(),
      waitForReady: async () => undefined,
    }

    await startSession(userId, firstProfile.id, options)
    await expect(
      startSession(userId, secondProfile.id, options)
    ).rejects.toThrow('Node "Local" is at capacity')
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

  it("rejects oversized Docker stats responses", async () => {
    const userId = await seedUser("large-stats@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "Large stats", engine: "camoufox", os: "windows" },
      testDb()
    )
    await startSession(userId, profile.id, {
      db: testDb(),
      docker: fakeDocker(),
      config: testConfig(),
      waitForReady: async () => undefined,
    })
    const body = JSON.stringify({
      memory_stats: { usage: 1024 },
      cpu_stats: {
        cpu_usage: { total_usage: 200 },
        system_cpu_usage: 2000,
        online_cpus: 4,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 100 },
        system_cpu_usage: 1000,
      },
      padding: "x".repeat(1024 * 1024),
    })
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "application/json")
      response.end(body)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address() as AddressInfo
    vi.stubEnv("ANTIDETECT_DOCKER_HOST", `http://127.0.0.1:${address.port}`)

    try {
      const summary = await getCapacitySummary({
        db: testDb(),
        config: testConfig(),
      })
      expect(summary.nodes[0]?.statsStatus).toBe("unavailable")
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
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

  it("records a session_launch_failed alert when a launch fails", async () => {
    const userId = await seedUser("launch-alert@test.dev")
    const profile = await createUserProfile(
      userId,
      { name: "Launchy", engine: "camoufox", os: "windows" },
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
    ).rejects.toThrow()

    const alerts = await database
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, userId))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      type: "session_launch_failed",
      severity: "critical",
      entityType: "profile",
      entityId: profile.id,
      actorUserId: null,
      feedbackId: null,
    })
    expect(alerts[0]?.title).toContain("Launchy")
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
