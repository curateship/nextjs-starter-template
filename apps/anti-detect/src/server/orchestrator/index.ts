import { request as httpRequest, type RequestOptions } from "node:http"
import { request as httpsRequest } from "node:https"

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import { decryptSecret } from "@/server/encryption"
import { createAlert } from "@/server/notifications"
import {
  browserSessions,
  capacityConfig,
  nodes,
  notifications,
  profiles,
  proxies,
  users,
  type BrowserSession,
  type Profile,
  type Proxy,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

export type BrowserSessionStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error"

export type BrowserSessionItem = {
  id: string
  profileId: string
  status: BrowserSessionStatus
  streamUrl: string
  streamUsername: string
  streamPassword: string
  startedAt: string
  endedAt: string | null
  lastActiveAt: string
}

export type OrchestratorConfig = {
  nodeId: string
  image: string
  streamHost: string
  streamBindHost: string
  streamPortStart: number
  webrtcPortStart: number
  webrtcPortsPerSession: number
  maxSessions: number
  nekoUserPassword: string
  nekoAdminPassword: string
  startUrl: string
  readyTimeoutMs: number
}

export type BrowserContainerSpec = {
  image: string
  name: string
  labels: Record<string, string>
  env: string[]
  volumeName: string
  bindHost: string
  streamPort: number
  webrtcStartPort: number
  webrtcEndPort: number
}

export type BrowserDockerClient = {
  createVolume(name: string, labels: Record<string, string>): Promise<void>
  createContainer(spec: BrowserContainerSpec): Promise<{ id: string }>
  startContainer(containerId: string): Promise<void>
  stopContainer(containerId: string): Promise<void>
  removeContainer(containerId: string): Promise<void>
  getContainerStats(containerId: string): Promise<DockerContainerStats>
}

export type DockerContainerStats = {
  memoryUsageBytes: number
  usedVcpu: number
}

type OrchestratorOptions = {
  db?: Db
  docker?: BrowserDockerClient
  config?: OrchestratorConfig
  waitForReady?: (streamUrl: string, timeoutMs: number) => Promise<void>
}

type SessionPorts = {
  streamPort: number
  webrtcStartPort: number
  webrtcEndPort: number
}

const ACTIVE_SESSION_STATUSES: BrowserSessionStatus[] = [
  "starting",
  "running",
  "stopping",
]
const MAX_DOCKER_RESPONSE_BYTES = 1024 * 1024
const NEKO_STREAM_USERNAME = "user"

export async function getActiveSession(
  userId: string,
  profileId: string,
  database: Db = db
) {
  const [session] = await database
    .select()
    .from(browserSessions)
    .where(
      and(
        eq(browserSessions.userId, userId),
        eq(browserSessions.profileId, profileId),
        isNull(browserSessions.endedAt),
        inArray(browserSessions.status, ACTIVE_SESSION_STATUSES)
      )
    )
    .orderBy(desc(browserSessions.startedAt))
    .limit(1)
  return session ?? null
}

export async function listActiveUserSessions(userId: string, database: Db = db) {
  return database
    .select()
    .from(browserSessions)
    .where(
      and(
        eq(browserSessions.userId, userId),
        isNull(browserSessions.endedAt),
        inArray(browserSessions.status, ACTIVE_SESSION_STATUSES)
      )
    )
}

export type CapacitySummary = {
  budget: { ramMbPerProfile: number; vcpuPerProfile: number }
  nodes: CapacityNode[]
  users: Array<{
    userId: string
    name: string
    email: string
    activeSessions: number
    concurrencyCap: number
  }>
  reapEvents: Array<{
    id: string
    userName: string
    profileId: string | null
    createdAt: string
  }>
}

export type CapacityNode = {
  id: string
  label: string
  status: string
  totalRamMb: number
  totalVcpu: number
  activeSessions: number
  ramUsedMb: number
  ramHeadroomMb: number
  liveRamUsedMb: number
  reservedRamMb: number
  vcpuUsed: number
  vcpuHeadroom: number
  liveVcpuUsed: number
  reservedVcpu: number
  estimatedRemainingProfiles: number
  statsStatus: "live" | "partial" | "unavailable"
}

type CapacityCalculationInput = {
  totalRamMb: number
  totalVcpu: number
  activeSessions: number
  liveRamUsedMb: number
  liveVcpuUsed: number
  profileRamMb: number
  profileVcpu: number
}

export function calculateNodeCapacity(input: CapacityCalculationInput) {
  const reservedRamMb = input.activeSessions * input.profileRamMb
  const reservedVcpu = input.activeSessions * input.profileVcpu
  const ramUsedMb = Math.max(input.liveRamUsedMb, reservedRamMb)
  const vcpuUsed = Math.max(input.liveVcpuUsed, reservedVcpu)
  const ramHeadroomMb = Math.max(0, input.totalRamMb - ramUsedMb)
  const vcpuHeadroom = Math.max(0, input.totalVcpu - vcpuUsed)

  return {
    ramUsedMb: round(ramUsedMb),
    ramHeadroomMb: round(ramHeadroomMb),
    liveRamUsedMb: round(input.liveRamUsedMb),
    reservedRamMb: round(reservedRamMb),
    vcpuUsed: round(vcpuUsed),
    vcpuHeadroom: round(vcpuHeadroom),
    liveVcpuUsed: round(input.liveVcpuUsed),
    reservedVcpu: round(reservedVcpu),
    estimatedRemainingProfiles: Math.max(
      0,
      Math.floor(
        Math.min(
          ramHeadroomMb / input.profileRamMb,
          vcpuHeadroom / input.profileVcpu
        )
      )
    ),
  }
}

export async function getCapacitySummary(
  options: OrchestratorOptions = {}
): Promise<CapacitySummary> {
  const database = options.db ?? db
  const nodeId =
    options.config?.nodeId ?? envString("ANTIDETECT_BROWSER_NODE_ID", "local")
  const [capacity] = await database
    .select()
    .from(capacityConfig)
    .where(eq(capacityConfig.key, "default"))
    .limit(1)
  if (!capacity) throw new Error("Capacity configuration is missing")

  const nodeRows = await database.select().from(nodes).orderBy(asc(nodes.label))
  const sessionRows = await database
    .select({
      userId: browserSessions.userId,
      nodeId: browserSessions.nodeId,
      containerId: browserSessions.containerId,
    })
    .from(browserSessions)
    .where(
      and(
        isNull(browserSessions.endedAt),
        inArray(browserSessions.status, ACTIVE_SESSION_STATUSES)
      )
    )
  const reapRows = await database
    .select({
      id: notifications.id,
      userId: notifications.recipientUserId,
      profileId: notifications.entityId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.type, "session_reaped"))
    .orderBy(desc(notifications.createdAt))
    .limit(10)
  const userIds = Array.from(
    new Set([
      ...sessionRows.map((session) => session.userId),
      ...reapRows.map((event) => event.userId),
    ])
  )
  const userRows = userIds.length
    ? await database
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))
    : []
  const userById = new Map(userRows.map((user) => [user.id, user]))
  const profileVcpu = capacity.profileVcpuMillicores / 1000
  let docker: BrowserDockerClient | undefined = options.docker

  const nodeSummaries = await Promise.all(
    nodeRows.map(async (node): Promise<CapacityNode> => {
      const nodeSessions = sessionRows.filter((session) => session.nodeId === node.id)
      const liveStats: DockerContainerStats[] = []
      if (node.id === nodeId) {
        docker ??= createDockerClient()
        const results = await Promise.all(
          nodeSessions.map((session) =>
            session.containerId
              ? docker!.getContainerStats(session.containerId).catch(() => null)
              : Promise.resolve(null)
          )
        )
        liveStats.push(
          ...results.filter((result): result is DockerContainerStats => Boolean(result))
        )
      }
      const calculated = calculateNodeCapacity({
        totalRamMb: node.totalRamMb,
        totalVcpu: node.totalVcpu,
        activeSessions: nodeSessions.length,
        liveRamUsedMb: liveStats.reduce(
          (total, stats) => total + stats.memoryUsageBytes / 1024 / 1024,
          0
        ),
        liveVcpuUsed: liveStats.reduce(
          (total, stats) => total + stats.usedVcpu,
          0
        ),
        profileRamMb: capacity.profileRamMb,
        profileVcpu,
      })
      const statsStatus =
        nodeSessions.length === 0 || liveStats.length === nodeSessions.length
          ? "live"
          : liveStats.length
            ? "partial"
            : "unavailable"

      return {
        id: node.id,
        label: node.label,
        status: node.status,
        totalRamMb: node.totalRamMb,
        totalVcpu: node.totalVcpu,
        activeSessions: nodeSessions.length,
        ...calculated,
        statsStatus,
      }
    })
  )

  const activeByUser = new Map<string, number>()
  for (const session of sessionRows) {
    activeByUser.set(session.userId, (activeByUser.get(session.userId) ?? 0) + 1)
  }

  return {
    budget: {
      ramMbPerProfile: capacity.profileRamMb,
      vcpuPerProfile: profileVcpu,
    },
    nodes: nodeSummaries,
    users: userRows
      .filter((user) => activeByUser.has(user.id))
      .map((user) => ({
        userId: user.id,
        name: user.name,
        email: user.email,
        activeSessions: activeByUser.get(user.id) ?? 0,
        concurrencyCap: capacity.perUserConcurrencyCap,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    reapEvents: reapRows.map((event) => ({
      id: event.id,
      userName: userById.get(event.userId)?.name ?? "Unknown user",
      profileId: event.profileId,
      createdAt: event.createdAt.toISOString(),
    })),
  }
}

export async function startSession(
  userId: string,
  profileId: string,
  options: OrchestratorOptions = {}
) {
  const database = options.db ?? db
  const config = options.config ?? loadOrchestratorConfig()
  const existing = await getActiveSession(userId, profileId, database)
  if (existing) {
    return serializeBrowserSession(existing, streamLogin(config))
  }

  const [profile] = await database
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1)
  if (!profile) throw new Error("Profile not found")
  if (profile.engine !== "camoufox") {
    throw new Error("Camoufox is the only supported launch engine in Phase 2")
  }

  const proxy = profile.proxyId
    ? await getOwnedProxy(userId, profile.proxyId, database)
    : null
  const docker = options.docker ?? createDockerClient()
  const sessionId = uuid()
  const labels = sessionLabels(profile.id, sessionId)
  const containerName = `antidetect-session-${sessionId}`
  const volumeName = `antidetect-profile-${profile.id}`
  const createdAt = now()
  let containerId: string | null = null
  let ports: SessionPorts | null = null
  let session: BrowserSession | null = null

  for (let attempt = 0; attempt < config.maxSessions; attempt += 1) {
    try {
      const reservation = await reserveStartingSession(
        {
          sessionId,
          userId,
          profileId: profile.id,
          createdAt,
          containerName,
          volumeName,
          config,
        },
        database
      )
      if (reservation.existing) {
        return serializeBrowserSession(reservation.existing, streamLogin(config))
      }
      session = reservation.session
      ports = reservation.ports
      break
    } catch (error) {
      if (isActiveSessionConflict(error)) {
        const active = await getActiveSession(userId, profile.id, database)
        if (!active) throw error
        return serializeBrowserSession(active, streamLogin(config))
      }
      if (isActiveSessionPortConflict(error)) {
        continue
      }
      throw error
    }
  }

  if (!session || !ports) {
    throw new Error("No browser session capacity is available")
  }

  await database
    .update(profiles)
    .set({ status: "starting", updatedAt: createdAt })
    .where(and(eq(profiles.id, profile.id), eq(profiles.userId, userId)))

  try {
    await docker.createVolume(volumeName, labels)
    const container = await docker.createContainer({
      image: config.image,
      name: containerName,
      labels,
      env: containerEnv(
        profile,
        proxy,
        config,
        ports,
        streamLogin(config)
      ),
      volumeName,
      bindHost: config.streamBindHost,
      streamPort: ports.streamPort,
      webrtcStartPort: ports.webrtcStartPort,
      webrtcEndPort: ports.webrtcEndPort,
    })
    containerId = container.id
    await database
      .update(browserSessions)
      .set({ containerId, updatedAt: now() })
      .where(eq(browserSessions.id, session.id))
    await docker.startContainer(containerId)
    await (options.waitForReady ?? waitForStreamReady)(
      session.streamUrl,
      config.readyTimeoutMs
    )

    const readyAt = now()
    const [running] = await database
      .update(browserSessions)
      .set({
        status: "running",
        lastActiveAt: readyAt,
        updatedAt: readyAt,
      })
      .where(
        and(eq(browserSessions.id, session.id), eq(browserSessions.userId, userId))
      )
      .returning()
    await database
      .update(profiles)
      .set({ status: "running", updatedAt: readyAt })
      .where(and(eq(profiles.id, profile.id), eq(profiles.userId, userId)))

    if (!running) throw new Error("Session not found")
    return serializeBrowserSession(running, streamLogin(config))
  } catch (error) {
    if (containerId) {
      await docker.removeContainer(containerId).catch(() => undefined)
    }
    const failedAt = now()
    await database
      .update(browserSessions)
      .set({
        status: "error",
        endedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(eq(browserSessions.id, session.id))
    await database
      .update(profiles)
      .set({ status: "error", updatedAt: failedAt })
      .where(and(eq(profiles.id, profile.id), eq(profiles.userId, userId)))
    const publicError = publicDockerError(error, "start")
    await createAlert({
      recipientUserId: userId,
      type: "session_launch_failed",
      severity: "critical",
      title: `Failed to launch “${profile.name}”`,
      body:
        publicError instanceof Error ? publicError.message : String(publicError),
      entityType: "profile",
      entityId: profile.id,
      metadata: { sessionId: session.id },
      database,
    })
    throw publicError
  }
}

export async function stopSession(
  userId: string,
  sessionId: string,
  options: OrchestratorOptions = {}
) {
  const database = options.db ?? db
  const [session] = await database
    .select()
    .from(browserSessions)
    .where(and(eq(browserSessions.id, sessionId), eq(browserSessions.userId, userId)))
    .limit(1)
  if (!session) throw new Error("Session not found")
  if (session.endedAt || session.status === "stopped") {
    return serializeBrowserSessionSummary(session)
  }

  const docker = options.docker ?? createDockerClient()
  const stoppingAt = now()
  await database
    .update(browserSessions)
    .set({ status: "stopping", updatedAt: stoppingAt })
    .where(and(eq(browserSessions.id, session.id), eq(browserSessions.userId, userId)))

  try {
    if (session.containerId) {
      await docker.stopContainer(session.containerId)
      await docker.removeContainer(session.containerId)
    }
    const stoppedAt = now()
    const [stopped] = await database
      .update(browserSessions)
      .set({
        status: "stopped",
        endedAt: stoppedAt,
        lastActiveAt: stoppedAt,
        updatedAt: stoppedAt,
      })
      .where(and(eq(browserSessions.id, session.id), eq(browserSessions.userId, userId)))
      .returning()
    await database
      .update(profiles)
      .set({ status: "stopped", updatedAt: stoppedAt })
      .where(and(eq(profiles.id, session.profileId), eq(profiles.userId, userId)))

    if (!stopped) throw new Error("Session not found")
    return serializeBrowserSessionSummary(stopped)
  } catch (error) {
    const failedAt = now()
    await database
      .update(browserSessions)
      .set({ status: "error", updatedAt: failedAt })
      .where(and(eq(browserSessions.id, session.id), eq(browserSessions.userId, userId)))
    await database
      .update(profiles)
      .set({ status: "error", updatedAt: failedAt })
      .where(and(eq(profiles.id, session.profileId), eq(profiles.userId, userId)))
    const publicError = publicDockerError(error, "stop")
    await createAlert({
      recipientUserId: userId,
      type: "session_stop_failed",
      severity: "warning",
      title: "Failed to stop a browser session",
      body:
        publicError instanceof Error ? publicError.message : String(publicError),
      entityType: "profile",
      entityId: session.profileId,
      metadata: { sessionId: session.id },
      database,
    })
    throw publicError
  }
}

export function serializeBrowserSession(
  row: BrowserSession,
  login: StreamLogin
): BrowserSessionItem {
  return {
    ...serializeBrowserSessionSummary(row),
    streamUsername: login.username,
    streamPassword: login.password,
  }
}

export type BrowserSessionSummary = Omit<
  BrowserSessionItem,
  "streamUsername" | "streamPassword"
>

export function serializeBrowserSessionSummary(
  row: BrowserSession
): BrowserSessionSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    status: row.status as BrowserSessionStatus,
    streamUrl: row.streamUrl,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    lastActiveAt: row.lastActiveAt.toISOString(),
  }
}

type StreamLogin = {
  username: string
  password: string
  adminPassword: string
}

function streamLogin(
  config: Pick<OrchestratorConfig, "nekoUserPassword" | "nekoAdminPassword">
): StreamLogin {
  return {
    username: NEKO_STREAM_USERNAME,
    password: config.nekoUserPassword,
    adminPassword: config.nekoAdminPassword,
  }
}

export function loadOrchestratorConfig(): OrchestratorConfig {
  return {
    nodeId: envString("ANTIDETECT_BROWSER_NODE_ID", "local"),
    image: envString("ANTIDETECT_BROWSER_IMAGE", "anti-detect-camoufox:latest"),
    streamHost: envString("ANTIDETECT_STREAM_HOST", "127.0.0.1"),
    streamBindHost: envString("ANTIDETECT_STREAM_BIND_HOST", "127.0.0.1"),
    streamPortStart: envInt("ANTIDETECT_STREAM_PORT_START", 18080),
    webrtcPortStart: envInt("ANTIDETECT_WEBRTC_PORT_START", 52000),
    webrtcPortsPerSession: envInt("ANTIDETECT_WEBRTC_PORTS_PER_SESSION", 20),
    maxSessions: envInt("ANTIDETECT_MAX_BROWSER_SESSIONS", 20),
    nekoUserPassword: requiredEnvString("ANTIDETECT_NEKO_USER_PASSWORD"),
    nekoAdminPassword: requiredEnvString("ANTIDETECT_NEKO_ADMIN_PASSWORD"),
    startUrl: envString(
      "ANTIDETECT_BROWSER_START_URL",
      "https://abrahamjuliot.github.io/creepjs/"
    ),
    readyTimeoutMs: envInt("ANTIDETECT_BROWSER_READY_TIMEOUT_MS", 15_000),
  }
}

async function getOwnedProxy(userId: string, proxyId: string, database: Db) {
  const [proxy] = await database
    .select()
    .from(proxies)
    .where(and(eq(proxies.id, proxyId), eq(proxies.userId, userId)))
    .limit(1)
  if (!proxy) throw new Error("Proxy not found")
  return proxy
}

async function allocatePorts(
  profileId: string,
  config: OrchestratorConfig,
  database: Db
): Promise<SessionPorts> {
  const active = await database
    .select({
      streamPort: browserSessions.streamPort,
      webrtcStartPort: browserSessions.webrtcStartPort,
    })
    .from(browserSessions)
    .where(
      and(
        eq(browserSessions.nodeId, config.nodeId),
        isNull(browserSessions.endedAt),
        inArray(browserSessions.status, ACTIVE_SESSION_STATUSES)
      )
    )
  const usedStreamPorts = new Set(active.map((session) => session.streamPort))
  const usedWebrtcStarts = new Set(
    active.map((session) => session.webrtcStartPort)
  )
  const preferredSlot = hashToSlot(profileId, config.maxSessions)
  for (let offset = 0; offset < config.maxSessions; offset += 1) {
    const slot = (preferredSlot + offset) % config.maxSessions
    const streamPort = config.streamPortStart + slot
    const webrtcStartPort =
      config.webrtcPortStart + slot * config.webrtcPortsPerSession
    if (
      usedStreamPorts.has(streamPort) ||
      usedWebrtcStarts.has(webrtcStartPort)
    ) {
      continue
    }
    return {
      streamPort,
      webrtcStartPort,
      webrtcEndPort: webrtcStartPort + config.webrtcPortsPerSession - 1,
    }
  }
  throw new Error("No browser session capacity is available")
}

async function reserveStartingSession(
  input: {
    sessionId: string
    userId: string
    profileId: string
    createdAt: Date
    containerName: string
    volumeName: string
    config: OrchestratorConfig
  },
  database: Db
) {
  return database.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update")
      .limit(1)
    if (!user) throw new Error("User not found")

    const [node] = await tx
      .select()
      .from(nodes)
      .where(eq(nodes.id, input.config.nodeId))
      .for("update")
      .limit(1)
    if (!node) {
      throw new Error(`Browser node "${input.config.nodeId}" is not configured`)
    }
    if (node.status !== "active") {
      throw new Error(`Node "${node.label}" is not accepting new sessions`)
    }

    const existing = await getActiveSession(input.userId, input.profileId, tx)
    if (existing) return { existing, session: null, ports: null }

    const [capacity] = await tx
      .select()
      .from(capacityConfig)
      .where(eq(capacityConfig.key, "default"))
      .limit(1)
    if (!capacity) throw new Error("Capacity configuration is missing")

    const active = await tx
      .select({
        userId: browserSessions.userId,
        nodeId: browserSessions.nodeId,
      })
      .from(browserSessions)
      .where(
        and(
          isNull(browserSessions.endedAt),
          inArray(browserSessions.status, ACTIVE_SESSION_STATUSES)
        )
      )
    const activeForUser = active.filter(
      (session) => session.userId === input.userId
    ).length
    if (activeForUser >= capacity.perUserConcurrencyCap) {
      throw new Error(
        `User concurrency limit of ${capacity.perUserConcurrencyCap} reached`
      )
    }

    const activeForNode = active.filter(
      (session) => session.nodeId === node.id
    ).length
    const nodeCapacity = calculateNodeCapacity({
      totalRamMb: node.totalRamMb,
      totalVcpu: node.totalVcpu,
      activeSessions: activeForNode,
      liveRamUsedMb: 0,
      liveVcpuUsed: 0,
      profileRamMb: capacity.profileRamMb,
      profileVcpu: capacity.profileVcpuMillicores / 1000,
    })
    if (
      activeForNode >= input.config.maxSessions ||
      nodeCapacity.estimatedRemainingProfiles < 1
    ) {
      throw new Error(`Node "${node.label}" is at capacity`)
    }

    const ports = await allocatePorts(input.profileId, input.config, tx)
    const session = await insertStartingSession({ ...input, ports }, tx)
    return { existing: null, session, ports }
  })
}

