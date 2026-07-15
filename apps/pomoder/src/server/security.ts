import { createHash, randomBytes, randomUUID } from "node:crypto"

import {
  getCookie,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server"
import { hash, verify } from "argon2"
import { and, eq, gt, isNull } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { authTokens, sessions, users, type User } from "@/server/schema"

type PomoderTransaction = Parameters<Parameters<PomoderDb["transaction"]>[0]>[0]
type SecurityDatabase = PomoderDb | PomoderTransaction

export const SESSION_COOKIE_NAME = "pomoder_session"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

export function now() {
  return new Date()
}
export function uuid() {
  return randomUUID()
}
export function createSecretToken() {
  return randomBytes(32).toString("base64url")
}
export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex")
}
export const createSessionToken = createSecretToken
export const hashSessionToken = hashToken
export function createSessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1_000)
}
export function hashPassword(password: string) {
  return hash(password, {
    type: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  })
}

export async function consumeAuthToken(
  tokenHash: string,
  purpose: "verify_email" | "reset_password",
  timestamp: Date,
  database: SecurityDatabase
) {
  const [token] = await database
    .update(authTokens)
    .set({ usedAt: timestamp })
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, timestamp)
      )
    )
    .returning()
  if (!token) throw new Error("INVALID_OR_EXPIRED_TOKEN")
  return token
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
    maxAge: SESSION_TTL_SECONDS,
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

export async function findCurrentUser(database: PomoderDb = db) {
  const token = getCookie(SESSION_COOKIE_NAME)
  return token ? findUserBySessionToken(token, database) : null
}

export async function requireUser(database: PomoderDb = db) {
  const user = await findCurrentUser(database)
  if (!user) throw new Error("AUTH_REQUIRED")
  return user
}

export async function findUserBySessionToken(
  token: string,
  database: PomoderDb = db
): Promise<User | null> {
  const [session] = await database
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, now())
      )
    )
    .limit(1)
  if (!session) return null
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
  return user ?? null
}
