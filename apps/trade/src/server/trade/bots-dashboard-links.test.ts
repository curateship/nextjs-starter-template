import { readFile } from "node:fs/promises"

import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"
import { writeTradeNotice } from "@/server/trade/notices"
import { tradeNoticeLinks } from "@/server/trade/schema"

/**
 * Migration 0242 (the Bots dashboard, 9 Nov 2026) on menus shaped like the
 * ones sites really saved. The test database has already run it once on no
 * data, so each test writes a menu and runs the file again.
 */

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function runMigration() {
  await client.exec(await readFile(new URL("../../../drizzle/0242_trade_bots_dashboard_links.sql", import.meta.url), "utf8"))
}

const item = (id: string, href: string, label: string, children?: unknown[]) => ({
  id,
  href,
  label,
  icon: "workflow",
  type: "item",
  roles: ["admin"],
  visible: true,
  ...(children ? { children } : {}),
})

async function menuAfter(sections: unknown[]) {
  const site = await insertWorkspace(database, { settings: { sections } })
  await runMigration()
  const [row] = await database
    .select({ settings: customShellWorkspaces.settings })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, site.id))
  const saved = row.settings as { sections: { entries: { href: string; label: string; children?: { href: string }[] }[] }[] }
  return saved.sections.map((section) => section.entries.map((entry) => [entry.href, entry.label, (entry.children ?? []).map((child) => child.href)]))
}

describe("the Bots dashboard's menu links", () => {
  it("turns a site's old links into one Bots link where the first top-level one was", async () => {
    // The shape Nodabot's menu had on 9 Nov 2026.
    const after = await menuAfter([
      {
        id: "section-navigation",
        title: "Navigation",
        entries: [
          item("trade", "/trade", "Trade", [item("a", "/admin/recipes", "Automations")]),
          item("markets", "/admin/markets", "Markets"),
          item("bot", "/flow-runs", "Bot"),
          item("automation", "/admin/Recipes", "Automation", [item("b", "/backtests", "Backtests result")]),
        ],
      },
      { id: "section-platform", title: "Platform", entries: [item("crm", "/admin/crm", "CRM")] },
    ])
    expect(after).toEqual([
      [
        ["/trade", "Trade", []],
        ["/admin/markets", "Markets", []],
        ["/bots", "Bots", []],
      ],
      [["/admin/crm", "CRM", []]],
    ])
  })

  it("keeps what was nested under a removed link, in its place", async () => {
    const after = await menuAfter([
      {
        id: "s",
        title: "Navigation",
        entries: [
          item("bot", "/flow-runs", "Bot"),
          item("automation", "/admin/recipes", "Automation", [item("pages", "/admin/pages", "Pages")]),
        ],
      },
    ])
    expect(after).toEqual([
      [
        ["/bots", "Bots", []],
        ["/admin/pages", "Pages", []],
      ],
    ])
  })

  it("puts Bots after Trade when every old link was nested", async () => {
    const after = await menuAfter([
      {
        id: "s",
        title: "Navigation",
        entries: [item("trade", "/trade", "Trade", [item("a", "/backtests/abc", "A run")]), item("crm", "/admin/crm", "CRM")],
      },
    ])
    expect(after).toEqual([
      [
        ["/trade", "Trade", []],
        ["/bots", "Bots", []],
        ["/admin/crm", "CRM", []],
      ],
    ])
  })

  it("leaves a menu with no old link exactly as it was", async () => {
    const sections = [{ id: "s", title: "Navigation", entries: [item("trade", "/trade", "Trade"), item("bots-ish", "/backtesting", "Not ours")] }]
    const site = await insertWorkspace(database, { settings: { sections } })
    await runMigration()
    const [row] = await database
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, site.id))
    expect((row.settings as { sections: unknown }).sections).toEqual(sections)
  })
})

describe("the Bots dashboard's notice links", () => {
  it("sends a saved bot notice to that bot on the Bots dashboard, and leaves other notices alone", async () => {
    const user = await insertUser(database)
    for (const href of ["/flow-runs/run-7", "/trade?market=x"]) {
      await writeTradeNotice({ userId: user.id, title: "Flow stopped", body: "Words.", level: "info", href, database })
    }
    await runMigration()
    const links = await database.select({ href: tradeNoticeLinks.href }).from(tradeNoticeLinks)
    expect(links.map((link) => link.href).sort()).toEqual(["/bots?view=bots&open=run-7&full=1", "/trade?market=x"])
  })
})
