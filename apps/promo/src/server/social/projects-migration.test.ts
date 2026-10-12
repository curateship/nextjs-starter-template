import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import { insertUser } from "@/server/test-support"

/**
 * `drizzle/0108_promo_projects.sql` on a database that already has keywords
 * and an account, the way the live one does on the day it ships. Every
 * migration before it runs first, then the rows go in, then this one runs.
 */
describe("the projects migration", () => {
  let client: PGlite

  afterEach(async () => {
    await client.close()
  })

  it("makes a first project holding every keyword and the account, told the first voice's product", async () => {
    client = new PGlite()
    const folder = new URL("../../../drizzle/", import.meta.url)
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    const target = "0108_promo_projects.sql"
    for (const file of files.filter((name) => name < target)) {
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }

    await insertUser(drizzle(client, { schema }) as unknown as CustomShellDb, { id: "u1", role: "admin" })
    await client.exec(`
      INSERT INTO promo_voices (id, user_id, name, product) VALUES ('v1', 'u1', 'Main voice', 'We make invoices.');
      INSERT INTO promo_accounts (id, user_id, platform, voice_id) VALUES ('a1', 'u1', 'reddit', 'v1');
      INSERT INTO promo_keywords (id, user_id, term) VALUES ('k1', 'u1', 'invoice tool'), ('k2', 'u1', '');
    `)
    await client.exec(await readFile(new URL(target, folder), "utf8"))

    const projects = await client.query<{ id: string; name: string; description: string }>(
      "SELECT id, name, description FROM promo_projects"
    )
    expect(projects.rows).toHaveLength(1)
    expect(projects.rows[0]).toMatchObject({ name: "My project", description: "We make invoices." })
    const id = projects.rows[0].id

    const keywords = await client.query<{ project_id: string }>("SELECT project_id FROM promo_keywords")
    expect(keywords.rows.map((row) => row.project_id)).toEqual([id, id])
    const accounts = await client.query<{ project_id: string }>("SELECT project_id FROM promo_accounts")
    expect(accounts.rows.map((row) => row.project_id)).toEqual([id])

    // The voice's product text stays where it was; nothing reads it now.
    const voices = await client.query<{ product: string }>("SELECT product FROM promo_voices")
    expect(voices.rows[0].product).toBe("We make invoices.")
    // Every migration is replayed by hand, which outran the 5 second default
    // while the whole suite was running beside it.
  }, 30_000)
})
