import { createHash, randomUUID } from "node:crypto"

import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { verify } from "argon2"
import { eq, and, gt } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import {
  sessions,
  users,
  type User,
} from "@/server/schema"

export const SESSION_COOKIE_NAME = "session"
const DEFAULT_SESSION_TTL_HOURS = 24
const SESSION_TTL_HOURS = Number.parseInt(
  process.env.ANTIDETECT_SESSION_TTL_HOURS || String(DEFAULT_SESSION_TTL_HOURS),
  10
)

export function now() {
  return new Date()
}

export function uuid() {
  return randomUUID()
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

export async function findCurrentUser(database: Db = db) {
  const token = getCookie(SESSION_COOKIE_NAME)
  return token ? findUserBySessionToken(token, database) : null
}

export async function findUserBySessionToken(
  token: string,
  database: Db = db
): Promise<User | null> {
  const [session] = await database
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, now())
      )
    )
    .limit(1)

  if (!session) {
    return null
  }

  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)

  return user ?? null
}
