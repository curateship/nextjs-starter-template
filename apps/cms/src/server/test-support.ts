import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import { customShellUsers, type CustomShellUser } from "@/server/schema"
import * as schema from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * The in-memory database a test file runs against.
 *
 * Deliberately the app's own database type, not pglite's. The two drivers are
 * different types that behave the same for everything here, and saying so once
 * at this boundary is what lets a test hand its database straight to any
 * server function — otherwise every such call needs its own cast.
 */
export type TestDatabase = CustomShellDb

/**
 * A fresh in-memory database for one test. Replays every migration in order,
 * the way setup-database.mjs does, so the test schema cannot drift from the
 * real one, then points the app's shared `db` handle at it. The caller owns
 * the client and must close it in its own afterEach.
 */
export async function createTestDatabase(): Promise<{
  client: PGlite
  db: TestDatabase
}> {
  const client = new PGlite()
  const folder = new URL("../../drizzle/", import.meta.url)
  const migrations = (await readdir(folder))
    .filter((file) => file.endsWith(".sql"))
    .sort()

  for (const migration of migrations) {
    await client.exec(await readFile(new URL(migration, folder), "utf8"))
  }

  const db = drizzle(client, { schema }) as unknown as CustomShellDb
  setDbForTests(db)
  return { client, db }
}

/**
 * One saved account. Overrides are spread last, so a test can change any
 * column. The default passwordHash is a stand-in string, not a working hash —
 * a test that needs a verifiable password must pass its own.
 */
export async function insertUser(
  db: CustomShellDb,
  overrides: Partial<typeof customShellUsers.$inferInsert> = {}
): Promise<CustomShellUser> {
  const timestamp = now()
  const [user] = await db
    .insert(customShellUsers)
    .values({
      id: uuid(),
      email: `${uuid()}@example.test`,
      name: "Test Person",
      role: "member",
      status: "active",
      passwordHash: "not-a-real-hash",
      emailVerifiedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()

  return user
}
