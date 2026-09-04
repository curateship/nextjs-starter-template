import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

let client: PGlite

beforeEach(async () => {
  client = new PGlite()
  await client.exec(`
    CREATE TABLE "settings" (
      "key" text PRIMARY KEY NOT NULL,
      "settings" jsonb NOT NULL,
      "created_at" timestamp with time zone NOT NULL,
      "updated_at" timestamp with time zone NOT NULL
    );
    CREATE TABLE "workspaces" (
      "id" text PRIMARY KEY NOT NULL,
      "settings" jsonb NOT NULL,
      "created_at" timestamp with time zone NOT NULL,
      "updated_at" timestamp with time zone NOT NULL
    );
  `)
})

afterEach(async () => {
  await client.close()
})

async function migrationSql() {
  return readFile(
    new URL(
      "../../drizzle/0076_custom_shell_single_site_public_navigation.sql",
      import.meta.url
    ),
    "utf8"
  )
}

async function addWorkspace(
  id: string,
  settings: unknown,
  updatedAt: string
) {
  await client.query(
    `INSERT INTO "workspaces" ("id", "settings", "created_at", "updated_at")
     VALUES ($1, $2::jsonb, $3, $3)`,
    [id, JSON.stringify(settings), updatedAt]
  )
}

async function addGlobals(settings: unknown) {
  await client.query(
    `INSERT INTO "settings" ("key", "settings", "created_at", "updated_at")
     VALUES ('default', $1::jsonb, now(), now())`,
    [JSON.stringify(settings)]
  )
}

async function globals() {
  const result = await client.query<{ settings: Record<string, unknown> }>(
    `SELECT "settings" FROM "settings" WHERE "key" = 'default'`
  )
  return result.rows[0]?.settings
}

async function workspaceSettings(id: string) {
  const result = await client.query<{ settings: Record<string, unknown> }>(
    `SELECT "settings" FROM "workspaces" WHERE "id" = $1`,
    [id]
  )
  return result.rows[0]?.settings
}

describe("single-site public navigation migration", () => {
  it("keeps the newest non-empty value for each public link area", async () => {
    await addWorkspace(
      "older-menu",
      { publicNavigation: [{ label: "About", href: "/about" }] },
      "2026-01-01T00:00:00Z"
    )
    await addWorkspace(
      "newer-footer",
      {
        publicFooter: [{ label: "Privacy", href: "/privacy" }],
        publicFooterCopyright: "Current copyright",
      },
      "2026-02-01T00:00:00Z"
    )

    await client.exec(await migrationSql())

    expect(await globals()).toEqual({
      publicNavigation: [
        { type: "search", visible: true },
        { label: "About", href: "/about" },
      ],
      publicFooter: [{ label: "Privacy", href: "/privacy" }],
      publicFooterCopyright: "Current copyright",
    })
    expect(await workspaceSettings("older-menu")).toEqual({
      publicNavigation: [
        { type: "search", visible: true },
        { label: "About", href: "/about" },
      ],
    })
  })

  it("does not replace app-wide choices and only runs once", async () => {
    await addGlobals({
      publicNavigation: [],
      publicFooterCopyright: "App copyright",
    })
    await addWorkspace(
      "workspace",
      {
        publicNavigation: [{ label: "Wrong", href: "/wrong" }],
        publicFooter: [{ label: "Contact", href: "/contact" }],
        publicFooterCopyright: "Wrong copyright",
      },
      "2026-02-01T00:00:00Z"
    )

    const migration = await migrationSql()
    await client.exec(migration)
    await addWorkspace(
      "later",
      { publicFooter: [{ label: "Later", href: "/later" }] },
      "2026-03-01T00:00:00Z"
    )
    await client.exec(migration)

    expect(await globals()).toEqual({
      publicNavigation: [{ type: "search", visible: true }],
      publicFooter: [{ label: "Contact", href: "/contact" }],
      publicFooterCopyright: "App copyright",
    })
  })
})
