import { createHash, randomUUID } from "node:crypto"

import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { verify } from "argon2"
import { eq, and, gt } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  customShellSessions,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"

import { now, uuid } from "@/server/util"

export { now, uuid }

export const SESSION_COOKIE_NAME = "custom_shell_session"
// This app can sign trades, so a leaked session token is a trading
// credential — default to 30 days rather than the shell's decade-long
// default. Override with CUSTOM_SHELL_SESSION_TTL_HOURS.
const DEFAULT_SESSION_TTL_HOURS = 24 * 30
const SESSION_TTL_HOURS = Number.parseInt(
  process.env.CUSTOM_SHELL_SESSION_TTL_HOURS || String(DEFAULT_SESSION_TTL_HOURS),
  10
)

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

export async function findCurrentUser(database: CustomShellDb = db) {
  const token = getCookie(SESSION_COOKIE_NAME)
  return token ? findUserBySessionToken(token, database) : null
}

export async function findUserBySessionToken(
  token: string,
  database: CustomShellDb = db
): Promise<CustomShellUser | null> {
  const [session] = await database
    .select()
    .from(customShellSessions)
    .where(
      and(
        eq(customShellSessions.tokenHash, hashSessionToken(token)),
        gt(customShellSessions.expiresAt, now())
      )
    )
    .limit(1)

  if (!session) {
    return null
  }

  const [user] = await database
    .select()
    .from(customShellUsers)
    .where(eq(customShellUsers.id, session.userId))
    .limit(1)

  return user ?? null
}
