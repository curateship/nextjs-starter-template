import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  customShellKnownDevices,
  customShellSessions,
  customShellSystemEmailSends,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import {
  alertEmailChanged,
  alertPasswordChanged,
  startSessionWithAlert,
} from "@/server/auth/security-alerts"

/**
 * The alerts that tell somebody their account was touched.
 *
 * Nothing here checks that an email arrived — no mail server is configured in a
 * test, and `sendAuthEmail` deliberately falls back to logging. What it checks
 * is the row `system_email_sends` writes either way, which records what the app
 * decided to send and to whom. That is the decision worth pinning down; the
 * delivery is Resend's problem.
 */
describe("security alerts", () => {
  let client: PGlite
  let database: TestDatabase

  beforeEach(async () => {
    ;({ client, db: database } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  const CHROME_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
  const FIREFOX_WINDOWS =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"

  const live = () => database as unknown as CustomShellDb

  async function alertsSent() {
    return database
      .select({
        kind: customShellSystemEmailSends.kind,
        toEmail: customShellSystemEmailSends.toEmail,
      })
      .from(customShellSystemEmailSends)
  }

  it("says nothing about the first device, and warns about the second", async () => {
    const user = await insertUser(live(), { email: "owner@internal.dev" })

    await startSessionWithAlert(user, { userAgent: CHROME_MAC, ipAddress: null }, live())

    // Nothing to compare against, and telling somebody about the browser they
    // are looking at is noise.
    expect(await alertsSent()).toHaveLength(0)
    expect(await database.select().from(customShellKnownDevices)).toHaveLength(1)

    await startSessionWithAlert(
      user,
      { userAgent: FIREFOX_WINDOWS, ipAddress: null },
      live()
    )

    expect(await alertsSent()).toEqual([
      { kind: "new-device", toEmail: "owner@internal.dev" },
    ])
  })

  it("sends one alert per device, not one per sign-in", async () => {
    const user = await insertUser(live(), { email: "owner@internal.dev" })
    const chrome = { userAgent: CHROME_MAC, ipAddress: null }
    const firefox = { userAgent: FIREFOX_WINDOWS, ipAddress: null }

    await startSessionWithAlert(user, chrome, live())
    await startSessionWithAlert(user, firefox, live())
    // Signing out and back in on both, three times over. This is the case the
    // whole `known_devices` table exists for: sessions are deleted on sign-out,
    // so without it every one of these would look brand new.
    for (let round = 0; round < 3; round += 1) {
      await database.delete(customShellSessions)
      await startSessionWithAlert(user, chrome, live())
      await startSessionWithAlert(user, firefox, live())
    }

    expect(await alertsSent()).toHaveLength(1)
    expect(await database.select().from(customShellKnownDevices)).toHaveLength(2)
  })

  it("keeps each account's devices to itself", async () => {
    const one = await insertUser(live(), { email: "one@internal.dev" })
    const two = await insertUser(live(), { email: "two@internal.dev" })
    const chrome = { userAgent: CHROME_MAC, ipAddress: null }

    await startSessionWithAlert(one, chrome, live())
    // The same browser, a different account. It has never signed in to this
    // one, but it is still that account's first device, so it stays quiet.
    await startSessionWithAlert(two, chrome, live())

    expect(await alertsSent()).toHaveLength(0)
    expect(await database.select().from(customShellKnownDevices)).toHaveLength(2)
  })

  it("moves the device's last-seen date without alerting again", async () => {
    const user = await insertUser(live(), { email: "owner@internal.dev" })
    const chrome = { userAgent: CHROME_MAC, ipAddress: null }

    await startSessionWithAlert(user, chrome, live())
    const [first] = await database.select().from(customShellKnownDevices)
    await database
      .update(customShellKnownDevices)
      .set({ lastSeenAt: new Date(2020, 0, 1) })
      .where(eq(customShellKnownDevices.id, first.id))

    await startSessionWithAlert(user, chrome, live())

    const [again] = await database.select().from(customShellKnownDevices)
    expect(again.lastSeenAt.getFullYear()).toBeGreaterThan(2020)
    expect(again.firstSeenAt).toEqual(first.firstSeenAt)
    expect(await alertsSent()).toHaveLength(0)
  })

  it("sends one alert when the same new device signs in twice at once", async () => {
    const user = await insertUser(live(), { email: "owner@internal.dev" })
    await startSessionWithAlert(
      user,
      { userAgent: CHROME_MAC, ipAddress: null },
      live()
    )

    // Two tabs, one new laptop, same instant. Both look, both find nothing,
    // and a check done before the insert would let both of them send.
    const firefox = { userAgent: FIREFOX_WINDOWS, ipAddress: null }
    await Promise.all([
      startSessionWithAlert(user, firefox, live()),
      startSessionWithAlert(user, firefox, live()),
    ])

    expect(await alertsSent()).toEqual([
      { kind: "new-device", toEmail: "owner@internal.dev" },
    ])
    expect(await database.select().from(customShellKnownDevices)).toHaveLength(2)
  })

  it("tells the address an account left where it went", async () => {
    await alertEmailChanged(
      "old@internal.dev",
      "new@internal.dev",
      "Owner Example"
    )

    const [sent] = await database.select().from(customShellSystemEmailSends)
    expect(sent.kind).toBe("email-change-done")
    // The address that just lost the account, not the one that gained it.
    expect(sent.toEmail).toBe("old@internal.dev")
  })

  it("confirms a password change to the account's own address", async () => {
    await alertPasswordChanged(
      "owner@internal.dev",
      {
        userAgent: CHROME_MAC,
        ipAddress: null,
      },
      "Owner Example"
    )

    const [sent] = await database.select().from(customShellSystemEmailSends)
    expect(sent.kind).toBe("password-changed")
    expect(sent.toEmail).toBe("owner@internal.dev")
  })

  it("still signs somebody in when there is no browser line at all", async () => {
    const user = await insertUser(live(), { email: "owner@internal.dev" })

    const token = await startSessionWithAlert(
      user,
      { userAgent: null, ipAddress: null },
      live()
    )

    expect(token).toBeTruthy()
    const [device] = await database.select().from(customShellKnownDevices)
    expect(device.label).toBe("Unknown device")
  })
})

/**
 * Every way into the app has to go through `startSessionWithAlert`.
 *
 * A new sign-in path that calls `createUserSession` directly would work
 * perfectly and quietly send no alert — the kind of gap nobody finds until it
 * matters. This is the same trick `guards.test.ts` plays with the door checks:
 * the only way to skip it is to write your name in the list below.
 */
describe("no sign-in path skips the alert", () => {
  const SOURCE_DIRS = ["src/server", "src/lib/api"]

  /** The one file allowed to start a session directly, because it is the one that alerts. */
  const ALLOWED = [
    "src/server/auth/security.ts",
    "src/server/auth/security-alerts.ts",
  ]

  function sourceFiles(dir: string): string[] {
    const full = join(process.cwd(), dir)
    return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) return sourceFiles(path)
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
        return []
      }
      return [path]
    })
  }

  it("never calls createUserSession outside the alerting path", () => {
    const offenders = SOURCE_DIRS.flatMap(sourceFiles)
      .filter((path) => !ALLOWED.includes(path))
      .filter((path) =>
        readFileSync(join(process.cwd(), path), "utf8").includes(
          "createUserSession("
        )
      )

    expect(offenders).toEqual([])
  })
})
