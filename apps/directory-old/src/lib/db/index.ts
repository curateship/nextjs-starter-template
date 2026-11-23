import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const poolMax = Number.parseInt(process.env.PGPOOL_MAX || '20', 10)
const idleTimeoutMillis = Number.parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10)
const connectionTimeoutMillis = Number.parseInt(process.env.PG_CONNECT_TIMEOUT_MS || '5000', 10)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: Number.isFinite(poolMax) ? poolMax : 20,
  idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) ? idleTimeoutMillis : 30000,
  connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis) ? connectionTimeoutMillis : 5000,
})

export const db = drizzle(pool, { schema })
