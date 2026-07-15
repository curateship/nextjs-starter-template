import { sql } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { rateLimits } from "@/server/schema"

export async function enforceRateLimit(
  key: string,
  {
    maxAttempts,
    windowSeconds,
  }: { maxAttempts: number; windowSeconds: number },
  database: PomoderDb = db
) {
  const timestamp = new Date()
  const windowCutoff = new Date(timestamp.getTime() - windowSeconds * 1_000)
  const windowExpired = sql`${rateLimits.windowStartedAt} <= ${windowCutoff}`
  const [bucket] = await database
    .insert(rateLimits)
    .values({
      key,
      attempts: 1,
      windowStartedAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        attempts: sql`case when ${windowExpired} then 1 else ${rateLimits.attempts} + 1 end`,
        windowStartedAt: sql`case when ${windowExpired} then ${timestamp} else ${rateLimits.windowStartedAt} end`,
        blockedUntil: sql`case
          when ${windowExpired} then null
          when ${rateLimits.blockedUntil} > ${timestamp} then ${rateLimits.blockedUntil}
          when ${rateLimits.attempts} + 1 > ${maxAttempts}
            then ${rateLimits.windowStartedAt} + (${windowSeconds} * interval '1 second')
          else null
        end`,
        updatedAt: timestamp,
      },
    })
    .returning()

  if (bucket.blockedUntil && bucket.blockedUntil > timestamp) {
    throw new Error("RATE_LIMITED")
  }
}
