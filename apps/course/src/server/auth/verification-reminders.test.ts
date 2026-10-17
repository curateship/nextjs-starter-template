import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VERIFICATION_REMINDER_DAYS } from "@/lib/email/verification-reminder"
import { sendDueVerificationReminders } from "@/server/auth/verification-reminders"
import { type CustomShellDb } from "@/server/db"
import { listAccounts } from "@/server/people/accounts"
import {
  customShellAuthTokens,
  customShellSystemEmailSends,
  customShellUsers,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb

const NOW = new Date("2026-08-14T12:00:00Z")
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY_MS)
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  vi.spyOn(console, "info").mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await client.close()
})

describe("verification reminders", () => {
  it("claims each due password sign-up once and skips ineligible accounts", async () => {
    const due = await insertUser(database, {
      email: "due@example.test",
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })
    const onBoundary = await insertUser(database, {
      email: "boundary@example.test",
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS),
    })
    await insertUser(database, {
      email: "recent@example.test",
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS - 1),
    })
    await insertUser(database, {
      email: "verified@example.test",
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })
    await insertUser(database, {
      email: "invited@example.test",
      passwordHash: null,
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })
    await insertUser(database, {
      email: "suspended@example.test",
      status: "suspended",
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })
    await insertUser(database, {
      email: "deleting@example.test",
      status: "pending_deletion",
      deletedAt: daysAgo(1),
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })
    await insertUser(database, {
      email: "already@example.test",
      emailVerifiedAt: null,
      verificationReminderSentAt: daysAgo(1),
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })

    expect(await sendDueVerificationReminders(database, NOW)).toBe(2)
    expect(await sendDueVerificationReminders(database, NOW)).toBe(0)

    const sends = await database
      .select({
        kind: customShellSystemEmailSends.kind,
        to: customShellSystemEmailSends.toEmail,
      })
      .from(customShellSystemEmailSends)
    expect(sends).toEqual(
      expect.arrayContaining([
        { kind: "verification-reminder", to: due.email },
        { kind: "verification-reminder", to: onBoundary.email },
      ])
    )
    expect(sends).toHaveLength(2)

    const tokens = await database
      .select({ userId: customShellAuthTokens.userId })
      .from(customShellAuthTokens)
      .where(eq(customShellAuthTokens.purpose, "verify_email"))
    expect(tokens.map((token) => token.userId).sort()).toEqual(
      [due.id, onBoundary.id].sort()
    )

    const reminded = await database
      .select({ email: customShellUsers.email })
      .from(customShellUsers)
      .where(eq(customShellUsers.verificationReminderSentAt, NOW))
    expect(reminded.map((user) => user.email).sort()).toEqual(
      [due.email, onBoundary.email].sort()
    )
  })

  it("records delivery failures once and continues through the batch", async () => {
    vi.stubEnv("CUSTOM_SHELL_RESEND_API_KEY", "test-key")
    const send = vi.fn().mockRejectedValue(new Error("network down"))
    vi.stubGlobal("fetch", send)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await insertUser(database, {
      email: "first-failure@example.test",
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })
    await insertUser(database, {
      email: "second-failure@example.test",
      emailVerifiedAt: null,
      createdAt: daysAgo(VERIFICATION_REMINDER_DAYS + 1),
    })

    expect(await sendDueVerificationReminders(database, NOW)).toBe(2)
    expect(await sendDueVerificationReminders(database, NOW)).toBe(0)
    expect(send).toHaveBeenCalledTimes(2)
    expect(
      await database
        .select({
          status: customShellSystemEmailSends.status,
          error: customShellSystemEmailSends.error,
        })
        .from(customShellSystemEmailSends)
    ).toEqual([
      {
        status: "failed",
        error: "The email service could not be reached.",
      },
      {
        status: "failed",
        error: "The email service could not be reached.",
      },
    ])
  })

  it("filters the users list to active accounts without a verified email", async () => {
    const unverified = await insertUser(database, {
      email: "unverified@example.test",
      emailVerifiedAt: null,
    })
    const invited = await insertUser(database, {
      email: "invited@example.test",
      passwordHash: null,
      emailVerifiedAt: null,
    })
    await insertUser(database, { email: "verified@example.test" })
    await insertUser(database, {
      email: "suspended@example.test",
      status: "suspended",
      emailVerifiedAt: null,
    })

    const result = await listAccounts(
      {
        search: "",
        role: "all",
        status: "unverified",
        page: 1,
        pageSize: 25,
        sort: "created",
        direction: "desc",
      },
      database
    )

    expect(result.accounts.map((account) => account.id).sort()).toEqual(
      [unverified.id, invited.id].sort()
    )
    expect(result.total).toBe(2)
  })
})
