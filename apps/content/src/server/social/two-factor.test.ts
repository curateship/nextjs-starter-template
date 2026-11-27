import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { promoAccounts } from "./schema"
import { codeAt, currentCodes, readSecret, removeTwoFactor, saveTwoFactor, totpCode } from "./two-factor"

/** RFC 6238's own SHA1 secret, "12345678901234567890", and the same as base32. */
const RFC_KEY = Buffer.from("12345678901234567890", "ascii")
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

describe("authenticator codes", () => {
  it("matches the RFC 6238 test values", () => {
    const cases: Array<[number, string]> = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ]
    for (const [seconds, code] of cases) {
      expect(codeAt(RFC_KEY, new Date(seconds * 1000), 8)).toBe(code)
      // Six digits are the last six, which is what an authenticator app shows.
      expect(totpCode(RFC_SECRET, new Date(seconds * 1000))).toBe(code.slice(2))
    }
  })

  it("reads the secret from its letters or from the QR code's link", () => {
    expect(readSecret("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")).toBe(RFC_SECRET)
    expect(readSecret(`otpauth://totp/Reddit:quiet?secret=${RFC_SECRET}&issuer=Reddit`)).toBe(RFC_SECRET)
    expect(() => readSecret("not a secret!")).toThrow("not an authenticator secret")
    expect(() => readSecret(`otpauth://totp/x?secret=${RFC_SECRET}&digits=8`)).toThrow("kind of code")
  })
})

describe("an account's saved secret", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let accountId: string

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, handle: "quiet_builder" })
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  it("is unreadable in the database and gives the same code as an authenticator app", async () => {
    await saveTwoFactor(userId, accountId, RFC_SECRET, db)
    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    expect(row.totpSecretEncrypted).not.toContain(RFC_SECRET)
    expect(row.totpSecretEncrypted).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/)

    const at = new Date(1111111111 * 1000)
    expect(await currentCodes(userId, { accountIds: [accountId] }, db, at)).toEqual([
      { accountId, handle: "quiet_builder", code: "050471", secondsLeft: 29 },
    ])

    await removeTwoFactor(userId, accountId, db)
    expect(await currentCodes(userId, { accountIds: [accountId] }, db, at)).toEqual([])
  })

  it("refuses another person's account", async () => {
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(saveTwoFactor(stranger, accountId, RFC_SECRET, db)).rejects.toThrow("not there any more")
  })
})
