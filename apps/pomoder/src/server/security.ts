import { createHash, randomBytes, randomUUID } from "node:crypto"

import {
  getCookie,
  getRequestHeader,
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

/**
 * Every session-cookie value in the raw Cookie header. Browsers can hold
 * several same-named cookies for one host (host-only vs Domain= variants,
 * and every local app on localhost shares the name across ports) and they
 * send them all — reading only the first one strands a valid login behind a
 * stale twin, which looks like "clicking Log in does nothing".
 */
// The Cookie header is attacker-controlled: a malformed percent-escape makes
// decodeURIComponent throw, so decode defensively and drop anything unusable.
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function sessionTokensFromHeader(): string[] {
  const header = getRequestHeader("cookie") ?? ""
  const tokens: string[] = []
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue
    const value = part.slice(eq + 1).trim()
    if (!value) continue
    const decoded = safeDecode(value)
    // Cap the candidates tried so a header stuffed with session-named cookies
    // can't amplify one request into many session lookups.
    if (decoded && !tokens.includes(decoded)) tokens.push(decoded)
    if (tokens.length >= 4) break
  }
  return tokens
}

export async function findCurrentUser(database: PomoderDb = db) {
  const single = getCookie(SESSION_COOKIE_NAME)
  const candidates = sessionTokensFromHeader()
  if (single && !candidates.includes(single)) candidates.unshift(single)
  for (const token of candidates) {
    const user = await findUserBySessionToken(token, database)
    if (user) return user
  }
  return null
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
