import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProxyTestResult } from "@/lib/social/options"
import { uuid } from "@/server/auth/security"
import { customShellNotifications } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import { promoProfiles, promoProxies, promoProxyAddresses } from "./schema"

vi.mock("./proxy-probe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./proxy-probe")>()
  return {
    ...actual,
    // A host named "*.example.test" is treated as public, so a proxy can be
    // saved without the test touching DNS; everything else keeps the real check.
    assertPublicProxyHost: vi.fn(async (host: string) => {
      if (host.endsWith(".example.test")) return
      return actual.assertPublicProxyHost(host)
    }),
    testProxyConnection: vi.fn(),
  }
})

const probe = await import("./proxy-probe")
const probeTest = vi.mocked(probe.testProxyConnection)
const {
  createProxy,
  deadProxyMessage,
  deleteProxies,
  importProxies,
  listProxies,
  parseProxyLine,
  proxyBecameDead,
  sweepProxyHealth,
  testProxy,
} = await import("./proxies")

const works = (ip = "203.0.113.5", country = "US"): ProxyTestResult => ({
  ok: true,
  ip,
  country,
  latencyMs: 300,
})
const fails: ProxyTestResult = { ok: false, error: "The proxy did not answer in time." }

describe("the Proxies dashboard's records", () => {
  // Proxy passwords are stored encrypted, which needs a key.
  beforeAll(() => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    probeTest.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  const line = (host: string) => ({
    label: "",
    kind: "residential" as const,
    protocol: "http" as const,
    host,
    port: 8080,
    username: "",
  })

  async function row(id: string) {
    const [found] = await db.select().from(promoProxies).where(eq(promoProxies.id, id))
    return found
  }

  describe("pasting in a list", () => {
    it("saves the good lines and names each bad one by its line number", async () => {
      const result = await importProxies(
        userId,
        [
          "one.example.test:8080",
          "two.example.test:3128:user:pass:with:colons",
          "",
          "three.example.test",
          "socks5://me:secret@four.example.test:1080",
          "127.0.0.1:8080",
          "five.example.test:99999",
        ].join("\n"),
        db
      )

      expect(result.added).toBe(3)
      expect(result.problems).toEqual([
        { line: 4, reason: "no port" },
        { line: 6, reason: "points inside the network" },
        { line: 7, reason: "the port is not between 1 and 65535" },
      ])

      const stored = await db.select().from(promoProxies)
      expect(stored.map((proxy) => proxy.host).sort()).toEqual([
        "four.example.test",
        "one.example.test",
        "two.example.test",
      ])
      // They arrive as residential, named after their host.
      expect(stored.every((proxy) => proxy.kind === "residential")).toBe(true)
      expect(stored.find((proxy) => proxy.host === "four.example.test")?.protocol).toBe("socks5")
    })

    it("keeps a colon inside a password", () => {
      expect(parseProxyLine("host.example.test:8080:me:a:b:c")).toMatchObject({
        username: "me",
        password: "a:b:c",
      })
    })

    it("refuses an empty paste outright", async () => {
      await expect(importProxies(userId, "\n  \n", db)).rejects.toThrow("no proxies")
    })
  })

  describe("the dead-proxy notice", () => {
    it("rings once when a proxy dies, not on every failing test after", async () => {
      const id = await createProxy(userId, line("gate.example.test"), db)

      probeTest.mockResolvedValue(works())
      await testProxy(userId, id, db)
      probeTest.mockResolvedValue(fails)
      await testProxy(userId, id, db)
      await testProxy(userId, id, db)
      await testProxy(userId, id, db)

      const notices = await db.select().from(customShellNotifications)
      expect(notices).toHaveLength(1)
      expect(notices[0].id).toBe(id)
      expect(notices[0].message).toBe("The proxy gate.example.test stopped working")
    })

    it("rings again, as the same notice brought back unread, after a recovery", async () => {
      const id = await createProxy(userId, line("gate.example.test"), db)
      probeTest.mockResolvedValue(fails)
      await testProxy(userId, id, db)
      await db.update(customShellNotifications).set({ readAt: new Date() })

      probeTest.mockResolvedValue(works())
      await testProxy(userId, id, db)
      probeTest.mockResolvedValue(fails)
      await testProxy(userId, id, db)

      const notices = await db.select().from(customShellNotifications)
      expect(notices).toHaveLength(1)
      expect(notices[0].readAt).toBeNull()
    })

    it("counts an untested proxy failing as a death", () => {
      expect(proxyBecameDead(null, fails)).toBe(true)
      expect(proxyBecameDead(fails, fails)).toBe(false)
      expect(proxyBecameDead(works(), works())).toBe(false)
    })
  })

  describe("the record of a proxy's outside address", () => {
    it("adds a row only when the address changes", async () => {
      const id = await createProxy(userId, line("gate.example.test"), db)

      probeTest.mockResolvedValue(works("203.0.113.5"))
      await testProxy(userId, id, db)
      await testProxy(userId, id, db)
      expect(await db.select().from(promoProxyAddresses)).toHaveLength(1)

      probeTest.mockResolvedValue(works("203.0.113.6"))
      await testProxy(userId, id, db)
      expect(await db.select().from(promoProxyAddresses)).toHaveLength(2)

      const [listed] = await listProxies(userId, db)
      expect(listed.addresses.total).toBe(2)
      // The first sighting is not a change, so two rows today is one change.
      expect(listed.addresses.changesToday).toBe(1)
    })

    it("keeps no more than 200 rows for one proxy", async () => {
      const id = await createProxy(userId, line("gate.example.test"), db)
      const old = Date.now() - 10 * 24 * 60 * 60_000
      await db.insert(promoProxyAddresses).values(
        Array.from({ length: 205 }, (_, index) => ({
          id: uuid(),
          proxyId: id,
          ip: `198.51.100.${index % 250}`,
          seenAt: new Date(old + index * 60_000),
        }))
      )

      probeTest.mockResolvedValue(works("203.0.113.99"))
      await testProxy(userId, id, db)

      const rows = await db.select().from(promoProxyAddresses)
      expect(rows).toHaveLength(200)
      expect(rows.some((one) => one.ip === "203.0.113.99")).toBe(true)
    })
  })

  describe("the regular re-test", () => {
    it("reaches ten never-tested proxies within four passes, untested first", async () => {
      for (let index = 0; index < 10; index += 1) {
        await createProxy(userId, line(`p${index}.example.test`), db)
      }
      probeTest.mockResolvedValue(works())

      for (let pass = 0; pass < 4; pass += 1) await sweepProxyHealth(db)

      const tested = await db.select().from(promoProxies)
      expect(tested.filter((proxy) => proxy.lastTestedAt)).toHaveLength(10)
      expect(probeTest).toHaveBeenCalledTimes(10)
    })

    it("tests a pass's proxies side by side, so dead ones cost one wait, not three", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createProxy(userId, line(`p${index}.example.test`), db)
      }
      let running = 0
      let most = 0
      probeTest.mockImplementation(async () => {
        running += 1
        most = Math.max(most, running)
        await new Promise((resolve) => setTimeout(resolve, 20))
        running -= 1
        return fails
      })

      await sweepProxyHealth(db)

      expect(most).toBe(3)
    })

    it("leaves a proxy tested in the last ten minutes alone", async () => {
      const id = await createProxy(userId, line("gate.example.test"), db)
      await db.update(promoProxies).set({ lastTestedAt: new Date() }).where(eq(promoProxies.id, id))

      expect(await sweepProxyHealth(db)).toBe(0)
    })
  })

  describe("deleting", () => {
    it("keeps the profiles that used it, on no proxy", async () => {
      const id = await createProxy(userId, line("gate.example.test"), db)
      await db.insert(promoProfiles).values({ id: "p1", userId, name: "Main", proxyId: id, volumeName: "v1" })

      expect((await listProxies(userId, db))[0].usedBy).toEqual([{ id: "p1", name: "Main" }])
      await deleteProxies(userId, [id], db)

      const [profile] = await db.select().from(promoProfiles)
      expect(profile.proxyId).toBeNull()
    })

    it("never deletes another person's proxy", async () => {
      const other = (await insertUser(db, { role: "admin" })).id
      const id = await createProxy(other, line("gate.example.test"), db)

      expect(await deleteProxies(userId, [id], db)).toEqual({ deleted: [] })
      expect(await row(id)).toBeDefined()
    })
  })

  describe("refusing a dead proxy", () => {
    it("names the proxy and when its test failed", () => {
      const message = deadProxyMessage({
        label: "US-residential-3",
        host: "gate.example.test",
        lastTestedAt: new Date(2099, 5, 10, 14, 2),
        lastTestResult: fails,
      })
      expect(message).toBe(
        "The proxy US-residential-3 failed its last test at 14:02. Test it on the Proxies dashboard."
      )
    })

    it("lets a working or untested proxy through", () => {
      const base = { label: "x", host: "h", lastTestedAt: null }
      expect(deadProxyMessage({ ...base, lastTestResult: null })).toBeNull()
      expect(deadProxyMessage({ ...base, lastTestResult: works() })).toBeNull()
    })
  })
})
