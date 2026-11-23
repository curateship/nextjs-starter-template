import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

let client: PGlite

beforeEach(async () => {
  client = new PGlite()
  await client.exec(`
    CREATE TABLE "workspaces" (
      "id" text PRIMARY KEY NOT NULL,
      "settings" jsonb NOT NULL
    );
  `)
})

afterEach(async () => {
  await client.close()
})

async function migrationSql() {
  return readFile(
    new URL(
      "../../drizzle/0075_custom_shell_public_brand_color.sql",
      import.meta.url
    ),
    "utf8"
  )
}

async function addWorkspace(id: string, settings: unknown) {
  await client.query(
    `INSERT INTO "workspaces" ("id", "settings") VALUES ($1, $2::jsonb)`,
    [id, JSON.stringify(settings)]
  )
}

async function settingsFor(id: string) {
  const result = await client.query<{ settings: Record<string, unknown> }>(
    `SELECT "settings" FROM "workspaces" WHERE "id" = $1`,
    [id]
  )
  return result.rows[0]?.settings
}

describe("public brand colour migration", () => {
  it("copies a valid CMS accent without overwriting a newer brand choice", async () => {
    await addWorkspace("legacy", {
      accentColor: " #3B82F6 ",
      publicTheme: { futureField: "kept" },
    })
    await addWorkspace("newer", {
      accentColor: "#3b82f6",
      publicTheme: { brandColor: "#dc2626" },
    })
    await addWorkspace("cleared", {
      accentColor: "#3b82f6",
      publicTheme: { brandColor: "" },
    })
    await addWorkspace("invalid", { accentColor: "blue" })

    await client.exec(await migrationSql())

    expect(await settingsFor("legacy")).toEqual({
      accentColor: " #3B82F6 ",
      publicTheme: { brandColor: "#3b82f6", futureField: "kept" },
    })
    expect(await settingsFor("newer")).toEqual({
      accentColor: "#3b82f6",
      publicTheme: { brandColor: "#dc2626" },
    })
    expect(await settingsFor("cleared")).toEqual({
      accentColor: "#3b82f6",
      publicTheme: { brandColor: "" },
    })
    expect(await settingsFor("invalid")).toEqual({ accentColor: "blue" })
  })

  it("runs only once", async () => {
    const migration = await migrationSql()
    await client.exec(migration)
    await addWorkspace("later", { accentColor: "#3b82f6" })

    await client.exec(migration)

    expect(await settingsFor("later")).toEqual({ accentColor: "#3b82f6" })
  })
})
