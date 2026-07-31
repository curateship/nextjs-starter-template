import { createHash, randomBytes, randomUUID } from "node:crypto"

import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { hash, verify } from "argon2"
import { eq, and, gt, inArray, isNull, ne } from "drizzle-orm"

import { normalizeSessionPolicy } from "@/lib/custom-shell"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAuthTokens,
  customShellSessions,
  customShellSettings,
  customShellUsers,
  DEFAULT_SETTINGS_KEY,
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

/**
 * Who the app should treat this browser as, and — while an admin is viewing the
 * app as a member — who is really behind it.
 */
export type SessionContext = {
  /** The person every query and guard should act as. */
  user: CustomShellUser
  /** The admin looking through their eyes, or null in the normal case. */
  viewedBy: CustomShellUser | null
}

export async function findSessionContext(
  database: CustomShellDb = db
): Promise<SessionContext | null> {
  const token = getCookie(SESSION_COOKIE_NAME)
  return token ? findSessionContextByToken(token, database) : null
}

export async function findCurrentUser(database: CustomShellDb = db) {
  return (await findSessionContext(database))?.user ?? null
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
  return (await findSessionContextByToken(token, database))?.user ?? null
}

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The idle clock is refreshed at most once a minute, so this read path does
 * not pay for a write on every request. Safe because an idle limit is never
 * shorter than MIN_SESSION_IDLE_MINUTES — normalizeSessionPolicy raises
 * anything lower — so a clock up to a minute behind cannot misjudge anyone.
 */
const LAST_SEEN_REFRESH_MS = MINUTE_MS

/**
 * The app-wide session limits (Settings → Security), read fresh on every
 * request so tightening the policy reaches sessions that already exist.
 *
 * Read here with its own narrow query rather than through shell-settings.ts,
 * because that module imports this one and the sign-in check must not sit on
 * an import cycle.
 */
async function readSessionPolicyRow(database: CustomShellDb) {
  const [row] = await database
    .select({ settings: customShellSettings.settings })
    .from(customShellSettings)
    .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    .limit(1)

  const settings = row?.settings as { sessionPolicy?: unknown } | undefined
  return normalizeSessionPolicy(settings?.sessionPolicy)
}

export async function findSessionContextByToken(
  token: string,
  database: CustomShellDb = db
): Promise<SessionContext | null> {
  // Fetched together so the policy costs no extra round trip.
  const [policy, [session]] = await Promise.all([
    readSessionPolicyRow(database),
    database
      .select()
      .from(customShellSessions)
      .where(
        and(
          eq(customShellSessions.tokenHash, hashSessionToken(token)),
          gt(customShellSessions.expiresAt, now())
        )
      )
      .limit(1),
  ])

  if (!session) {
    return null
  }

  const timestamp = now()
  const ageLimitMs = policy.maxAgeDays * DAY_MS
  const idleLimitMs = policy.idleMinutes * MINUTE_MS
  const tooOld =
    ageLimitMs > 0 &&
    timestamp.getTime() - session.createdAt.getTime() >= ageLimitMs
  const tooIdle =
    idleLimitMs > 0 &&
    timestamp.getTime() - session.lastSeenAt.getTime() >= idleLimitMs

  if (tooOld || tooIdle) {
    // Deleted, not just refused: loosening the policy later must not bring
    // sessions that already ran out back to life.
    await database
      .delete(customShellSessions)
      .where(eq(customShellSessions.id, session.id))
    return null
  }

  // Keep the idle clock current even while no idle limit is set — switching
  // one on later has to judge people by when they really were last here.
  if (timestamp.getTime() - session.lastSeenAt.getTime() >= LAST_SEEN_REFRESH_MS) {
    await database
      .update(customShellSessions)
      .set({ lastSeenAt: timestamp })
      .where(eq(customShellSessions.id, session.id))
  }

  // One query for both people, so viewing as somebody costs no extra round trip.
  const ids = session.viewingAsUserId
    ? [session.userId, session.viewingAsUserId]
    : [session.userId]
  const rows = await database
    .select()
    .from(customShellUsers)
    .where(inArray(customShellUsers.id, ids))

  const owner = rows.find((row) => row.id === session.userId)

  // A suspended account is treated as signed out, so suspending someone takes
  // effect immediately even on a session that is still inside its lifetime.
  if (!owner || owner.status === "suspended") {
    return null
  }

  if (!session.viewingAsUserId) {
    return { user: owner, viewedBy: null }
  }

  const target = rows.find((row) => row.id === session.viewingAsUserId)

  // The rules that let it start are checked again here, every request. If the
  // member has since been suspended or made an admin — or the admin driving it
  // lost their own role — the view ends and they are back to being themselves,
  // rather than being signed out or handed admin powers.
  const canView =
    target && isAdmin(owner) && target.status === "active" && !isAdmin(target)

  if (!canView) {
    // Ended for good, not just ignored for this request. Left set, the view
    // would spring back to life the moment the member was unsuspended or
    // demoted — days later, with the admin having done nothing.
    await database
      .update(customShellSessions)
      .set({ viewingAsUserId: null })
      .where(eq(customShellSessions.id, session.id))
    return { user: owner, viewedBy: null }
  }

  return { user: target, viewedBy: owner }
}
