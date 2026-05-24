import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@/server/schema"

const LOCAL_DATABASE_URL =
  "postgresql://postgres:localdev@localhost:54322/ai_video"

export function getDatabaseUrl() {
  const url =
    process.env.AI_VIDEO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    LOCAL_DATABASE_URL

  return url.replace(/^postgresql\+psycopg:\/\//, "postgresql://")
}

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: Number.parseInt(process.env.AI_VIDEO_PGPOOL_MAX || "10", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export let db = drizzle(pool, { schema })
export type AiVideoDb = typeof db
