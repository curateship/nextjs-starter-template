import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type Db } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/encryption"
import {
  createUserProfile,
  deleteUserProfile,
  listUserProfiles,
  updateUserProfile,
} from "@/server/profiles"
import {
  createUserProxy,
  deleteUserProxy,
  listUserProxies,
  serializeProxy,
  updateUserProxy,
} from "@/server/proxies"
import { proxies, users } from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

// 32 bytes (64 hex chars) — valid AES-256 key for the encryption tests.
const TEST_KEY = "a".repeat(64)

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  process.env.ANTIDETECT_ENCRYPTION_KEY = TEST_KEY
  client = new PGlite()
  // users come from the baseline; proxies + profiles from 0004.
  const baseline = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const profilesProxies = await readFile(
    new URL("../../drizzle/0004_profiles_proxies.sql", import.meta.url),
    "utf8"
  )
  await client.exec(baseline)
  await client.exec(profilesProxies)
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as Db)
})

afterEach(async () => {
  await client.close()
})

// Server functions accept an injectable db; the pglite instance stands in for it.
const testDb = () => database as unknown as Db

async function seedUser(email: string) {
  const id = uuid()
  const createdAt = now()
  await database.insert(users).values({
    id,
    email,
    name: "Test",
    role: "admin",
    passwordHash: await hash("password123"),
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

describe("secret encryption", () => {
  it("roundtrips, is null-safe, and rejects tampering", () => {
    const enc = encryptSecret("hunter2")
    expect(enc).not.toBeNull()
    expect(enc?.split(":")).toHaveLength(3) // iv:authTag:ciphertext
    expect(enc).not.toContain("hunter2")
    expect(decryptSecret(enc)).toBe("hunter2")

    expect(encryptSecret(null)).toBeNull()
    expect(decryptSecret(null)).toBeNull()

    // Flip the last ciphertext byte — the GCM auth tag must reject it.
    const [iv, tag, ct] = (enc ?? "").split(":")
    const flipped = ct.endsWith("00")
      ? `${ct.slice(0, -2)}11`
      : `${ct.slice(0, -2)}00`
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`)).toThrow()
  })
})

describe("proxies: secrets + ownership", () => {
  it("stores the password encrypted and never serializes it", async () => {
    const userId = await seedUser("proxy-owner@test.dev")
    const created = await createUserProxy(
      userId,
      {
        label: "Res",
        type: "residential",
        host: "h.example",
        port: 8080,
        password: "secret-pw",
      },
      testDb()
    )

    const [row] = await database
      .select()
      .from(proxies)
      .where(eq(proxies.id, created.id))
    expect(row.password).not.toBe("secret-pw")
    expect(decryptSecret(row.password)).toBe("secret-pw")

    // serializeProxy must omit the password entirely.
    const serialized = serializeProxy(row) as Record<string, unknown>
    expect(serialized.password).toBeUndefined()
  })

  it("scopes list, delete, and update to the owner", async () => {
    const a = await seedUser("a@test.dev")
    const b = await seedUser("b@test.dev")
    const proxyA = await createUserProxy(
      a,
      { label: "A", type: "datacenter", host: "a", port: 1 },
      testDb()
    )
    await createUserProxy(
      b,
      { label: "B", type: "datacenter", host: "b", port: 2 },
      testDb()
    )

    expect((await listUserProxies(a, testDb())).map((p) => p.label)).toEqual([
      "A",
    ])

    await expect(deleteUserProxy(b, proxyA.id, testDb())).rejects.toThrow(
      "Proxy not found"
    )
    await expect(
      updateUserProxy(
        b,
        proxyA.id,
        { label: "hax", type: "datacenter", host: "x", port: 3 },
        testDb()
      )
    ).rejects.toThrow("Proxy not found")
  })

  it("keeps the existing password when an update omits it", async () => {
    const userId = await seedUser("keep-pw@test.dev")
    const created = await createUserProxy(
      userId,
      { label: "P", type: "mobile", host: "h", port: 80, password: "orig" },
      testDb()
    )

    await updateUserProxy(
      userId,
      created.id,
      { label: "P renamed", type: "mobile", host: "h", port: 80 },
      testDb()
    )

    const [row] = await database
      .select()
      .from(proxies)
      .where(eq(proxies.id, created.id))
    expect(row.label).toBe("P renamed")
    expect(decryptSecret(row.password)).toBe("orig")
  })
})

describe("profiles: ownership", () => {
  it("blocks cross-user update/delete and foreign-proxy linking", async () => {
    const a = await seedUser("pa@test.dev")
    const b = await seedUser("pb@test.dev")

    const profileA = await createUserProfile(
      a,
      { name: "A", engine: "camoufox" },
      testDb()
    )

    await expect(
      updateUserProfile(
        b,
        profileA.id,
        { name: "hax", engine: "camoufox" },
        testDb()
      )
    ).rejects.toThrow("Profile not found")
    await expect(
      deleteUserProfile(b, profileA.id, testDb())
    ).rejects.toThrow("Profile not found")

    // A must not be able to attach B's proxy to their own profile.
    const proxyB = await createUserProxy(
      b,
      { label: "B", type: "datacenter", host: "b", port: 2 },
      testDb()
    )
    await expect(
      createUserProfile(
        a,
        { name: "X", engine: "camoufox", proxyId: proxyB.id },
        testDb()
      )
    ).rejects.toThrow("Proxy not found")

    expect((await listUserProfiles(a, testDb())).map((p) => p.name)).toEqual([
      "A",
    ])
  })
})