async function insertStartingSession(
  input: {
    sessionId: string
    userId: string
    profileId: string
    createdAt: Date
    containerName: string
    volumeName: string
    config: OrchestratorConfig
    ports: SessionPorts
  },
  database: Db
) {
  const [session] = await database
    .insert(browserSessions)
    .values({
      id: input.sessionId,
      userId: input.userId,
      profileId: input.profileId,
      nodeId: input.config.nodeId,
      containerId: null,
      containerName: input.containerName,
      volumeName: input.volumeName,
      streamUrl: streamUrlFor(input.config, input.ports),
      streamPort: input.ports.streamPort,
      webrtcStartPort: input.ports.webrtcStartPort,
      webrtcEndPort: input.ports.webrtcEndPort,
      status: "starting",
      startedAt: input.createdAt,
      endedAt: null,
      lastActiveAt: input.createdAt,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .returning()

  if (!session) throw new Error("Session was not created")
  return session
}

function streamUrlFor(config: OrchestratorConfig, ports: SessionPorts) {
  return `http://${config.streamHost}:${ports.streamPort}`
}

function containerEnv(
  profile: Profile,
  proxy: Proxy | null,
  config: OrchestratorConfig,
  ports: {
    webrtcStartPort: number
    webrtcEndPort: number
  },
  login: StreamLogin
) {
  const env = [
    "NEKO_DESKTOP_SCREEN=1920x1080@30",
    "NEKO_MEMBER_PROVIDER=multiuser",
    `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${login.password}`,
    `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${login.adminPassword}`,
    `NEKO_WEBRTC_EPR=${ports.webrtcStartPort}-${ports.webrtcEndPort}`,
    `NEKO_WEBRTC_NAT1TO1=${config.streamHost}`,
    "NEKO_WEBRTC_ICELITE=true",
    `FP_OS=${readFingerprintOs(profile.fingerprint)}`,
    `START_URL=${config.startUrl}`,
  ]

  if (proxy) {
    env.push(`PROXY_SERVER=${proxy.protocol}://${proxy.host}:${proxy.port}`)
    if (proxy.username) env.push(`PROXY_USERNAME=${proxy.username}`)
    const password = decryptSecret(proxy.password)
    if (password) env.push(`PROXY_PASSWORD=${password}`)
  }
  return env
}

function sessionLabels(profileId: string, sessionId: string) {
  return {
    "com.systemeverything.app": "anti-detect",
    "com.systemeverything.profile-id": profileId,
    "com.systemeverything.session-id": sessionId,
  }
}

function readFingerprintOs(fingerprint: unknown) {
  if (fingerprint && typeof fingerprint === "object" && !Array.isArray(fingerprint)) {
    const os = (fingerprint as Record<string, unknown>).os
    if (os === "windows" || os === "macos" || os === "linux") return os
  }
  return "windows"
}

function hashToSlot(input: string, slots: number) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash % Math.max(1, slots)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function envString(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback
}

function requiredEnvString(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function envInt(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

async function waitForStreamReady(streamUrl: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const response = await fetch(streamUrl, { method: "GET" })
      if (response.status < 500) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(
    lastError instanceof Error
      ? `Browser stream did not become ready: ${lastError.message}`
      : "Browser stream did not become ready"
  )
}

function createDockerClient(): BrowserDockerClient {
  const connection = dockerConnection()
  return {
    async createVolume(name, labels) {
      await dockerRequest(connection, "POST", "/volumes/create", {
        Name: name,
        Labels: labels,
      })
    },
    async createContainer(spec) {
      const container = await dockerRequest<{ Id?: string; id?: string }>(
        connection,
        "POST",
        `/containers/create?name=${encodeURIComponent(spec.name)}`,
        dockerCreateOptions(spec)
      )
      const id = container.Id ?? container.id
      if (!id) throw new Error("Docker did not return a container id")
      return { id }
    },
    async startContainer(containerId) {
      await dockerRequest(
        connection,
        "POST",
        `/containers/${encodeURIComponent(containerId)}/start`
      )
    },
    async stopContainer(containerId) {
      await dockerRequest(
        connection,
        "POST",
        `/containers/${encodeURIComponent(containerId)}/stop?t=10`
      )
    },
    async removeContainer(containerId) {
      await dockerRequest(
        connection,
        "DELETE",
        `/containers/${encodeURIComponent(containerId)}?force=true`
      )
    },
    async getContainerStats(containerId) {
      const stats = await dockerRequest<unknown>(
        connection,
        "GET",
        `/containers/${encodeURIComponent(containerId)}/stats?stream=false&one-shot=true`
      )
      return parseDockerStats(stats)
    },
  }
}

function parseDockerStats(value: unknown): DockerContainerStats {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Docker returned invalid container stats")
  }
  const stats = value as Record<string, unknown>
  const memory = readRecord(stats.memory_stats)
  const currentCpu = readRecord(stats.cpu_stats)
  const previousCpu = readRecord(stats.precpu_stats)
  const currentUsage = readRecord(currentCpu.cpu_usage)
  const previousUsage = readRecord(previousCpu.cpu_usage)
  const memoryUsageBytes = readNonNegativeNumber(memory.usage)
  const currentTotalUsage = readNonNegativeNumber(currentUsage.total_usage)
  const previousTotalUsage = readNonNegativeNumber(previousUsage.total_usage)
  const currentSystemUsage = readNonNegativeNumber(currentCpu.system_cpu_usage)
  const previousSystemUsage = readNonNegativeNumber(previousCpu.system_cpu_usage)
  const onlineCpus = readNonNegativeNumber(currentCpu.online_cpus)
  if (
    memoryUsageBytes === null ||
    currentTotalUsage === null ||
    previousTotalUsage === null ||
    currentSystemUsage === null ||
    previousSystemUsage === null ||
    !onlineCpus
  ) {
    throw new Error("Docker returned invalid container stats")
  }
  const cpuDelta = currentTotalUsage - previousTotalUsage
  const systemDelta = currentSystemUsage - previousSystemUsage
  if (cpuDelta < 0 || systemDelta < 0) {
    throw new Error("Docker returned invalid container stats")
  }
  return {
    memoryUsageBytes,
    usedVcpu: systemDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus : 0,
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

type DockerConnection =
  | { type: "socket"; socketPath: string }
  | { type: "http"; protocol: "http:" | "https:"; hostname: string; port?: number }

type DockerEnv = Record<string, string | undefined>

export function dockerConnection(env: DockerEnv = process.env): DockerConnection {
  const socketPath = env.ANTIDETECT_DOCKER_SOCKET_PATH
  if (socketPath) return { type: "socket", socketPath }
  const host = env.ANTIDETECT_DOCKER_HOST
  if (host) {
    const url = host.includes("://") ? new URL(host) : null
    if (url) {
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("ANTIDETECT_DOCKER_HOST must use http or https")
      }
      const connection = {
        type: "http",
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number.parseInt(url.port, 10) : undefined,
      } satisfies DockerConnection
      assertSecureDockerConnection(connection)
      return connection
    }
    const connection = {
      type: "http",
      protocol: dockerProtocol(env.ANTIDETECT_DOCKER_PROTOCOL),
      hostname: host,
      port: env.ANTIDETECT_DOCKER_PORT
        ? Number.parseInt(env.ANTIDETECT_DOCKER_PORT, 10)
        : undefined,
    } satisfies DockerConnection
    assertSecureDockerConnection(connection)
    return connection
  }
  return { type: "socket", socketPath: "/var/run/docker.sock" }
}

function dockerProtocol(raw: string | undefined): "http:" | "https:" {
  if (!raw || raw === "http") return "http:"
  if (raw === "https") return "https:"
  throw new Error("ANTIDETECT_DOCKER_PROTOCOL must be http or https")
}

function assertSecureDockerConnection(connection: DockerConnection) {
  if (
    connection.type === "http" &&
    connection.protocol === "http:" &&
    !isLocalDockerHost(connection.hostname)
  ) {
    throw new Error(
      "ANTIDETECT_DOCKER_HOST requires https for non-local Docker hosts"
    )
  }
}

function isLocalDockerHost(hostname: string) {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "host.docker.internal" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  )
}

export class DockerRequestError extends Error {
  constructor(
    public readonly method: "DELETE" | "GET" | "POST",
    public readonly path: string,
    public readonly status: number,
    public readonly responseText: string
  ) {
    super(`Docker API request failed with status ${status}`)
    this.name = "DockerRequestError"
  }
}

export class DockerConnectionError extends Error {
  constructor(
    public readonly method: "DELETE" | "GET" | "POST",
    public readonly path: string,
    public readonly causeMessage: string
  ) {
    super("Docker API request could not connect")
    this.name = "DockerConnectionError"
  }
}

function publicDockerError(error: unknown, action: "start" | "stop") {
  if (
    error instanceof DockerRequestError ||
    error instanceof DockerConnectionError
  ) {
    console.error(`Browser session ${action} Docker request failed`, {
      method: error.method,
      path: error.path,
      detail:
        error instanceof DockerRequestError
          ? { status: error.status, responseText: error.responseText }
          : { causeMessage: error.causeMessage },
    })
    return new Error(`Browser session ${action} failed. Check Docker host logs.`)
  }
  return error
}

async function dockerRequest<T = unknown>(
  connection: DockerConnection,
  method: "DELETE" | "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const headers: Record<string, string> = {}
  if (payload) {
    headers["Content-Type"] = "application/json"
    headers["Content-Length"] = Buffer.byteLength(payload).toString()
  }

  const options: RequestOptions =
    connection.type === "socket"
      ? {
          socketPath: connection.socketPath,
          method,
          path: `/v1.43${path}`,
          headers,
        }
      : {
          protocol: connection.protocol,
          hostname: connection.hostname,
          port: connection.port,
          method,
          path: `/v1.43${path}`,
          headers,
        }
  const requestFn =
    connection.type === "http" && connection.protocol === "https:"
      ? httpsRequest
      : httpRequest

  return new Promise<T>((resolve, reject) => {
    const req = requestFn(options, (res) => {
      const chunks: Buffer[] = []
      let responseBytes = 0
      let responseTooLarge = false
      res.on("data", (chunk: Buffer) => {
        if (responseTooLarge) return
        responseBytes += chunk.length
        if (responseBytes > MAX_DOCKER_RESPONSE_BYTES) {
          responseTooLarge = true
          res.destroy()
          reject(
            new DockerConnectionError(
              method,
              path,
              "Docker response exceeded the 1 MB limit"
            )
          )
          return
        }
        chunks.push(chunk)
      })
      res.on("end", () => {
        if (responseTooLarge) return
        const text = Buffer.concat(chunks).toString("utf8")
        const status = res.statusCode ?? 500
        if (status >= 400) {
          reject(new DockerRequestError(method, path, status, text))
          return
        }
        if (!text) {
          resolve({} as T)
          return
        }
        try {
          resolve(JSON.parse(text) as T)
        } catch {
          resolve({} as T)
        }
      })
    })
    req.on("error", (error: Error) => {
      reject(new DockerConnectionError(method, path, error.message))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

export function dockerCreateOptions(spec: BrowserContainerSpec) {
  const exposedPorts: Record<string, Record<string, never>> = {
    "8080/tcp": {},
  }
  const portBindings: Record<
    string,
    Array<{ HostIp: string; HostPort: string }>
  > = {
    "8080/tcp": [portBinding(spec.bindHost, spec.streamPort)],
  }

  for (
    let port = spec.webrtcStartPort;
    port <= spec.webrtcEndPort;
    port += 1
  ) {
    const key = `${port}/udp`
    exposedPorts[key] = {}
    portBindings[key] = [portBinding(spec.bindHost, port)]
  }

  return {
    Image: spec.image,
    name: spec.name,
    Env: spec.env,
    Labels: spec.labels,
    ExposedPorts: exposedPorts,
    HostConfig: {
      Binds: [`${spec.volumeName}:/data/profile`],
      ShmSize: 2 * 1024 * 1024 * 1024,
      PortBindings: portBindings,
    },
  }
}

function portBinding(hostIp: string, hostPort: number) {
  return { HostIp: hostIp, HostPort: String(hostPort) }
}

function isActiveSessionConflict(error: unknown) {
  return hasUniqueConstraintName(error, ["ux_browser_sessions_active_profile"])
}

function isActiveSessionPortConflict(error: unknown) {
  return hasUniqueConstraintName(error, [
    "ux_browser_sessions_active_node_stream_port",
    "ux_browser_sessions_active_node_webrtc_start",
  ])
}

function hasUniqueConstraintName(error: unknown, names: string[]) {
  if (!error || typeof error !== "object") return false
  const record = error as {
    cause?: unknown
    code?: unknown
    constraint?: unknown
    message?: unknown
  }
  if (record.code === "23505") {
    const message = typeof record.message === "string" ? record.message : ""
    if (
      names.includes(String(record.constraint)) ||
      names.some((name) => message.includes(name))
    ) {
      return true
    }
  }
  return hasUniqueConstraintName(record.cause, names)
}
