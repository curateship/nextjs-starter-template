import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import {
  customShellAuthSecurityReports,
  customShellUsers,
} from "@/server/schema"
import {
  consumeAuthToken,
  createAuthToken,
} from "@/server/auth/security"
import { reportUnwantedAuthRequest } from "@/server/auth/unwanted-request"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
})

afterEach(async () => {
  await client.close()
})

describe("reporting an unwanted sign-in email", () => {
  it.each(["reset_password", "login"] as const)(
    "stops one %s link and records the report",
    async (purpose) => {
      const user = await insertUser(database)
      const token = await createAuthToken(user.id, purpose, database)
      const reportedAt = new Date("2026-08-14T12:00:00Z")

      await reportUnwantedAuthRequest(
        token,
        purpose,
        database,
        reportedAt
      )

      await expect(
        consumeAuthToken(token, purpose, database)
      ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")
      const reports = await database
        .select()
        .from(customShellAuthSecurityReports)
        .where(eq(customShellAuthSecurityReports.userId, user.id))
      expect(reports).toMatchObject([
        { tokenPurpose: purpose, createdAt: reportedAt },
      ])
    }
  )

  it("does not lock the account or stop a fresh link", async () => {
    const user = await insertUser(database)
    const unwanted = await createAuthToken(user.id, "login", database)
    await reportUnwantedAuthRequest(unwanted, "login", database)

    const fresh = await createAuthToken(user.id, "login", database)
    await expect(consumeAuthToken(fresh, "login", database)).resolves.toMatchObject(
      { userId: user.id }
    )
    const [unchanged] = await database
      .select({ status: customShellUsers.status })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, user.id))
    expect(unchanged.status).toBe("active")
  })

  it("records nothing for an invalid or already reported link", async () => {
    const user = await insertUser(database)
    const token = await createAuthToken(user.id, "reset_password", database)
    await reportUnwantedAuthRequest(token, "reset_password", database)

    await expect(
      reportUnwantedAuthRequest(token, "reset_password", database)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")
    await expect(
      reportUnwantedAuthRequest("not-a-token", "login", database)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    const reports = await database.select().from(customShellAuthSecurityReports)
    expect(reports).toHaveLength(1)
  })
})
