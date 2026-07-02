import { createHash } from "node:crypto"

import { and, eq, gt, lt, sql } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import { loginRateLimits } from "@/server/schema"
import { now, uuid } from "@/server/security"

const LOGIN_MAX_ATTEMPTS = readPositiveInt("ANTIDETECT_LOGIN_MAX_ATTEMPTS", 5)
const LOGIN_WINDOW_SECONDS = readPositiveInt(
  "ANTIDETECT_LOGIN_WINDOW_SECONDS",
  15 * 60
)

export function loginRateLimitKey(email: string, ip: string) {
  return createHash("sha256")
    .update(`${ip}:${email}`, "utf8")
    .digest("hex")
}

export async function enforceLoginRateLimit(
  key: string,
  database: Db = db,
  currentTime = now()
) {
  const cutoff = loginWindowCutoff(currentTime)
  await pruneExpiredLoginFailures(key, cutoff, database)

  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(loginRateLimits)
    .where(
      and(
        eq(loginRateLimits.rateLimitKey, key),
        gt(loginRateLimits.attemptedAt, cutoff)
      )
    )

  if ((row?.count ?? 0) >= LOGIN_MAX_ATTEMPTS) {
    throw new Error("Too many login attempts")
  }
}

export async function recordFailedLogin(
  key: string,
  database: Db = db,
  currentTime = now()
) {
  await database.insert(loginRateLimits).values({
    id: uuid(),
    rateLimitKey: key,
    attemptedAt: currentTime,
  })
}

export async function clearFailedLogins(key: string, database: Db = db) {
  await database
    .delete(loginRateLimits)
    .where(eq(loginRateLimits.rateLimitKey, key))
}

function loginWindowCutoff(currentTime: Date) {
  return new Date(currentTime.getTime() - LOGIN_WINDOW_SECONDS * 1000)
}

async function pruneExpiredLoginFailures(
  key: string,
  cutoff: Date,
  database: Db
) {
  await database
    .delete(loginRateLimits)
    .where(
      and(
        eq(loginRateLimits.rateLimitKey, key),
        lt(loginRateLimits.attemptedAt, cutoff)
      )
    )
}

function readPositiveInt(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}
