import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { enforceLoginRateLimit } from "@/server/auth/login-lockout"
import { type CustomShellDb } from "@/server/db"
import { customShellSystemEmailSends } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

describe("password sign-in lockouts", () => {
  let client: PGlite
  let database: CustomShellDb

  const origin = {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    ipAddress: "203.0.113.7",
  }

  beforeEach(async () => {
    ;({ client, db: database } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  async function spendAvailableAttempts(email: string, visitorIp: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await enforceLoginRateLimit(email, visitorIp, origin, database)
    }
  }

  async function crossIntoLockout(email: string, visitorIp: string) {
    await spendAvailableAttempts(email, visitorIp)
    await expect(
      enforceLoginRateLimit(email, visitorIp, origin, database)
    ).rejects.toThrow("RATE_LIMITED")
  }

  it("sends one email when a real account first becomes locked", async () => {
    await insertUser(database, {
      email: "owner@example.test",
      name: "Owner Example",
    })

    await spendAvailableAttempts("owner@example.test", "203.0.113.7")
    const blocked = await Promise.allSettled([
      enforceLoginRateLimit(
        "owner@example.test",
        "203.0.113.7",
        origin,
        database
      ),
      enforceLoginRateLimit(
        "owner@example.test",
        "203.0.113.7",
        origin,
        database
      ),
    ])

    expect(blocked.map((attempt) => attempt.status)).toEqual([
      "rejected",
      "rejected",
    ])

    expect(await database.select().from(customShellSystemEmailSends)).toEqual([
      expect.objectContaining({
        kind: "account-locked",
        toEmail: "owner@example.test",
      }),
    ])
  })

  it("does not email an address that has no account", async () => {
    await crossIntoLockout("missing@example.test", "203.0.113.8")

    expect(await database.select().from(customShellSystemEmailSends)).toEqual(
      []
    )
  })
})
