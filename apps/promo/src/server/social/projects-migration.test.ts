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

  it("gives every older project Reddit and takes Reddit's four screens out of each saved left menu", async () => {
    client = new PGlite()
    const folder = new URL("../../../drizzle/", import.meta.url)
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    const target = "0118_promo_project_networks.sql"
    for (const file of files.filter((name) => name < target)) {
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }

    await insertUser(drizzle(client, { schema }) as unknown as CustomShellDb, { id: "u1", role: "admin" })
    const link = (href: string, label: string) => ({ id: `item-${label}`, href, label, visible: true })
    const menu = {
      sections: [
        {
          id: "s1",
          entries: [
            {
              ...link("/admin/projects", "Projects"),
              children: [
                link("/admin/today", "Today"),
                link("/admin/comments", "Comments"),
                link("/admin/voices", "Voices"),
                link("/admin/reddit-accounts", "Reddit accounts"),
                link("/admin/jobs", "Jobs"),
              ],
            },
            link("/admin/comments", "Comments again"),
            link("/admin/phones", "Phones"),
          ],
        },
      ],
    }
    await client.query(
      `INSERT INTO "workspaces" ("id", "name", "subdomain", "settings", "created_at", "updated_at") VALUES ('w1', 'Promo', 'promo', $1::jsonb, now(), now())`,
      [JSON.stringify(menu)]
    )
    await client.exec(`INSERT INTO promo_projects (id, user_id, name) VALUES ('p1', 'u1', 'Older project');`)
    await client.exec(await readFile(new URL(target, folder), "utf8"))

    const projects = await client.query<{ networks: string[] }>("SELECT networks FROM promo_projects")
    expect(projects.rows[0].networks).toEqual(["reddit"])

    const saved = await client.query<{ settings: typeof menu }>(`SELECT settings FROM "workspaces" WHERE id = 'w1'`)
    const entries = saved.rows[0].settings.sections[0].entries as Array<{ href: string; children?: Array<{ href: string }> }>
    // Voices stays under Projects; the other four go, wherever they sat.
    expect(entries.map((entry) => entry.href)).toEqual(["/admin/projects", "/admin/phones"])
    expect(entries[0].children?.map((child) => child.href)).toEqual(["/admin/voices"])
  }, 30_000)

  it("puts Accounts under Projects right after Voices, or last when Voices is not there, once", async () => {
    client = new PGlite()
    const folder = new URL("../../../drizzle/", import.meta.url)
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    const target = "0119_promo_accounts_menu.sql"
    for (const file of files.filter((name) => name < target)) {
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }
    const link = (href: string, label: string) => ({ id: `item-${label}`, href, label, visible: true })
    const menu = (children: ReturnType<typeof link>[]) => ({
      sections: [{ id: "s1", entries: [{ ...link("/admin/projects", "Projects"), children }, link("/admin/phones", "Phones")] }],
    })
    await client.query(
      `INSERT INTO "workspaces" ("id", "name", "subdomain", "settings", "created_at", "updated_at") VALUES
        ('w1', 'One', 'one', $1::jsonb, now(), now()),
        ('w2', 'Two', 'two', $2::jsonb, now(), now())`,
      [
        JSON.stringify(menu([link("/admin/voices", "Voices"), link("/admin/other", "Other")])),
        JSON.stringify(menu([link("/admin/other", "Other")])),
      ]
    )
    await client.exec(await readFile(new URL(target, folder), "utf8"))
    // Run twice: the second does nothing, since the link is already there.
    await client.exec(await readFile(new URL(target, folder), "utf8"))

    type Saved = { sections: Array<{ entries: Array<{ href: string; children?: Array<{ href: string }> }> }> }
    const saved = await client.query<{ id: string; settings: Saved }>(
      `SELECT id, settings FROM "workspaces" ORDER BY id`
    )
    const children = (row: { settings: Saved }) =>
      (row.settings.sections[0].entries[0].children ?? []).map((child) => child.href)
    expect(children(saved.rows[0])).toEqual(["/admin/voices", "/admin/accounts", "/admin/other"])
    expect(children(saved.rows[1])).toEqual(["/admin/other", "/admin/accounts"])
    expect(saved.rows[0].settings.sections[0].entries.map((entry) => entry.href)).toEqual(["/admin/projects", "/admin/phones"])
  }, 30_000)
})
