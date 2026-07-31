import { createHash, randomBytes, randomUUID } from "node:crypto"

import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { hash, verify } from "argon2"
import { eq, and, count, desc, gt, inArray, isNull, lte, ne, or } from "drizzle-orm"

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

/**
 * The account that actually owns this browser's session — which, while an admin
 * is viewing the app as a member, is the admin and not the member.
 *
 * Anything that manages the sessions themselves has to go through this rather
 * than `requireUser`. Acting as the viewed member would show an admin somebody
 * else's browsers and addresses, and let them sign that person out of their own
 * account.
 */
export async function requireSessionOwner(database: CustomShellDb = db) {
  const context = await findSessionContext(database)
  if (!context) {
    throw new Error("AUTH_REQUIRED")
  }
  return context.viewedBy ?? context.user
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

/** One signed-in browser, as the Security tab shows it. */
export type UserSession = {
  id: string
  /** How the browser introduced itself, or null if it did not. */
  userAgent: string | null
  ipAddress: string | null
  createdAt: Date
  lastSeenAt: Date
  /** The browser asking for the list. It is never offered a sign-out button. */
  isCurrent: boolean
}

/**
 * How many devices the list shows.
 *
 * There is a cap because sessions last a long time and nothing prunes them: an
 * account two weeks into daily use can easily hold hundreds, and all of them in
 * one modal is a wall nobody can read. The count of the rest is returned so the
 * page can say plainly that there are more, and "sign out all other devices"
 * clears them in one go.
 */
export const SESSION_LIST_LIMIT = 20

/**
 * The rule for "this session would still let somebody in", written the same way
 * `findSessionContextByToken` above decides it: inside its own lifetime, and
 * inside both limits from Settings → Security. A limit of 0 means it is off.
 *
 * The Security tab must not list a session the app would already refuse. Left
 * to the lifetime alone it would show sessions that die the moment their
 * browser tries to use them, which is worse than not listing them at all.
 */
function stillSignedIn(
  userId: string,
  policy: { maxAgeDays: number; idleMinutes: number },
  timestamp: Date
) {
  const conditions = [
    eq(customShellSessions.userId, userId),
    gt(customShellSessions.expiresAt, timestamp),
  ]

  if (policy.maxAgeDays > 0) {
    conditions.push(
      gt(
        customShellSessions.createdAt,
        new Date(timestamp.getTime() - policy.maxAgeDays * DAY_MS)
      )
    )
  }
  if (policy.idleMinutes > 0) {
    conditions.push(
      gt(
        customShellSessions.lastSeenAt,
        new Date(timestamp.getTime() - policy.idleMinutes * MINUTE_MS)
      )
    )
  }

  return and(...conditions)
}

/**
 * Deletes the sessions this account has that would already be refused, and
 * answers how many went.
 *
 * Called at sign-in, so the pile clears itself without a background job. It is
 * only ever the signer's own rows, and only ones the very next request would
 * have deleted anyway — this brings the deletion forward, it does not sign
 * anybody out who was still getting in.
 */
export async function pruneRefusedSessions(
  userId: string,
  database: CustomShellDb = db
) {
  const policy = await readSessionPolicyRow(database)
  const timestamp = now()
  const refused = [lte(customShellSessions.expiresAt, timestamp)]

  if (policy.maxAgeDays > 0) {
    refused.push(
      lte(
        customShellSessions.createdAt,
        new Date(timestamp.getTime() - policy.maxAgeDays * DAY_MS)
      )
    )
  }
  if (policy.idleMinutes > 0) {
    refused.push(
      lte(
        customShellSessions.lastSeenAt,
        new Date(timestamp.getTime() - policy.idleMinutes * MINUTE_MS)
      )
    )
  }

  const deleted = await database
    .delete(customShellSessions)
    .where(and(eq(customShellSessions.userId, userId), or(...refused)))
    .returning({ id: customShellSessions.id })

  return deleted.length
}

/**
 * The account's most recently used sessions, busiest first, with the number it
 * has in total.
 *
 * Sessions the app would refuse are left out but not deleted here: a read path
 * that writes would make simply opening the Security tab a delete. Signing in
 * is what clears them.
 */
export async function listUserSessions(
  userId: string,
  currentToken: string | undefined,
  database: CustomShellDb = db
): Promise<{ sessions: UserSession[]; total: number }> {
  const policy = await readSessionPolicyRow(database)
  const live = stillSignedIn(userId, policy, now())

  // The browser asking is always in this window: listing is itself a request,
  // and a request refreshes its own last-seen clock.
  const [rows, [counted]] = await Promise.all([
    database
      .select()
      .from(customShellSessions)
      .where(live)
      .orderBy(desc(customShellSessions.lastSeenAt))
      .limit(SESSION_LIST_LIMIT),
    database
      .select({ total: count() })
      .from(customShellSessions)
      .where(live),
  ])

  const currentHash = currentToken ? hashSessionToken(currentToken) : null

  return {
    // The token hash stays here. It is the only thing on the row that could
    // sign somebody in, so it must not travel out to the browser with the rest.
    sessions: rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      isCurrent: currentHash != null && row.tokenHash === currentHash,
    })),
    total: counted?.total ?? rows.length,
  }
}

/**
 * Signs out every other browser, and answers how many of them were really still
 * signed in.
 *
 * The delete takes refused rows with it, which is the tidying we want. Counting
 * them would not be: telling somebody they just signed out fifty devices when
 * the list in front of them showed three is alarming and untrue.
 */
export async function signOutOtherDevices(
  userId: string,
  currentToken: string | undefined,
  database: CustomShellDb = db
) {
  const { total } = await listUserSessions(userId, currentToken, database)
  await deleteOtherSessions(userId, currentToken, database)

  // The browser asking is one of the live ones, and it is the one kept.
  return Math.max(total - 1, 0)
}

/**
 * Ends one other session.
 *
 * The where clause is the whole guard: it matches only a row this account owns
 * and only one that is not the browser asking, so a guessed id can neither sign
 * somebody else out nor sign this browser out of the page it is on.
 */
export async function deleteUserSession(
  userId: string,
  sessionId: string,
  currentToken: string | undefined,
  database: CustomShellDb = db
) {
  const conditions = [
    eq(customShellSessions.id, sessionId),
    eq(customShellSessions.userId, userId),
  ]
  if (currentToken) {
    conditions.push(
      ne(customShellSessions.tokenHash, hashSessionToken(currentToken))
    )
  }

  const [deleted] = await database
    .delete(customShellSessions)
    .where(and(...conditions))
    .returning({ id: customShellSessions.id })

  if (!deleted) {
    throw new Error("SESSION_NOT_FOUND")
  }
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
