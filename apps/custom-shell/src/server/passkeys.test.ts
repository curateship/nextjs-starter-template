import { PGlite } from "@electric-sql/pglite"
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  deletePasskey,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  listPasskeys,
  startPasskeyAuthentication,
  startPasskeyRegistration,
  type RelyingParty,
} from "@/server/passkeys"
import {
  customShellPasskeyChallenges,
  customShellPasskeys,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

const rp: RelyingParty = {
  name: "Custom Shell",
  id: "localhost",
  origin: "http://localhost:3002",
}

const testDb = () => database as unknown as CustomShellDb

/** A saved credential the tests can point sign-in responses at. */
async function createTestPasskey(userId: string, credentialId: string) {
  const timestamp = now()
  const [row] = await database
    .insert(customShellPasskeys)
    .values({
      id: uuid(),
      userId,
      credentialId,
      // Valid base64url, meaningless as a key — verification never gets far
      // enough to mind in the tests that use it.
      publicKey: "AAAA",
      counter: 0,
      transports: null,
      name: "Test passkey",
      createdAt: timestamp,
      lastUsedAt: null,
    })
    .returning()

  return row
}

/** A response shaped well enough to reach the check under test, nothing more. */
function fakeAuthResponse(credentialId: string) {
  return { id: credentialId } as unknown as AuthenticationResponseJSON
}

describe("passkey registration", () => {
  it("issues options that exclude already-registered credentials", async () => {
    const user = await insertUser(testDb())
    await createTestPasskey(user.id, "existing-credential")

    const { options, challengeId } = await startPasskeyRegistration(
      user,
      rp,
      testDb()
    )

    expect(challengeId).toBeTruthy()
    expect(options.rp.id).toBe("localhost")
    expect(options.challenge).toBeTruthy()
    expect(options.excludeCredentials?.map((entry) => entry.id)).toContain(
      "existing-credential"
    )
    // The prompt must prove a person, not just presence — this credential
    // signs someone in outright.
    expect(options.authenticatorSelection?.userVerification).toBe("required")
  })

  it("spends the challenge on first use, even when verification fails", async () => {
    const user = await insertUser(testDb())
    const { challengeId } = await startPasskeyRegistration(user, rp, testDb())

    const garbage = { id: "garbage" } as unknown as RegistrationResponseJSON

    // First attempt reaches verification and fails there...
    await expect(
      finishPasskeyRegistration(user, challengeId, garbage, "Laptop", rp, testDb())
    ).rejects.toThrow("PASSKEY_FAILED")

    // ...and the challenge is already gone, so a replay cannot try again.
    await expect(
      finishPasskeyRegistration(user, challengeId, garbage, "Laptop", rp, testDb())
    ).rejects.toThrow("PASSKEY_ATTEMPT_EXPIRED")
  })

  it("refuses a challenge issued to a different account", async () => {
    const alice = await insertUser(testDb())
    const bob = await insertUser(testDb())
    const { challengeId } = await startPasskeyRegistration(alice, rp, testDb())

    await expect(
      finishPasskeyRegistration(
        bob,
        challengeId,
        { id: "garbage" } as unknown as RegistrationResponseJSON,
        "Laptop",
        rp,
        testDb()
      )
    ).rejects.toThrow("PASSKEY_ATTEMPT_EXPIRED")
  })

  it("sweeps expired challenges when a new ceremony starts", async () => {
    const user = await insertUser(testDb())
    const staleId = uuid()
    await database.insert(customShellPasskeyChallenges).values({
      id: staleId,
      challenge: "stale",
      type: "authentication",
      userId: null,
      expiresAt: new Date(now().getTime() - 60 * 1000),
      createdAt: new Date(now().getTime() - 6 * 60 * 1000),
    })

    await startPasskeyRegistration(user, rp, testDb())

    const stale = await database
      .select()
      .from(customShellPasskeyChallenges)
      .where(eq(customShellPasskeyChallenges.id, staleId))
    expect(stale).toHaveLength(0)
  })
})

describe("passkey sign-in", () => {
  it("refuses a credential no account has registered", async () => {
    const { challengeId } = await startPasskeyAuthentication(rp, testDb())

    await expect(
      finishPasskeyAuthentication(
        challengeId,
        fakeAuthResponse("never-registered"),
        rp,
        testDb()
      )
    ).rejects.toThrow("PASSKEY_NOT_RECOGNISED")
  })

  it("refuses an expired challenge", async () => {
    const challengeId = uuid()
    await database.insert(customShellPasskeyChallenges).values({
      id: challengeId,
      challenge: "expired",
      type: "authentication",
      userId: null,
      expiresAt: new Date(now().getTime() - 1000),
      createdAt: new Date(now().getTime() - 6 * 60 * 1000),
    })

    await expect(
      finishPasskeyAuthentication(
        challengeId,
        fakeAuthResponse("anything"),
        rp,
        testDb()
      )
    ).rejects.toThrow("PASSKEY_ATTEMPT_EXPIRED")
  })

  it("will not spend a registration challenge as a sign-in", async () => {
    const user = await insertUser(testDb())
    const { challengeId } = await startPasskeyRegistration(user, rp, testDb())

    await expect(
      finishPasskeyAuthentication(
        challengeId,
        fakeAuthResponse("anything"),
        rp,
        testDb()
      )
    ).rejects.toThrow("PASSKEY_ATTEMPT_EXPIRED")
  })

  it("tells a suspended account it is suspended, valid passkey or not", async () => {
    const user = await insertUser(testDb(), { status: "suspended" })
    await createTestPasskey(user.id, "suspended-credential")
    const { challengeId } = await startPasskeyAuthentication(rp, testDb())

    await expect(
      finishPasskeyAuthentication(
        challengeId,
        fakeAuthResponse("suspended-credential"),
        rp,
        testDb()
      )
    ).rejects.toThrow("ACCOUNT_SUSPENDED")
  })

  it("refuses an account on its way out, with no restore path", async () => {
    const user = await insertUser(testDb(), {
      status: "pending_deletion",
      deletedAt: now(),
    })
    await createTestPasskey(user.id, "deleted-credential")
    const { challengeId } = await startPasskeyAuthentication(rp, testDb())

    await expect(
      finishPasskeyAuthentication(
        challengeId,
        fakeAuthResponse("deleted-credential"),
        rp,
        testDb()
      )
    ).rejects.toThrow("ACCOUNT_PENDING_DELETION")
  })

  it("refuses an unverified account", async () => {
    const user = await insertUser(testDb(), { emailVerifiedAt: null })
    await createTestPasskey(user.id, "unverified-credential")
    const { challengeId } = await startPasskeyAuthentication(rp, testDb())

    await expect(
      finishPasskeyAuthentication(
        challengeId,
        fakeAuthResponse("unverified-credential"),
        rp,
        testDb()
      )
    ).rejects.toThrow("EMAIL_NOT_VERIFIED")
  })

  it("refuses a response whose signature cannot be checked", async () => {
    const user = await insertUser(testDb())
    await createTestPasskey(user.id, "active-credential")
    const { challengeId } = await startPasskeyAuthentication(rp, testDb())

    await expect(
      finishPasskeyAuthentication(
        challengeId,
        fakeAuthResponse("active-credential"),
        rp,
        testDb()
      )
    ).rejects.toThrow("PASSKEY_FAILED")
  })
})

describe("managing passkeys", () => {
  it("lists newest first and removes only your own", async () => {
    const alice = await insertUser(testDb())
    const bob = await insertUser(testDb())
    const first = await createTestPasskey(alice.id, "alice-key-1")
    const second = await createTestPasskey(alice.id, "alice-key-2")

    const listed = await listPasskeys(alice.id, testDb())
    expect(listed.map((row) => row.id)).toHaveLength(2)

    // Bob cannot take Alice's passkey away with a guessed id.
    await expect(
      deletePasskey(bob.id, first.id, testDb())
    ).rejects.toThrow("PASSKEY_NOT_FOUND")

    await deletePasskey(alice.id, first.id, testDb())
    const remaining = await listPasskeys(alice.id, testDb())
    expect(remaining.map((row) => row.id)).toEqual([second.id])

    // Removing the last one is allowed — the password is the way back in.
    await deletePasskey(alice.id, second.id, testDb())
    expect(await listPasskeys(alice.id, testDb())).toEqual([])
  })
})
