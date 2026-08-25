import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

import { setDbForTests } from "@/server/db"
import * as schema from "@/server/schema"

import type { TestDatabase } from "./test-support"

export * from "./test-support"

/**
 * A faster stand-in for `createTestDatabase` in `test-support.ts`, swapped in
 * by `vitest.app.config.ts` through an import alias. The original replays all
 * of `drizzle/` into a fresh database before every test, which is over a
 * second each time and is where most of a suite run goes. This version does
 * that replay once, saves the finished database as one file under
 * `node_modules/.cache/`, and starts every later test from that file in
 * ~150ms. The file name includes a hash of the migration scripts, so adding
 * or editing a migration makes a new snapshot instead of reusing a stale one.
 *
 * `test-support.ts` itself is a shell file and stays untouched; plain
 * `npm run test` still uses it and behaves exactly as before.
 */

const migrationsFolder = new URL("../../drizzle/", import.meta.url)
const cacheFolder = path.join(
  process.cwd(),
  "node_modules",
  ".cache",
  "test-db",
)

let snapshot: Promise<Uint8Array> | null = null

async function migrationSnapshot(): Promise<Uint8Array> {
  snapshot ??= loadOrBuildSnapshot()
  return snapshot
}

async function loadOrBuildSnapshot(): Promise<Uint8Array> {
  const files = (await readdir(migrationsFolder))
    .filter((file) => file.endsWith(".sql"))
    .sort()

  const hash = createHash("sha256")
  const sources: string[] = []
  for (const file of files) {
    const sql = await readFile(new URL(file, migrationsFolder), "utf8")
    hash.update(file)
    hash.update(sql)
    sources.push(sql)
  }
  const cachePath = path.join(
    cacheFolder,
    `schema-${hash.digest("hex").slice(0, 16)}.tar`,
  )

  try {
    return new Uint8Array(await readFile(cachePath))
  } catch {
    // Not built yet on this machine, or the migrations changed. Build below.
  }

  const client = new PGlite()
  for (const sql of sources) {
    await client.exec(sql)
  }
  const dump = await client.dumpDataDir("none")
  await client.close()
  const bytes = new Uint8Array(await dump.arrayBuffer())

  // Test files run in parallel forks, so several may build at once. Each
  // writes its own temp file and renames it into place; rename is atomic, the
  // contents are identical, and whoever lands last wins harmlessly.
  await mkdir(cacheFolder, { recursive: true })
  const tempPath = `${cachePath}.${process.pid}`
  await writeFile(tempPath, bytes)
  await rename(tempPath, cachePath)
  return bytes
}

export async function createTestDatabase(): Promise<{
  client: PGlite
  db: TestDatabase
}> {
  const bytes = await migrationSnapshot()
  const client = await PGlite.create({
    loadDataDir: new Blob([bytes.buffer as ArrayBuffer]),
  })
  const db = drizzle(client, { schema }) as unknown as TestDatabase
  setDbForTests(db)
  return { client, db }
}
