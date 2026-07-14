import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type Db } from "@/server/db"
import { createUserProfile } from "@/server/profiles"
import {
  detectCrashedSessions,
  reapIdleSessionsWithAlerts,
} from "@/server/scheduler"
import {
  browserSessions,
  notifications,
  profiles,
  users,
  type BrowserSession,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

const MIGRATIONS = [
  "0000_baseline.sql",
  "0004_profiles_proxies.sql",
  "0005_proxy_protocol.sql",
  "0006_profile_organization.sql",
  "0007_profile_status_unique.sql",
  "0008_browser_sessions.sql",
  "0011_operational_alerts.sql",
]

beforeEach(async () => {
  client = new PGlite()
  for (const file of MIGRATIONS) {
    const sql = await readFile(
      new URL(`../../drizzle/${file}`, import.meta.url),
      "utf8"
    )
    await client.exec(sql)
  }
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

async function seedRunningSession(
  userId: string,
  profileId: string,
  lastActiveAt: Date
) {
  const id = uuid()
  const createdAt = now()
  await database.insert(browserSessions).values({
    id,
    userId,
    profileId,
    nodeId: "local",
    containerId: null,
    containerName: `antidetect-${id}`,
    volumeName: `vol-${id}`,
    streamUrl: "http://127.0.0.1:18080",
    streamPort: 18080,
    webrtcStartPort: 52000,
    webrtcEndPort: 52020,
    status: "running",
    startedAt: createdAt,
    endedAt: null,
    lastActiveAt,
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

async function newProfile(userId: string) {
  const profile = await createUserProfile(
    userId,
    { name: "P", engine: "camoufox", os: "windows" },
    testDb()
  )
  return profile.id
}

describe("scheduler crash detection", () => {
  it("flips a dead running session to error and alerts once", async () => {
    const userId = await seedUser("crash@test.dev")
    const profileId = await newProfile(userId)
    const sessionId = await seedRunningSession(userId, profileId, now())

    const deadProbe = async () => false
    const first = await detectCrashedSessions(deadProbe, testDb())
    expect(first.crashed).toBe(1)

    const [session] = await database
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.id, sessionId))
    expect(session.status).toBe("error")
    expect(session.endedAt).not.toBeNull()

    const [profile] = await database
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
    expect(profile.status).toBe("error")

    const alerts = await database.select().from(notifications)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      type: "session_crashed",
      severity: "critical",
      entityId: profileId,
      recipientUserId: userId,
    })

    // A second sweep must not re-alert (session is no longer "running").
    const second = await detectCrashedSessions(deadProbe, testDb())
    expect(second.crashed).toBe(0)
    expect(await database.select().from(notifications)).toHaveLength(1)
  })

  it("leaves a live session untouched", async () => {
    const userId = await seedUser("alive@test.dev")
    const profileId = await newProfile(userId)
    const sessionId = await seedRunningSession(userId, profileId, now())

    const result = await detectCrashedSessions(
      async (s: BrowserSession) => s.id === sessionId,
      testDb()
    )
    expect(result.crashed).toBe(0)
    const [session] = await database
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.id, sessionId))
    expect(session.status).toBe("running")
    expect(await database.select().from(notifications)).toHaveLength(0)
  })
})

describe("scheduler idle reaping", () => {
  it("stops idle sessions and emits an info alert", async () => {
    const userId = await seedUser("reap@test.dev")
    const profileId = await newProfile(userId)
    const staleAt = new Date(now().getTime() - 60 * 60 * 1000)
    const sessionId = await seedRunningSession(userId, profileId, staleAt)

    // containerId is null, so stopSession performs no Docker calls.
    const result = await reapIdleSessionsWithAlerts(30 * 60 * 1000, testDb())
    expect(result.stopped).toBe(1)

    const [session] = await database
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.id, sessionId))
    expect(session.status).toBe("stopped")

    const alerts = await database.select().from(notifications)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      type: "session_reaped",
      severity: "info",
      entityId: profileId,
    })
  })

  it("leaves a recently active session running", async () => {
    const userId = await seedUser("fresh@test.dev")
    const profileId = await newProfile(userId)
    await seedRunningSession(userId, profileId, now())

    const result = await reapIdleSessionsWithAlerts(30 * 60 * 1000, testDb())
    expect(result.stopped).toBe(0)
    expect(await database.select().from(notifications)).toHaveLength(0)
  })
})
