import { createHash, randomUUID } from "node:crypto"

import {
  getCookie,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server"
import { verify } from "argon2"
import { eq, and, gt } from "drizzle-orm"

import { db, type AiVideoDb } from "@/server/db"
import {
  aiVideoSessions,
  aiVideoUsers,
  type AiVideoUser,
} from "@/server/schema"

// This module loads with the first server request, which makes it the
// de-facto server boot hook: start the creator-watch scheduler here (no-op
// unless AI_VIDEO_WATCH_ENABLED=1; dynamic import avoids a module cycle).
void import("@/server/creator-watch")
  .then((module) => module.registerWatchScheduler())
  .catch(() => undefined)

export const SESSION_COOKIE_NAME = "ai_video_session"
const DEFAULT_SESSION_TTL_HOURS = 24 * 7
const SESSION_TTL_HOURS = Number.parseInt(
  process.env.AI_VIDEO_SESSION_TTL_HOURS || String(DEFAULT_SESSION_TTL_HOURS),
  10
)

export function now() {
  return new Date()
}

export function uuid() {
  return randomUUID()
}

// Shared session gate for server modules: returns the signed-in user or
// throws the standard error every lib/api safe-error set already knows.
export async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
  }
  return user
}

// Gate for workspace-admin actions (settings, provider keys). Server functions
// are callable directly by any client, so admin-only mutations must verify the
// role themselves — middleware/route gating doesn't protect server fns.
export async function requireAdminUser() {
  const user = await requireUser()
  if (user.role !== "admin") {
    throw new Error("Not authorized")
  }
  return user
}

export function createSessionToken() {
  return randomUUID() + randomUUID()
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function createSessionExpiresAt() {
  return new Date(now().getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000)
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

export function setSessionCookie(token: string) {
  setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_HOURS * 3600,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
}

export function clearSessionCookie() {
  setCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
}

export async function findCurrentUser(database: AiVideoDb = db) {
  const token = getCookie(SESSION_COOKIE_NAME)
  return token ? findUserBySessionToken(token, database) : null
}

export async function findUserBySessionToken(
  token: string,
  database: AiVideoDb = db
): Promise<AiVideoUser | null> {
  const [session] = await database
    .select()
    .from(aiVideoSessions)
    .where(
      and(
        eq(aiVideoSessions.tokenHash, hashSessionToken(token)),
        gt(aiVideoSessions.expiresAt, now())
      )
    )
    .limit(1)

  if (!session) {
    return null
  }

  const [user] = await database
    .select()
    .from(aiVideoUsers)
    .where(eq(aiVideoUsers.id, session.userId))
    .limit(1)

  return user ?? null
}
