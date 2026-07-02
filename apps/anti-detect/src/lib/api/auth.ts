import { createServerFn } from "@tanstack/react-start"
import { getCookie, getRequestIP } from "@tanstack/react-start/server"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { sessions, users } from "@/server/schema"
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
import {
  clearFailedLogins,
  enforceLoginRateLimit,
  loginRateLimitKey,
  recordFailedLogin,
} from "@/server/login-rate-limit"

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
}

const loginSchema = z.object({
  email: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
})

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
    const rateLimitKey = loginRateLimitKey(email, getLoginClientIp())
    await enforceLoginRateLimit(rateLimitKey)

    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1)

    if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
      await recordFailedLogin(rateLimitKey)
      throw new Error("Invalid email or password.")
    }

    await clearFailedLogins(rateLimitKey)
    const token = createSessionToken()
    await db.insert(sessions).values({
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
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(token)))
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

function getLoginClientIp() {
  return (
    getRequestIP({
      xForwardedFor: process.env.ANTIDETECT_TRUST_PROXY_HEADERS === "true",
    }) || "unknown"
  )
}
