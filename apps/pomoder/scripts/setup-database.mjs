import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"

const { Client, Pool } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const envFile = path.join(root, ".env.local")
const migrationsFolder = path.join(root, "drizzle")

await loadEnv(envFile)

const databasePort = process.env.POMODER_POSTGRES_PORT || "54326"
const databaseUrl =
  process.env.POMODER_DATABASE_URL ||
  `postgresql://postgres:localdev@localhost:${databasePort}/pomoder`
const target = new URL(databaseUrl)
const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, "") || "pomoder")
const maintenanceUrl = new URL(target)
maintenanceUrl.pathname = "/postgres"

if (!process.argv.includes("--migrate-only")) startPostgres()
await waitForDatabase(maintenanceUrl.toString())
await ensureDatabase(maintenanceUrl.toString(), databaseName)
await runMigrations(databaseUrl)

async function loadEnv(file) {
  if (!existsSync(file)) return
  const contents = await readFile(file, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

function startPostgres() {
  const args = ["compose", "--project-name", databaseName]
  if (existsSync(envFile)) args.push("--env-file", envFile)
  args.push("up", "-d", "postgres")
  const result = spawnSync("docker", args, {
    cwd: root,
    env: { ...process.env, POMODER_POSTGRES_PORT: databasePort },
    stdio: "inherit",
  })
  if (result.status !== 0) throw new Error("Failed to start Pomoder PostgreSQL.")
}

async function canConnect(url) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 1_000 })
  try { await client.connect(); return true } catch { return false } finally { await client.end().catch(() => {}) }
}

async function waitForDatabase(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await canConnect(url)) return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error("PostgreSQL did not become ready in time.")
}

async function ensureDatabase(url, name) {
  if (name === "postgres") return
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const result = await client.query("select 1 from pg_database where datname = $1", [name])
    if (!result.rowCount) await client.query(`create database ${quoteIdentifier(name)}`)
  } finally { await client.end() }
}

async function runMigrations(url) {
  const pool = new Pool({ connectionString: url, max: 1 })
  try { await migrate(drizzle(pool), { migrationsFolder }) } finally { await pool.end() }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}
