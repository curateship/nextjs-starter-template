import { randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { setDbForTests } from "@/server/db"
import * as schema from "@/server/schema"

export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** An isolated local PostgreSQL database, never the application's database. */
export async function createPlanPostgresDatabase() {
  const url = new URL(process.env.TRADE_TEST_POSTGRES_URL!)
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Plan concurrency tests require local PostgreSQL")
  }
  const admin = new Pool({ connectionString: url.toString(), max: 1 })
  const name = `trade_plan_test_${randomUUID().replaceAll("-", "")}`
  await admin.query(`CREATE DATABASE "${name}"`)
  url.pathname = `/${name}`
  const pool = new Pool({ connectionString: url.toString(), max: 8 })
  const close = async () => {
    await pool.end()
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
    await admin.end()
  }
  try {
    const folder = new URL("../../../drizzle/", import.meta.url)
    for (const file of (await readdir(folder))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await pool.query(await readFile(new URL(file, folder), "utf8"))
    }
    const db = drizzle(pool, { schema })
    setDbForTests(db)
    return {
      db,
      pool,
      client: {
        close,
        async waitForLock() {
          const deadline = Date.now() + 3_000
          while (Date.now() < deadline) {
            const result = await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
            )
            if (result.rowCount) return
            await setTimeout(10)
          }
          throw new Error(
            "The competing writer never waited for a database lock"
          )
        },
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}
