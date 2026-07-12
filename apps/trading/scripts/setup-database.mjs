import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const { Client } = pg
const adminUser = Object.freeze({
  email: "typham2@gmail.com",
  name: "Admin",
  role: "admin",
  passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$68NzDTXT8n9BLDTLwpuj0g$BN50/JlhN7IpOuHSUBFgWvGmA22Q8VT4MGqHtQSOKVs",
})

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const envFile = path.join(root, ".env.local")
const packageFile = path.join(root, "package.json")

await loadEnv(envFile)

const packageJson = JSON.parse(await readFile(packageFile, "utf8"))
const databaseName = databaseNameFor(packageJson.name)
const databasePort = process.env.CUSTOM_SHELL_POSTGRES_PORT || "54320"
const databaseUrl =
  process.env.CUSTOM_SHELL_DATABASE_URL ||
  `postgresql://postgres:localdev@localhost:${databasePort}/${databaseName}`
const target = new URL(databaseUrl)
const targetDatabase = decodeURIComponent(target.pathname.replace(/^\/+/, "") || databaseName)
const composeProjectName = targetDatabase
const maintenanceUrl = new URL(target)
maintenanceUrl.pathname = "/postgres"

startPostgres()
await waitForDatabase(maintenanceUrl.toString())
await ensureDatabase(maintenanceUrl.toString(), targetDatabase)
await runMigrations(databaseUrl)
await seedAdminUser(databaseUrl)

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
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function databaseNameFor(packageName) {
  const value = String(packageName || "app")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return value || "app"
}

function startPostgres() {
  const composeFile = path.join(root, "docker-compose.yml")
  if (!existsSync(composeFile)) {
    throw new Error("Postgres is not running and docker-compose.yml was not found.")
  }

  const args = ["compose", "--project-name", composeProjectName]
  if (existsSync(envFile)) {
    args.push("--env-file", envFile)
  }
  args.push("up", "-d", "postgres")

  const result = spawnSync("docker", args, {
    cwd: root,
    env: {
      ...process.env,
      CUSTOM_SHELL_POSTGRES_PORT: databasePort,
    },
    stdio: "inherit",
  })

  if (result.status !== 0) {
    throw new Error("Failed to start local Postgres with Docker Compose.")
  }
}

async function canConnect(url) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 1000 })
  try {
    await client.connect()
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

async function waitForDatabase(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await canConnect(url)) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error("Postgres did not become ready in time.")
}

async function ensureDatabase(url, name) {
  if (name === "postgres") return

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const result = await client.query("select 1 from pg_database where datname = $1", [name])
    if (!result.rowCount) {
      await client.query(`create database ${quoteIdentifier(name)}`)
    }
  } finally {
    await client.end()
  }
}

async function runMigrations(url) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query("create extension if not exists pgcrypto")
    const folder = path.join(root, "drizzle")
    await mkdir(folder, { recursive: true })
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()

    // Ledger: every migration file runs exactly once, ever. Before this
    // existed the script replayed EVERY file on each run (every dev start),
    // which required each file to stay re-run-safe forever — and a cleanup
    // delete written for one era silently destroyed rows created by later
    // eras (the July 12, 2026 automation-rows incident).
    //
    // Transition: a database from the replay era has no ledger, so every file
    // runs one final time (they are re-run-safe today) and is then recorded;
    // from then on only genuinely new files execute.
    await client.query(
      `create table if not exists _migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`
    )
    const ledger = await client.query("select name from _migrations")
    const applied = new Set(ledger.rows.map((row) => row.name))

    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await readFile(path.join(folder, file), "utf8")
      // One transaction per file: a failed migration rolls back fully and is
      // NOT recorded, so the next run retries it instead of skipping it.
      await client.query("begin")
      try {
        if (sql.trim()) {
          await client.query(sql)
        }
        await client.query("insert into _migrations (name) values ($1)", [file])
        await client.query("commit")
      } catch (error) {
        await client.query("rollback").catch(() => {})
        throw error
      }
      console.log(`Applied migration ${file}`)
    }
  } finally {
    await client.end()
  }
}

async function seedAdminUser(url) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(
      `insert into users (id, email, name, role, password_hash, created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, now(), now())
       on conflict (email) do update
       set name = excluded.name,
           role = excluded.role,
           password_hash = excluded.password_hash,
           updated_at = now()`,
      [adminUser.email, adminUser.name, adminUser.role, adminUser.passwordHash]
    )
  } finally {
    await client.end()
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}
