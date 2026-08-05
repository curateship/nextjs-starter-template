import { sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { customShellRateLimits } from "@/server/schema"

type RateLimitOptions = {
  maxAttempts: number
  windowSeconds: number
}

/**
 * Counts an attempt against `key` and throws once the window is exhausted.
 *
 * The whole decision is one upsert so concurrent requests cannot race past the
 * limit, and it lives in the database so a restart does not hand an attacker a
 * fresh budget.
 */
export async function enforceRateLimit(
  key: string,
  { maxAttempts, windowSeconds }: RateLimitOptions,
  database: CustomShellDb = db
) {
  const timestamp = new Date()
  const windowCutoff = new Date(timestamp.getTime() - windowSeconds * 1_000)
  const windowExpired = sql`${customShellRateLimits.windowStartedAt} <= ${windowCutoff}`
  // Cast so Postgres can type the parameter inside the CASE arms below.
  const nowValue = sql`${timestamp}::timestamptz`

  const [bucket] = await database
    .insert(customShellRateLimits)
    .values({
      key: key.slice(0, 200),
      attempts: 1,
      windowStartedAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: customShellRateLimits.key,
      set: {
        attempts: sql`case
          when ${windowExpired} then 1
          else ${customShellRateLimits.attempts} + 1
        end`,
        windowStartedAt: sql`case
          when ${windowExpired} then ${nowValue}
          else ${customShellRateLimits.windowStartedAt}
        end`,
        blockedUntil: sql`case
          when ${windowExpired} then null
          when ${customShellRateLimits.blockedUntil} > ${nowValue}
            then ${customShellRateLimits.blockedUntil}
          when ${customShellRateLimits.attempts} + 1 > ${maxAttempts}
            then ${nowValue} + (${windowSeconds} * interval '1 second')
          else null
        end`,
        updatedAt: timestamp,
      },
    })
    .returning()

  if (bucket?.blockedUntil && bucket.blockedUntil > timestamp) {
    throw new Error("RATE_LIMITED")
  }
}

/** Clears a bucket after a successful attempt, so honest users are not punished. */
export async function clearRateLimit(
  key: string,
  database: CustomShellDb = db
) {
  await database
    .delete(customShellRateLimits)
    .where(sql`${customShellRateLimits.key} = ${key.slice(0, 200)}`)
}
