import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import {
  assertSecureDockerConnection,
  dockerConnection,
} from "@/server/browser/docker"

import { saveAccount } from "./accounts"
import { cleanSubreddit, cleanSubreddits } from "./keywords"
import { promoProxies } from "./schema"
import { assertPublicProxyHost } from "./proxies"

/**
 * The three checks that stop something bad rather than making something work.
 *
 * Each is used only inside its own module, so it would be easy to leave
 * untested. Each is also the kind of thing that fails quietly: a subreddit name
 * that silently becomes nonsense, a proxy address pointing back inside the
 * network, a Docker daemon reachable over plain HTTP.
 */

describe("cleaning a pasted subreddit name", () => {
  it("takes the name out of every way people write it", () => {
    expect(cleanSubreddit("productivity")).toBe("productivity")
    expect(cleanSubreddit("r/productivity")).toBe("productivity")
    expect(cleanSubreddit("/r/productivity")).toBe("productivity")
    expect(cleanSubreddit("  R/Productivity  ")).toBe("Productivity")
    expect(cleanSubreddit("https://www.reddit.com/r/productivity")).toBe(
      "productivity"
    )
    expect(cleanSubreddit("https://reddit.com/r/productivity/new/")).toBe(
      "productivity"
    )
  })

  it("drops anything that is not part of a name", () => {
    // A name Reddit would refuse has to not reach a search as nonsense.
    expect(cleanSubreddit("pro ductivity!")).toBe("productivity")
    expect(cleanSubreddit("")).toBe("")
    expect(cleanSubreddit("r/")).toBe("")
    expect(cleanSubreddit("///")).toBe("")
  })

  it("keeps a long name inside Reddit's own limit", () => {
    expect(cleanSubreddit("a".repeat(200))).toHaveLength(60)
  })

  it("removes repeats and empties from a pasted list", () => {
    expect(
      cleanSubreddits(["r/SaaS", "saas", "SaaS", "", "   ", "/r/founder"])
    ).toEqual(["SaaS", "saas", "founder"])
  })

  it("stops at ten subreddits", () => {
    const many = Array.from({ length: 30 }, (_, i) => `sub${i}`)
    expect(cleanSubreddits(many)).toHaveLength(10)
  })
})

describe("refusing a proxy that points back inside the network", () => {
  it("refuses this machine", async () => {
    // Without this a proxy row is a way to make the server fetch its own
    // neighbours, and 169.254.169.254 reaches a cloud metadata service.
    await expect(assertPublicProxyHost("127.0.0.1")).rejects.toThrow(
      "public address"
    )
    await expect(assertPublicProxyHost("::1")).rejects.toThrow("public address")
  })

  it("refuses every private range", async () => {
    for (const host of [
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "198.18.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "fd00::1",
      "fe80::1",
    ]) {
      await expect(assertPublicProxyHost(host)).rejects.toThrow("public address")
    }
  })

  it("refuses a private address written as an IPv6-mapped one", async () => {
    await expect(assertPublicProxyHost("::ffff:127.0.0.1")).rejects.toThrow(
      "public address"
    )
  })

  it("allows an ordinary public address", async () => {
    await expect(assertPublicProxyHost("8.8.8.8")).resolves.toBeUndefined()
  })
})

describe("refusing an unsafe Docker host", () => {
  it("allows plain HTTP only to this machine", () => {
    // Plain HTTP to a Docker daemon is a way to run anything on that machine as
    // root, so it is only ever allowed locally.
    expect(() =>
      assertSecureDockerConnection({
        type: "http",
        protocol: "http:",
        hostname: "127.0.0.1",
      })
    ).not.toThrow()
    expect(() =>
      assertSecureDockerConnection({
        type: "http",
        protocol: "http:",
        hostname: "localhost",
      })
    ).not.toThrow()
  })

  it("refuses plain HTTP to anywhere else", () => {
    expect(() =>
      assertSecureDockerConnection({
        type: "http",
        protocol: "http:",
        hostname: "10.0.0.5",
      })
    ).toThrow("https")
  })

  it("allows HTTPS anywhere", () => {
    expect(() =>
      assertSecureDockerConnection({
        type: "http",
        protocol: "https:",
        hostname: "docker.example.com",
      })
    ).not.toThrow()
  })

  it("defaults to this machine's own socket", () => {
    expect(dockerConnection({})).toEqual({
      type: "socket",
      socketPath: "/var/run/docker.sock",
    })
  })

  it("refuses a Docker host that is neither http nor https", () => {
    expect(() => dockerConnection({ PROMO_DOCKER_HOST: "ssh://box" })).toThrow(
      "http or https"
    )
  })

  it("refuses a remote Docker host named without https", () => {
    expect(() =>
      dockerConnection({ PROMO_DOCKER_HOST: "http://10.0.0.5:2375" })
    ).toThrow("https")
  })
})

describe("saving a proxy", () => {
  // The database goes up in a hook, not inside the test. Replaying every
  // migration takes longer than the 5 second test timeout under load, and
  // `vitest.config.ts` raises the HOOK timeout to 60 seconds for exactly this.
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  const proxy = {
    label: "",
    protocol: "http" as const,
    host: "169.254.169.254",
    port: 8080,
    username: "",
  }

  it("refuses a host that points back inside the network", async () => {
    // The hole this closes: the guard used to run only when Test was pressed,
    // so a proxy saved and never tested was handed to the browser container
    // unchecked.
    await expect(
      saveAccount(
        userId,
        { voice: "", product: "", commentRules: "", proxy },
        db
      )
    ).rejects.toThrow("public address")
  })

  it("stores nothing when the host is refused", async () => {
    await saveAccount(
      userId,
      { voice: "A voice.", product: "", commentRules: "", proxy: null },
      db
    ).catch(() => {})

    await expect(
      saveAccount(
        userId,
        { voice: "A voice.", product: "", commentRules: "", proxy },
        db
      )
    ).rejects.toThrow("public address")

    // The refusal comes before the write, so no half-saved proxy is left behind.
    expect(await db.select().from(promoProxies)).toHaveLength(0)
  })

  it("saves an ordinary public host", async () => {
    const saved = await saveAccount(
      userId,
      {
        voice: "",
        product: "",
        commentRules: "",
        proxy: { ...proxy, host: "8.8.8.8", label: "A line" },
      },
      db
    )
    expect(saved.proxy?.host).toBe("8.8.8.8")
    // The password is stored encrypted and never handed back.
    expect(saved.proxy).not.toHaveProperty("password")
  })
})
