import { createHash, randomBytes, randomUUID } from "node:crypto"

import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { hash, verify } from "argon2"
import { eq, and, gt, isNull, ne } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAuthTokens,
  customShellSessions,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"

export const SESSION_COOKIE_NAME = "custom_shell_session"
const TEN_YEARS_IN_HOURS = 24 * 365 * 10
const SESSION_TTL_HOURS = Number.parseInt(
  process.env.CUSTOM_SHELL_SESSION_TTL_HOURS || String(TEN_YEARS_IN_HOURS),
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

/** Single-use secret for verification and password-reset links. */
export function createSecretToken() {
  return randomBytes(32).toString("hex")
}

export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function hashSessionToken(token: string) {
  return hashToken(token)
}

export function createSessionExpiresAt() {
  return new Date(now().getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000)
}

// Matches the parameters of the seeded admin hash in scripts/setup-database.mjs
// so both are verifiable by the same argon2 settings.
export function hashPassword(password: string) {
  return hash(password, {
    type: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  })
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

export const AUTH_TOKEN_TTL_MS = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
} as const

export type AuthTokenPurpose = keyof typeof AUTH_TOKEN_TTL_MS

type AuthTokenDatabase = Pick<CustomShellDb, "insert" | "update">

/** Issues a link token and returns the raw secret; only its hash is stored. */
export async function createAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  database: AuthTokenDatabase = db
) {
  const token = createSecretToken()
  const createdAt = now()

  await database.insert(customShellAuthTokens).values({
    id: uuid(),
    userId,
    tokenHash: hashToken(token),
    purpose,
    expiresAt: new Date(createdAt.getTime() + AUTH_TOKEN_TTL_MS[purpose]),
    createdAt,
  })

  return token
}

/**
 * Spends a link token. The update is the guard: a token that is expired or
 * already used matches nothing, so it can never be redeemed twice.
 */
export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose,
  database: AuthTokenDatabase = db,
  timestamp = now()
) {
  const [consumed] = await database
    .update(customShellAuthTokens)
    .set({ usedAt: timestamp })
    .where(
      and(
        eq(customShellAuthTokens.tokenHash, hashToken(token)),
        eq(customShellAuthTokens.purpose, purpose),
        isNull(customShellAuthTokens.usedAt),
        gt(customShellAuthTokens.expiresAt, timestamp)
      )
    )
    .returning()

  if (!consumed) {
    throw new Error("INVALID_OR_EXPIRED_TOKEN")
  }

  return consumed
}

// Session cookie: SameSite=Lax, and only Secure over real HTTPS. The IDE's
// embedded preview is not a secure context, so a Secure cookie would be rejected
// and sign-in would silently fail — keep it non-Secure in http dev. Route auth
// is guarded by the _authenticated loader (reads the cookie from the request),
// and CSRF by requireAppOrigin() on every mutation.
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

/** The one signed-in check. Server functions and loaders both go through it. */
export async function requireUser(database: CustomShellDb = db) {
  const user = await findCurrentUser(database)
  if (!user) {
    throw new Error("AUTH_REQUIRED")
  }
  return user
}

export async function requireAdmin(database: CustomShellDb = db) {
  const user = await requireUser(database)
  if (!isAdmin(user)) {
    throw new Error("FORBIDDEN")
  }
  return user
}

export function isAdmin(user: Pick<CustomShellUser, "role">) {
  return user.role === "admin"
}

/** Signs out every other device by dropping their sessions. */
export async function deleteOtherSessions(
  userId: string,
  currentToken: string | undefined,
  database: CustomShellDb = db
) {
  const deleted = await database
    .delete(customShellSessions)
    .where(
      currentToken
        ? and(
            eq(customShellSessions.userId, userId),
            ne(customShellSessions.tokenHash, hashToken(currentToken))
          )
        : eq(customShellSessions.userId, userId)
    )
    .returning({ id: customShellSessions.id })

  return deleted.length
}

export function getSessionToken() {
  return getCookie(SESSION_COOKIE_NAME)
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

  // A suspended account is treated as signed out, so suspending someone takes
  // effect immediately even on a session that is still inside its lifetime.
  if (!user || user.status === "suspended") {
    return null
  }

  return user
}
