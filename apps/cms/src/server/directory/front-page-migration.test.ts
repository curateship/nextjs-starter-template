import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * The one migration whose whole job is not to change anything.
 *
 * `0071` replaces the pair of columns that said "one row, newest or featured"
 * with a table of rows. Every site that had the front page switched on has to
 * come out the other side showing the same listings in the same order, and a
 * site that had it off has to come out with no rows at all — otherwise a
 * platform front page silently becomes a directory on the day this ships.
 *
 * So this test runs the migrations up to the one before it, writes the settings
 * a real site would have, and only then applies it.
 */

const FOLDER = new URL("../../../drizzle/", import.meta.url)
const MIGRATION = "0071_cms_directory_front_page_sections.sql"

let client: PGlite

async function migrationsBefore(): Promise<string[]> {
  const files = (await readdir(FOLDER))
    .filter((file) => file.endsWith(".sql"))
    .sort()
  const index = files.indexOf(MIGRATION)
  expect(index).toBeGreaterThan(0)
  return files.slice(0, index)
}

async function run(file: string) {
  await client.exec(await readFile(new URL(file, FOLDER), "utf8"))
}

async function insertSite(subdomain: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO workspaces (id, name, subdomain, status, settings, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $1, 'active', '{}'::jsonb, now(), now())
     RETURNING id`,
    [subdomain]
  )
  return rows[0]!.id
}

beforeEach(async () => {
  client = new PGlite()
  for (const file of await migrationsBefore()) await run(file)
})

afterEach(async () => {
  await client.close()
})

describe("moving the front page into rows", () => {
  it("gives every switched-on site one row showing what it showed before", async () => {
    const newest = await insertSite("alpha")
    const featured = await insertSite("beta")
    const off = await insertSite("gamma")

    await client.query(
      `INSERT INTO directory_settings
         (workspace_id, front_page_mode, front_page_count, created_at, updated_at)
       VALUES ($1, 'newest', 4, now(), now()),
              ($2, 'featured', 12, now(), now()),
              ($3, 'off', 8, now(), now())`,
      [newest, featured, off]
    )

    await run(MIGRATION)

    const { rows } = await client.query<{
      workspace_id: string
      heading: string
      sort: string
      listing_count: number
      layout: string
      display_order: number
      category_id: string | null
    }>(`SELECT * FROM directory_front_page_sections ORDER BY heading`)

    expect(rows).toHaveLength(2)
    expect(rows).toMatchObject([
      {
        workspace_id: featured,
        heading: "Featured listings",
        sort: "featured",
        listing_count: 12,
        layout: "grid",
        display_order: 0,
        category_id: null,
      },
      {
        workspace_id: newest,
        heading: "Newest listings",
        sort: "newest",
        listing_count: 4,
        layout: "grid",
        display_order: 0,
        category_id: null,
      },
    ])
  })

  it("leaves the old columns behind, so there is one place that decides", async () => {
    await run(MIGRATION)
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'directory_settings'
         AND column_name IN ('front_page_mode', 'front_page_count')`
    )
    expect(rows).toEqual([])
  })

  it("is safe to replay", async () => {
    const site = await insertSite("delta")
    await client.query(
      `INSERT INTO directory_settings
         (workspace_id, front_page_mode, front_page_count, created_at, updated_at)
       VALUES ($1, 'newest', 6, now(), now())`,
      [site]
    )

    await run(MIGRATION)
    await run(MIGRATION)

    const { rows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM directory_front_page_sections`
    )
    expect(rows[0]?.count).toBe(1)
  })
})
