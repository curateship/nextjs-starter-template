import { createHash } from "node:crypto"

import { createServerFn } from "@tanstack/react-start"
import { getCookie, getRequestIP } from "@tanstack/react-start/server"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import {
  aiVideoLoginRateLimits,
  aiVideoSessions,
  aiVideoUsers,
} from "@/server/schema"
import {
  clearSessionCookie,
  createSessionExpiresAt,
  createSessionToken,
  findCurrentUser,
  hashSessionToken,
  now,
  setSessionCookie,
  uuid,
  verifyPassword,
  SESSION_COOKIE_NAME,
} from "@/server/security"
import { requireAppOrigin } from "@/server/origin"

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
}

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
})

const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_SECONDS = 15 * 60
const TRUST_PROXY_HEADERS = process.env.AI_VIDEO_TRUST_PROXY_HEADERS === "1"

export function getAuthErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Authentication request failed."
}

const loadCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await findCurrentUser()
    return user ? serializeUser(user) : null
  }
)

const loginFn = createServerFn({ method: "POST" })
  .inputValidator(loginSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()

    const email = data.email.trim().toLowerCase()
    const rateLimitKey = getLoginRateLimitKey(email)
    await enforceLoginRateLimit(rateLimitKey)

    const [user] = await db
      .select()
      .from(aiVideoUsers)
      .where(sql`lower(${aiVideoUsers.email}) = ${email}`)
      .limit(1)

    if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
      await recordFailedLogin(rateLimitKey)
      throw new Error("Invalid email or password.")
    }

    await clearFailedLogins(rateLimitKey)
    const token = createSessionToken()
    await db.insert(aiVideoSessions).values({
      id: uuid(),
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt: now(),
    })

    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
    await getOrCreateCurrentWorkspace(user.id)

    setSessionCookie(token)
    return serializeUser(user)
  })

const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  requireAppOrigin()

  const token = getCookie(SESSION_COOKIE_NAME)
  if (token) {
    await db
      .delete(aiVideoSessions)
      .where(eq(aiVideoSessions.tokenHash, hashSessionToken(token)))
  }

  clearSessionCookie()
})

export function loadCurrentUser() {
  return loadCurrentUserFn()
}

export function login(email: string, password: string) {
  return loginFn({ data: { email, password } })
}

export function logout() {
  return logoutFn()
}

function serializeUser(user: {
  id: string
  email: string
  name: string
  role: string
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  }
}

function getLoginRateLimitKey(email: string) {
  const ip = getRequestIP({ xForwardedFor: TRUST_PROXY_HEADERS }) || "unknown"
  return createHash("sha256").update(`${ip}:${email}`, "utf8").digest("hex")
}

async function enforceLoginRateLimit(key: string) {
  if ((await recentFailedLogins(key)).length >= LOGIN_MAX_ATTEMPTS) {
    throw new Error("Too many login attempts")
  }
}

async function recordFailedLogin(key: string) {
  const failures = [...(await recentFailedLogins(key)), Date.now() / 1000]
  const updatedAt = now()
  await db
    .insert(aiVideoLoginRateLimits)
    .values({ key, failures, updatedAt })
    .onConflictDoUpdate({
      target: aiVideoLoginRateLimits.key,
      set: { failures, updatedAt },
    })
}

async function clearFailedLogins(key: string) {
  await db
    .delete(aiVideoLoginRateLimits)
    .where(eq(aiVideoLoginRateLimits.key, key))
}

async function recentFailedLogins(key: string) {
  const cutoff = Date.now() / 1000 - LOGIN_WINDOW_SECONDS
  const [row] = await db
    .select({ failures: aiVideoLoginRateLimits.failures })
    .from(aiVideoLoginRateLimits)
    .where(eq(aiVideoLoginRateLimits.key, key))
    .limit(1)
  return parseLoginFailures(row?.failures).filter((time) => time > cutoff)
}

function parseLoginFailures(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(
    (time): time is number => typeof time === "number" && Number.isFinite(time)
  )
}
