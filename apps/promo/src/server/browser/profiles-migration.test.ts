import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import { insertUser } from "@/server/test-support"

import { promoBrowserSessions } from "./schema"
import { promoAccounts } from "@/server/social/schema"

/**
 * The migration that gives every existing account a browser profile.
 *
 * The one thing it must not do is sign anybody out. An account's cookies are in
 * a Docker volume named after the account, so the profile made for it has to
 * point at that exact volume, not a new one named after the profile.
 *
 * The database is built up to the file before, the old shape is written into
 * it by hand, and only then does the migration run, the way it will on a real
 * database that already holds an account.
 */

const MIGRATION = "0094_promo_browser_profiles.sql"
const folder = new URL("../../../drizzle/", import.meta.url)

describe("adopting the accounts that already exist", () => {
  let client: PGlite
  let db: CustomShellDb
  let userId: string

  beforeEach(async () => {
    client = new PGlite()
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    for (const file of files) {
      if (file >= MIGRATION) break
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }
    db = drizzle(client, { schema }) as unknown as CustomShellDb
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  /** This migration, then every later one, so the tables match today's code. */
  async function runMigration() {
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    for (const file of files.filter((one) => one >= MIGRATION)) {
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }
  }

  /** The account and its browsers, in the shape they had before profiles. */
  async function oldAccount(portOffset = 0) {
    const accountId = uuid()
    const proxyId = uuid()
    await client.query(
      `INSERT INTO promo_proxies (id, user_id, host, port) VALUES ($1, $2, 'proxy.example.test', 1080)`,
      [proxyId, userId]
    )
    await client.query(
      `INSERT INTO promo_accounts (id, user_id, platform, handle, proxy_id, fingerprint)
       VALUES ($1, $2, 'reddit', 'a_persona', $3, '{"os":"macos"}')`,
      [accountId, userId, proxyId]
    )
    const volume = `promo-profile-${accountId}`
    await client.query(
      `INSERT INTO promo_browser_sessions (id, user_id, account_id, status, volume_name, command_port, stream_port)
       VALUES ($1, $2, $3, 'stopped', $4, $6::int, $7::int),
              ($5, $2, $3, 'running', $4, $6::int + 1, $7::int + 1)`,
      [uuid(), userId, accountId, volume, uuid(), 7900 + portOffset, 8900 + portOffset]
    )
    return { accountId, proxyId, volume }
  }

  it("puts the existing account on a profile holding its old cookie volume", async () => {
    const { accountId, proxyId, volume } = await oldAccount()

    await runMigration()

    const profiles = await client.query<{
      id: string
      name: string
      proxy_id: string | null
      fingerprint: unknown
      volume_name: string
    }>(`SELECT id, name, proxy_id, fingerprint, volume_name FROM promo_profiles`)
    expect(profiles.rows).toHaveLength(1)
    const [profile] = profiles.rows

    // The exact volume the sign-in is in, never a new name.
    expect(profile.volume_name).toBe(volume)
    expect(profile.proxy_id).toBe(proxyId)
    expect(profile.fingerprint).toEqual({ os: "macos" })
    expect(profile.name).toBe("Main")

    const [account] = await db.select().from(promoAccounts)
    expect(account.id).toBe(accountId)
    expect(account.profileId).toBe(profile.id)

    // Every past and present browser was on that volume, so belongs to it.
    const sessions = await db.select().from(promoBrowserSessions)
    expect(sessions).toHaveLength(2)
    for (const session of sessions) expect(session.profileId).toBe(profile.id)
  })

  it("keeps the old columns and their values", async () => {
    const { accountId, proxyId } = await oldAccount()

    await runMigration()

    // Never rename or drop a stored field: they stay, and the code stops
    // reading them.
    const account = await client.query<{ proxy_id: string; fingerprint: unknown }>(
      `SELECT proxy_id, fingerprint FROM promo_accounts WHERE id = $1`,
      [accountId]
    )
    expect(account.rows[0]).toEqual({ proxy_id: proxyId, fingerprint: { os: "macos" } })

    const sessions = await client.query<{ account_id: string }>(
      `SELECT account_id FROM promo_browser_sessions`
    )
    for (const row of sessions.rows) expect(row.account_id).toBe(accountId)
  })

  it("lets a new browser row leave the account out", async () => {
    await oldAccount()
    await runMigration()
    const [account] = await db.select().from(promoAccounts)

    await db.update(promoBrowserSessions).set({ status: "stopped" })
    await db.insert(promoBrowserSessions).values({
      id: uuid(),
      userId,
      profileId: account.profileId!,
      status: "running",
      commandPort: 7902,
      streamPort: 8902,
    })

    // And the one-live-browser rule now sits on the profile.
    await expect(
      db.insert(promoBrowserSessions).values({
        id: uuid(),
        userId,
        profileId: account.profileId!,
        status: "starting",
        commandPort: 7903,
        streamPort: 8903,
      })
    ).rejects.toThrow()
  })

  it("makes one profile per account, each on its own volume", async () => {
    const first = await oldAccount()
    const second = await oldAccount(10)

    await runMigration()

    const profiles = await client.query<{ volume_name: string }>(
      `SELECT volume_name FROM promo_profiles ORDER BY volume_name`
    )
    expect(profiles.rows.map((row) => row.volume_name).sort()).toEqual(
      [first.volume, second.volume].sort()
    )
  })

  it("runs on a database with no accounts at all", async () => {
    await runMigration()

    const profiles = await client.query(`SELECT 1 FROM promo_profiles`)
    expect(profiles.rows).toHaveLength(0)
  })
})
