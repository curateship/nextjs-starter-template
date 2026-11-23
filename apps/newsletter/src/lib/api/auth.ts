import { createServerFn } from "@tanstack/react-start"
import { getCookie, getRequestIP } from "@tanstack/react-start/server"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { customShellSessions, customShellUsers } from "@/server/schema"
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
const loginFailures = new Map<string, number[]>()

export function getAuthErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication request failed."
}

const loadCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async () => {
    void import("@/server/automations/engine").then((engine) =>
      engine.ensureTickerStarted()
    )
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
    enforceLoginRateLimit(rateLimitKey)

    const [user] = await db
      .select()
      .from(customShellUsers)
      .where(sql`lower(${customShellUsers.email}) = ${email}`)
      .limit(1)

    if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
      recordFailedLogin(rateLimitKey)
      throw new Error("Invalid email or password.")
    }

    clearFailedLogins(rateLimitKey)
    const token = createSessionToken()
    await db.insert(customShellSessions).values({
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
      .delete(customShellSessions)
      .where(eq(customShellSessions.tokenHash, hashSessionToken(token)))
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
  const ip = getRequestIP({ xForwardedFor: true }) || "unknown"
  return `${ip}:${email}`
}

function enforceLoginRateLimit(key: string) {
  if (recentFailedLogins(key).length >= LOGIN_MAX_ATTEMPTS) {
    throw new Error("Too many login attempts")
  }
}

function recordFailedLogin(key: string) {
  loginFailures.set(key, [...recentFailedLogins(key), Date.now() / 1000])
}

function clearFailedLogins(key: string) {
  loginFailures.delete(key)
}

function recentFailedLogins(key: string) {
  const cutoff = Date.now() / 1000 - LOGIN_WINDOW_SECONDS
  const attempts = (loginFailures.get(key) || []).filter((time) => time > cutoff)
  loginFailures.set(key, attempts)
  return attempts
}
