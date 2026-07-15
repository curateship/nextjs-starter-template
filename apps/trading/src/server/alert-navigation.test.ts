import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, describe, expect, it } from "vitest"

let client: PGlite | null = null

afterEach(async () => {
  await client?.close()
  client = null
})

describe("alert navigation migration", () => {
  it("adds alert links while preserving Market Scanner and custom navigation", async () => {
    client = new PGlite()
    await client.exec(
      await readFile(
        new URL(
          "../../drizzle/0000_custom_shell_baseline.sql",
          import.meta.url
        ),
        "utf8"
      )
    )
    await client.exec(
      await readFile(
        new URL(
          "../../drizzle/0003_custom_shell_workspaces.sql",
          import.meta.url
        ),
        "utf8"
      )
    )
    await client.exec(`
      insert into users (id, email, name, role, password_hash, created_at, updated_at)
      values ('user-1', 'trader@example.test', 'Trader', 'user', 'hash', now(), now());
      insert into workspaces (id, user_id, name, settings, is_default, created_at, updated_at)
      values (
        'workspace-1',
        'user-1',
        'Trading',
        '{"sections":[{"id":"main","title":"Main","entries":[{"type":"item","id":"custom","label":"Custom","href":"/custom"},{"type":"item","id":"item-trade","label":"Trade","href":"/trade","children":[{"id":"indicators","label":"Indicators","href":"/indicators"}]},{"type":"item","id":"item-scanner-market","label":"Market Scanner","href":"/scanner/market"},{"type":"item","id":"item-scanner-market-alerts","label":"Market Alerts","href":"/scanner/market-alerts"}]}]}'::jsonb,
        true,
        now(),
        now()
      );
    `)

    const migration = await readFile(
      new URL("../../drizzle/0037_alert_dashboard.sql", import.meta.url),
      "utf8"
    )
    await client.exec(migration)
    await client.exec(migration)

    const result = await client.query<{
      settings: {
        sections: Array<{
          entries: Array<{ id: string; children?: Array<{ id: string }> }>
        }>
      }
    }>("select settings from workspaces where id = 'workspace-1'")
    const entries = result.rows[0]?.settings.sections[0]?.entries ?? []
    const trade = entries.find((entry) => entry.id === "item-trade")

    expect(entries.map((entry) => entry.id)).toEqual([
      "custom",
      "item-trade",
      "item-scanner-market",
      "item-scanner-market-alerts",
    ])
    expect(trade?.children?.map((child) => child.id)).toEqual([
      "indicators",
      "item-trade-alerts",
      "item-trade-alert-log",
    ])
  })
})
