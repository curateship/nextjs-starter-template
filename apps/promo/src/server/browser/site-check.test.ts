import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import { promoProfiles } from "./schema"

vi.mock("./command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./command")>()
  return { ...actual, browserSiteCheck: vi.fn() }
})
vi.mock("./proxy-probe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./proxy-probe")>()
  return { ...actual, thisComputersAddress: vi.fn() }
})

const command = await import("./command")
const probe = await import("./proxy-probe")
const { createProfile } = await import("./profiles")
const { runSiteCheck } = await import("./site-check")

/**
 * The site check as the browser program runs it: the page's reading and the
 * reference read side by side, compared, and kept on the profile.
 */
describe("checking what a site sees", () => {
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

  it("keeps the result and the time on a profile with no proxy", async () => {
    const id = await createProfile(userId, { name: "Main" }, db)
    vi.mocked(command.browserSiteCheck).mockResolvedValue({
      address: "203.0.113.50",
      country: "GB",
      addressTimezone: "Europe/London",
      webrtc: { available: true, addresses: ["192.168.1.4"] },
      identity: {
        userAgent: "Firefox/156.0",
        platform: "Win32",
        oscpu: "",
        hardwareConcurrency: 8,
        screen: { width: 1536, height: 960, colorDepth: 24 },
        devicePixelRatio: 1,
        gpuVendor: "",
        gpuRenderer: "",
        fonts: [],
        timezone: "UTC",
        languages: ["en-US"],
      },
    })
    vi.mocked(probe.thisComputersAddress).mockResolvedValue({
      ip: "203.0.113.50",
      country: "GB",
      timezone: "Europe/London",
    })

    await runSiteCheck(userId, id, { port: 1, token: "t" }, db)

    const [profile] = await db.select().from(promoProfiles)
    expect(profile.siteCheckedAt).toBeInstanceOf(Date)
    expect(profile.siteCheck?.proxy).toBeNull()
    expect(profile.siteCheck?.lines[0].text).toBe(
      "Sites see this computer's own address, 203.0.113.50. The profile has no proxy."
    )
    // The clock and language are judged against this computer's own country.
    expect(profile.siteCheck?.lines.find((line) => line.label === "Clock")?.verdict).toBe("differs")
    // The reading also refreshes what the dashboard shows of the identity.
    expect(profile.fingerprint?.seen?.screen.width).toBe(1536)
  })

  it("keeps a new-identity request made while the check ran", async () => {
    const id = await createProfile(userId, { name: "Main" }, db)
    await db.update(promoProfiles).set({ fingerprint: { id: "machine-1", renew: true } })

    await runSiteCheck(userId, id, { port: 1, token: "t" }, db)

    const [profile] = await db.select().from(promoProfiles)
    expect(profile.fingerprint).toMatchObject({ id: "machine-1", renew: true })
    expect(profile.fingerprint?.seen?.screen.width).toBe(1536)
  })

  it("refuses another person's profile", async () => {
    const other = (await insertUser(db, { role: "admin" })).id
    const id = await createProfile(other, { name: "Theirs" }, db)

    await expect(runSiteCheck(userId, id, { port: 1, token: "t" }, db)).rejects.toThrow("does not exist")
  })
})
