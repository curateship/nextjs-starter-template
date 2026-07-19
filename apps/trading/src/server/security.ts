import { createHash, randomUUID } from "node:crypto"

import {
  getCookie,
  getRequestHeader,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server"
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
  process.env.CUSTOM_SHELL_SESSION_TTL_HOURS ||
    String(DEFAULT_SESSION_TTL_HOURS),
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

export async function findCurrentUser(database: CustomShellDb = db) {
  const single = getCookie(SESSION_COOKIE_NAME)
  const candidates = sessionTokensFromHeader()
  if (single && !candidates.includes(single)) candidates.unshift(single)
  for (const token of candidates) {
    const user = await findUserBySessionToken(token, database)
    if (user) return user
  }
  return null
}

export async function findUserBySessionToken(
  token: string,
  database: CustomShellDb = db
): Promise<CustomShellUser | null> {
  const [row] = await database
    .select({ user: customShellUsers })
    .from(customShellSessions)
    .innerJoin(
      customShellUsers,
      eq(customShellSessions.userId, customShellUsers.id)
    )
    .where(
      and(
        eq(customShellSessions.tokenHash, hashSessionToken(token)),
        gt(customShellSessions.expiresAt, now())
      )
    )
    .limit(1)
  return row?.user ?? null
}
