import { createServerFn } from "@tanstack/react-start"
import { getCookie, getRequestIP } from "@tanstack/react-start/server"
import { and, eq, gt, lt, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import {
  aiVideoLoginAttempts,
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

export function getAuthErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication request failed."
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
    const rateLimitKeyHash = getLoginRateLimitKeyHash(email)
    await enforceLoginRateLimit(rateLimitKeyHash)

    const [user] = await db
      .select()
      .from(aiVideoUsers)
      .where(sql`lower(${aiVideoUsers.email}) = ${email}`)
      .limit(1)

    if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
      await recordFailedLogin(rateLimitKeyHash)
      throw new Error("Invalid email or password.")
    }

    await clearFailedLogins(rateLimitKeyHash)
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

function getLoginRateLimitKeyHash(email: string) {
  const trustProxy = process.env.AI_VIDEO_TRUST_PROXY === "true"
  const ip = getRequestIP({ xForwardedFor: trustProxy }) || "unknown"
  return hashSessionToken(`${ip}:${email}`)
}

async function enforceLoginRateLimit(keyHash: string) {
  await pruneOldFailedLogins()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiVideoLoginAttempts)
    .where(
      and(
        eq(aiVideoLoginAttempts.keyHash, keyHash),
        gt(aiVideoLoginAttempts.attemptedAt, loginWindowStart())
      )
    )

  if ((row?.count ?? 0) >= LOGIN_MAX_ATTEMPTS) {
    throw new Error("Too many login attempts")
  }
}

async function recordFailedLogin(keyHash: string) {
  const attemptedAt = now()
  await db.insert(aiVideoLoginAttempts).values({
    id: uuid(),
    keyHash,
    attemptedAt,
  })
  await pruneOldFailedLogins()
}

async function clearFailedLogins(keyHash: string) {
  await db
    .delete(aiVideoLoginAttempts)
    .where(eq(aiVideoLoginAttempts.keyHash, keyHash))
}

async function pruneOldFailedLogins() {
  await db
    .delete(aiVideoLoginAttempts)
    .where(lt(aiVideoLoginAttempts.attemptedAt, loginWindowStart()))
}

function loginWindowStart() {
  return new Date(now().getTime() - LOGIN_WINDOW_SECONDS * 1000)
}
