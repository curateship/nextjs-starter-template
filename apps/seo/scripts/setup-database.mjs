import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const { Client } = pg
const generatedAdminUser = Object.freeze({
  email: "typham2@gmail.com",
  name: "Admin",
  role: "admin",
  passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$68NzDTXT8n9BLDTLwpuj0g$BN50/JlhN7IpOuHSUBFgWvGmA22Q8VT4MGqHtQSOKVs",
})
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const envFile = path.join(root, ".env.local")

await loadEnv(envFile)

const databaseUrl = requiredEnv("CUSTOM_SHELL_DATABASE_URL").replace(/^postgresql\+psycopg:\/\//, "postgresql://")

const target = new URL(databaseUrl)
const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, "") || "postgres")
const composeProjectName = databaseName
const maintenanceUrl = new URL(target)
maintenanceUrl.pathname = "/postgres"

startPostgres()
await waitForDatabase(maintenanceUrl.toString())

await ensureDatabase(maintenanceUrl.toString(), databaseName)
await runMigrations(databaseUrl)
await seedAdminUser(databaseUrl)

async function loadEnv(file) {
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

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
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

function startPostgres() {
  const composeFile = path.join(root, "docker-compose.yml")
  if (!existsSync(composeFile)) {
    throw new Error("Postgres is not running and docker-compose.yml was not found.")
  }

  const result = spawnSync("docker", ["compose", "--project-name", composeProjectName, "--env-file", envFile, "up", "-d", "postgres"], {
    cwd: root,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    throw new Error("Failed to start local Postgres with Docker Compose.")
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
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    for (const file of files) {
      const sql = await readFile(path.join(folder, file), "utf8")
      if (sql.trim()) {
        await client.query(sql)
      }
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
      [
        generatedAdminUser.email,
        generatedAdminUser.name,
        generatedAdminUser.role,
        generatedAdminUser.passwordHash,
      ]
    )
  } finally {
    await client.end()
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}
