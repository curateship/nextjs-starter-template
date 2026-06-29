import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type Db } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/encryption"
import { generateFingerprint } from "@/server/fingerprint"
import {
  bulkAddProfileTag,
  bulkDeleteProfiles,
  bulkMoveProfiles,
  createUserFolder,
  createUserProfile,
  createUserStatus,
  deleteUserProfile,
  duplicateUserProfile,
  listUserFolders,
  listUserProfiles,
  listUserStatuses,
  previewProfileFingerprint,
  updateUserProfile,
} from "@/server/profiles"
import {
  createUserProxiesBulk,
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
  // users come from the baseline; proxies + profiles from 0004; protocol from 0005.
  const baseline = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const profilesProxies = await readFile(
    new URL("../../drizzle/0004_profiles_proxies.sql", import.meta.url),
    "utf8"
  )
  const proxyProtocol = await readFile(
    new URL("../../drizzle/0005_proxy_protocol.sql", import.meta.url),
    "utf8"
  )
  const organization = await readFile(
    new URL("../../drizzle/0006_profile_organization.sql", import.meta.url),
    "utf8"
  )
  const statusUnique = await readFile(
    new URL("../../drizzle/0007_profile_status_unique.sql", import.meta.url),
    "utf8"
  )
  await client.exec(baseline)
  await client.exec(profilesProxies)
  await client.exec(proxyProtocol)
  await client.exec(organization)
  await client.exec(statusUnique)
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
        protocol: "https",
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

    // serializeProxy must omit the password entirely, but surface protocol and
    // the (still empty) last test result.
    const serialized = serializeProxy(row) as Record<string, unknown>
    expect(serialized.password).toBeUndefined()
    expect(serialized.protocol).toBe("https")
    expect(serialized.last_test_result).toBeNull()
  })

  it("scopes list, delete, and update to the owner", async () => {
    const a = await seedUser("a@test.dev")
    const b = await seedUser("b@test.dev")
    const proxyA = await createUserProxy(
      a,
      { label: "A", type: "datacenter", protocol: "http", host: "a", port: 1 },
      testDb()
    )
    await createUserProxy(
      b,
      { label: "B", type: "datacenter", protocol: "socks5", host: "b", port: 2 },
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
        { label: "hax", type: "datacenter", protocol: "http", host: "x", port: 3 },
        testDb()
      )
    ).rejects.toThrow("Proxy not found")
  })

  it("keeps the existing password when an update omits it", async () => {
    const userId = await seedUser("keep-pw@test.dev")
    const created = await createUserProxy(
      userId,
      { label: "P", type: "mobile", protocol: "http", host: "h", port: 80, password: "orig" },
      testDb()
    )

    await updateUserProxy(
      userId,
      created.id,
      { label: "P renamed", type: "mobile", protocol: "http", host: "h", port: 80 },
      testDb()
    )

    const [row] = await database
      .select()
      .from(proxies)
      .where(eq(proxies.id, created.id))
    expect(row.label).toBe("P renamed")
    expect(decryptSecret(row.password)).toBe("orig")
  })

  it("bulk-imports host:port:user:pass lines, scoped and defaulted", async () => {
    const userId = await seedUser("bulk@test.dev")
    const other = await seedUser("bulk-other@test.dev")
    // A full line, a bare host:port, and a password that itself contains a colon.
    const { imported } = await createUserProxiesBulk(
      userId,
      "p1.example:8080:user:pass\n198.51.100.10:3128\np2.example:9000:u2:pa:ss\n",
      testDb()
    )
    expect(imported).toBe(3)

    const mine = await listUserProxies(userId, testDb())
    expect(mine.map((p) => p.host).sort()).toEqual([
      "198.51.100.10",
      "p1.example",
      "p2.example",
    ])
    // Defaults: residential + http; nothing leaks to another user.
    expect(mine.every((p) => p.protocol === "http")).toBe(true)
    expect(mine.every((p) => p.type === "residential")).toBe(true)
    expect(await listUserProxies(other, testDb())).toHaveLength(0)

    // A colon inside the password survives the round-trip.
    const withColonPw = mine.find((p) => p.host === "p2.example")
    expect(decryptSecret(withColonPw!.password)).toBe("pa:ss")
  })

  it("rejects a malformed bulk line without inserting anything", async () => {
    const userId = await seedUser("bulk-bad@test.dev")
    await expect(
      createUserProxiesBulk(userId, "good.example:8080\nnotaproxy\n", testDb())
    ).rejects.toThrow("Invalid line")
    // All-or-nothing: the valid line must not have been inserted either.
    expect(await listUserProxies(userId, testDb())).toHaveLength(0)
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
      { label: "B", type: "datacenter", protocol: "socks5", host: "b", port: 2 },
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

describe("fingerprints", () => {
  it("is deterministic for a seed and coherent with the OS + engine", () => {
    const a = generateFingerprint({ os: "macos", engine: "chromium", seed: 42 })
    const b = generateFingerprint({ os: "macos", engine: "chromium", seed: 42 })
    expect(a).toEqual(b) // same seed → byte-for-byte identical

    expect(a.platform).toBe("MacIntel")
    expect(a.userAgent).toContain("Macintosh")
    expect(a.userAgent).toContain("Chrome/")
    // navigator.deviceMemory is spec-capped at 8.
    expect(a.deviceMemory).toBeLessThanOrEqual(8)

    // A Firefox engine must report a Firefox UA, not Chrome.
    const ff = generateFingerprint({ os: "windows", engine: "camoufox", seed: 7 })
    expect(ff.userAgent).toContain("Firefox/")
    expect(ff.userAgent).not.toContain("Chrome/")
  })

  it("matches timezone and locale to the linked proxy's tested geo", async () => {
    const userId = await seedUser("fp-geo@test.dev")
    const proxy = await createUserProxy(
      userId,
      { label: "DE", type: "residential", protocol: "http", host: "h", port: 8080 },
      testDb()
    )
    // Simulate a completed proxy test: a German exit on a Berlin clock.
    await database
      .update(proxies)
      .set({
        country: "DE",
        lastTestResult: {
          ok: true,
          country: "DE",
          timezone: "Europe/Berlin",
          testedAt: now().toISOString(),
        },
      })
      .where(eq(proxies.id, proxy.id))

    const profile = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows", proxyId: proxy.id },
      testDb()
    )
    const fp = profile.fingerprint as { timezone: string; locale: string }
    expect(fp.timezone).toBe("Europe/Berlin")
    expect(fp.locale).toBe("de-DE")
  })

  it("regenerates by seed: a no-op edit is stable, an OS change rewrites it", async () => {
    const userId = await seedUser("fp-update@test.dev")
    const created = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    const seed = (created.fingerprint as { seed: number }).seed
    const ua1 = (created.fingerprint as { userAgent: string }).userAgent

    // Same seed/os/engine reproduces the same identity.
    const renamed = await updateUserProfile(
      userId,
      created.id,
      { name: "P2", engine: "camoufox", os: "windows", fingerprintSeed: seed },
      testDb()
    )
    expect((renamed.fingerprint as { userAgent: string }).userAgent).toBe(ua1)

    // Keeping the seed but switching OS rewrites the UA to stay coherent.
    const toMac = await updateUserProfile(
      userId,
      created.id,
      { name: "P2", engine: "camoufox", os: "macos", fingerprintSeed: seed },
      testDb()
    )
    const ua2 = (toMac.fingerprint as { userAgent: string }).userAgent
    expect(ua2).toContain("Macintosh")
    expect(ua2).not.toBe(ua1)
  })

  it("preview enforces proxy ownership", async () => {
    const a = await seedUser("fp-a@test.dev")
    const b = await seedUser("fp-b@test.dev")
    const proxyB = await createUserProxy(
      b,
      { label: "B", type: "datacenter", protocol: "http", host: "b", port: 2 },
      testDb()
    )
    await expect(
      previewProfileFingerprint(
        a,
        { os: "windows", engine: "camoufox", proxyId: proxyB.id },
        testDb()
      )
    ).rejects.toThrow("Proxy not found")
  })
})

describe("profile organization", () => {
  it("seeds default statuses on first list and colors new ones", async () => {
    const userId = await seedUser("org-status@test.dev")
    const seeded = await listUserStatuses(userId, testDb())
    expect(seeded.map((s) => s.name)).toEqual(["Ready", "Warming", "Banned"])
    // Idempotent — a second call doesn't re-seed.
    expect(await listUserStatuses(userId, testDb())).toHaveLength(3)

    const created = await createUserStatus(userId, "Verifying", testDb())
    expect(created.name).toBe("Verifying")
    expect(created.color.length).toBeGreaterThan(0)
  })

  it("rejects a duplicate status name (case-insensitive)", async () => {
    const userId = await seedUser("status-dup@test.dev")
    await listUserStatuses(userId, testDb()) // seeds Ready / Warming / Banned
    await expect(createUserStatus(userId, "ready", testDb())).rejects.toThrow(
      "already exists"
    )
  })

  it("bulk tag is idempotent — case-insensitive, no duplicates", async () => {
    const userId = await seedUser("bulk-dedup@test.dev")
    const p = await createUserProfile(
      userId,
      { name: "P", engine: "camoufox", os: "windows" },
      testDb()
    )
    await bulkAddProfileTag(userId, [p.id], "warming", testDb())
    await bulkAddProfileTag(userId, [p.id], "Warming", testDb()) // case variant
    const [row] = await listUserProfiles(userId, testDb())
    expect(row.tags).toEqual(["warming"])
  })

  it("scopes folders and blocks foreign references", async () => {
    const a = await seedUser("org-a@test.dev")
    const b = await seedUser("org-b@test.dev")
    const folderB = await createUserFolder(b, "B folder", testDb())

    // A can't attach B's folder on create…
    await expect(
      createUserProfile(
        a,
        { name: "P", engine: "camoufox", os: "windows", folderId: folderB.id },
        testDb()
      )
    ).rejects.toThrow("Folder not found")

    // …nor via a bulk move.
    const profileA = await createUserProfile(
      a,
      { name: "PA", engine: "camoufox", os: "windows" },
      testDb()
    )
    await expect(
      bulkMoveProfiles(a, [profileA.id], folderB.id, testDb())
    ).rejects.toThrow("Folder not found")

    expect(await listUserFolders(a, testDb())).toHaveLength(0)
  })

  it("bulk tags/moves owned profiles and skips foreign ids", async () => {
    const a = await seedUser("bulk-a2@test.dev")
    const b = await seedUser("bulk-b2@test.dev")
    const folder = await createUserFolder(a, "Group", testDb())
    const p1 = await createUserProfile(
      a,
      { name: "P1", engine: "camoufox", os: "windows" },
      testDb()
    )
    const p2 = await createUserProfile(
      a,
      { name: "P2", engine: "camoufox", os: "windows" },
      testDb()
    )
    const pb = await createUserProfile(
      b,
      { name: "PB", engine: "camoufox", os: "windows" },
      testDb()
    )

    // Foreign id (pb) is silently skipped — only a's two are tagged.
    const tagged = await bulkAddProfileTag(
      a,
      [p1.id, p2.id, pb.id],
      "warming",
      testDb()
    )
    expect(tagged.count).toBe(2)
    await bulkMoveProfiles(a, [p1.id, p2.id], folder.id, testDb())

    const mine = await listUserProfiles(a, testDb())
    expect(mine.every((p) => p.tags.includes("warming"))).toBe(true)
    expect(mine.every((p) => p.folderId === folder.id)).toBe(true)

    // B's profile is untouched.
    const [pbRow] = await listUserProfiles(b, testDb())
    expect(pbRow.tags).toEqual([])

    // Bulk delete removes only owned rows.
    const del = await bulkDeleteProfiles(a, [p1.id, p2.id, pb.id], testDb())
    expect(del.count).toBe(2)
    expect(await listUserProfiles(b, testDb())).toHaveLength(1)
  })

  it("duplicates config with a fresh fingerprint identity", async () => {
    const userId = await seedUser("dup@test.dev")
    const src = await createUserProfile(
      userId,
      { name: "Orig", engine: "camoufox", os: "windows", tags: ["x"] },
      testDb()
    )
    const copy = await duplicateUserProfile(userId, src.id, testDb())
    expect(copy.name).toBe("Orig copy")
    expect(copy.id).not.toBe(src.id)
    expect(copy.tags as string[]).toEqual(["x"])
    // A clone is a new identity — a different seed than its source.
    const srcSeed = (src.fingerprint as { seed: number }).seed
    const copySeed = (copy.fingerprint as { seed: number }).seed
    expect(copySeed).not.toBe(srcSeed)
  })
})
