import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import { insertUser } from "@/server/test-support"

/**
 * `drizzle/0160_promo_old_addresses.sql` on bell notices that still open an
 * old address. Every migration before it runs first, then the notices go in,
 * then this one runs.
 */
describe("the old addresses migration", () => {
  let client: PGlite

  afterEach(async () => {
    await client.close()
  })

  it("points every notice holding an old address at its new place, keeping what it opens", async () => {
    client = new PGlite()
    const folder = new URL("../../../drizzle/", import.meta.url)
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    const target = "0160_promo_old_addresses.sql"
    for (const file of files.filter((name) => name < target)) {
      await client.exec(await readFile(new URL(file, folder), "utf8"))
    }

    await insertUser(drizzle(client, { schema }) as unknown as CustomShellDb, { id: "u1", role: "admin" })
    const before: Record<string, string> = {
      n1: "/admin/phones?open=ph1",
      n2: "/admin/racks/r1",
      n3: "/admin/racks/r2?tab=wall",
      n4: "/admin/racks?loose=1",
      n5: "/admin/racks",
      n6: "/admin/profiles",
      n7: "/admin/proxies?open=x1",
      n8: "/admin/bans?open=b1&app=reddit",
      n9: "/admin/voices?open=v1",
      n10: "/admin/accounts?platform=x&open=a1",
      n11: "/admin/reddit-accounts",
      n12: "/admin/messages?open=m1",
      n13: "/admin/today",
      n14: "/admin/jobs",
      n15: "/admin/reddit",
      n17: "/admin/archive?project=p1&open=i1",
      // Still a page of its own, so left alone.
      n16: "/admin/comments?replies=c1",
      n18: "/admin/anti-detect?section=bans",
      n19: "/admin/phonesx",
    }
    for (const [id, href] of Object.entries(before)) {
      await client.query("INSERT INTO promo_notices (id, user_id, kind, href) VALUES ($1, 'u1', 'reply', $2)", [id, href])
    }
    await client.exec(await readFile(new URL(target, folder), "utf8"))

    const rows = await client.query<{ id: string; href: string }>("SELECT id, href FROM promo_notices")
    const after = Object.fromEntries(rows.rows.map((row) => [row.id, row.href]))
    expect(after).toEqual({
      n1: "/admin/anti-detect?section=phones&open=ph1",
      n2: "/admin/anti-detect?section=phones&rack=r1",
      n3: "/admin/anti-detect?section=phones&rack=r2",
      n4: "/admin/anti-detect?section=phones&rack=none",
      n5: "/admin/anti-detect?section=phones",
      n6: "/admin/anti-detect?section=profiles",
      n7: "/admin/anti-detect?section=proxies&open=x1",
      n8: "/admin/anti-detect?section=bans&open=b1&app=reddit",
      n9: "/admin/projects?section=voices&open=v1",
      n10: "/admin/projects?section=accounts&platform=x&open=a1",
      n11: "/admin/projects?section=accounts&platform=reddit",
      n12: "/admin/projects?section=messages&open=m1",
      n13: "/admin/projects",
      n14: "/admin/projects",
      n15: "/admin/projects",
      n16: "/admin/comments?replies=c1",
      n17: "/admin/projects?section=archive&project=p1&open=i1",
      n18: "/admin/anti-detect?section=bans",
      n19: "/admin/phonesx",
    })
    // Every migration is replayed by hand, which outruns the 5 second default.
  }, 60_000)
})
