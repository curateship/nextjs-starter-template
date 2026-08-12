import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile, unlink } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

import { quoteIdentifier, runMigrations } from "./migrations.mjs"

/**
 * Getting a *development* database ready: start Docker's Postgres, create the
 * database if it is new, bring it up to date, and put something in it.
 *
 * The bringing-up-to-date half lives in `migrations.mjs`, shared with the
 * production command in `migrate-database.mjs`. Everything else in this file —
 * Docker, the scaffold snapshot, the default admin — is development only and
 * deliberately has no production counterpart.
 */

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
const scaffoldDatabaseFile = path.join(root, ".scaffold-database.json")

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
await runMigrations(databaseUrl, root)
if (!(await importScaffoldDatabase(databaseUrl))) {
  await seedAdminUser(databaseUrl)
}

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

async function seedAdminUser(url) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    // The seeded admin is verified on creation; sign-in requires a verified
    // email and nobody can click a link for this account.
    await client.query(
      `insert into users (id, email, name, role, password_hash, email_verified_at, created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, now(), now(), now())
       on conflict (email) do update
       set name = excluded.name,
           role = excluded.role,
           password_hash = excluded.password_hash,
           email_verified_at = coalesce(users.email_verified_at, now()),
           updated_at = now()`,
      [adminUser.email, adminUser.name, adminUser.role, adminUser.passwordHash]
    )

    // A workspace, and the admin pointed at it. Reading no longer creates one —
    // it used to appear on the first signed-in page load, which meant a member
    // who never sees a workspace still owned one. So a fresh database gets its
    // first workspace here, deliberately, and only if it has none.
    await client.query(
      `insert into workspaces (id, user_id, name, settings, created_at, updated_at)
       select gen_random_uuid()::text, u.id, 'My project', '{}'::jsonb, now(), now()
       from users u
       where u.email = $1 and not exists (select 1 from workspaces)`,
      [adminUser.email]
    )
    await client.query(
      `update users
       set current_workspace_id = (select id from workspaces order by created_at asc limit 1)
       where email = $1 and current_workspace_id is null`,
      [adminUser.email]
    )
  } finally {
    await client.end()
  }
}

async function importScaffoldDatabase(url) {
  if (!existsSync(scaffoldDatabaseFile)) return false

  const snapshot = JSON.parse(
    await readFile(scaffoldDatabaseFile, "utf8"),
    reviveBuffer
  )
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.tables)) {
    throw new Error("The Custom Shell database snapshot is invalid.")
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const targetResult = await client.query(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_type = 'BASE TABLE'
        order by table_name`
    )
    const columnResult = await client.query(
      `select table_name, column_name, data_type
         from information_schema.columns
        where table_schema = 'public'`
    )
    const targetTables = targetResult.rows.map((row) => row.table_name)
    const targetTableSet = new Set(targetTables)
    const targetColumns = new Map()
    for (const column of columnResult.rows) {
      const columns = targetColumns.get(column.table_name) ?? new Map()
      columns.set(column.column_name, column.data_type)
      targetColumns.set(column.table_name, columns)
    }
    const snapshotTableSet = new Set(
      snapshot.tables.map((table) => table?.name)
    )

    if (
      snapshot.tables.length !== targetTables.length ||
      snapshotTableSet.size !== targetTableSet.size ||
      targetTables.some((table) => !snapshotTableSet.has(table))
    ) {
      throw new Error(
        "The Custom Shell database snapshot does not match this scaffold."
      )
    }

    await client.query("begin")
    try {
      await client.query("set local session_replication_role = replica")
      if (targetTables.length) {
        await client.query(
          `truncate ${targetTables.map(quoteIdentifier).join(", ")} restart identity cascade`
        )
      }

      for (const table of snapshot.tables) {
        if (!targetTableSet.has(table.name) || !Array.isArray(table.rows)) {
          throw new Error("The Custom Shell database snapshot is invalid.")
        }

        for (const row of table.rows) {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            throw new Error(
              "The Custom Shell database snapshot contains an invalid row."
            )
          }
          const columns = Object.keys(row)
          if (!columns.length) continue
          const columnTypes = targetColumns.get(table.name)
          if (!columnTypes || columns.some((column) => !columnTypes.has(column))) {
            throw new Error(
              "The Custom Shell database snapshot contains an unknown column."
            )
          }
          const placeholders = columns.map((_, index) => `$${index + 1}`)
          await client.query(
            `insert into ${quoteIdentifier(table.name)} (${columns
              .map(quoteIdentifier)
              .join(", ")}) values (${placeholders.join(", ")})`,
            columns.map((column) => {
              const value = row[column]
              const dataType = columnTypes.get(column)
              return value !== null && (dataType === "json" || dataType === "jsonb")
                ? JSON.stringify(value)
                : value
            })
          )
        }
      }

      await client.query("commit")
    } catch (error) {
      await client.query("rollback").catch(() => {})
      throw error
    }
  } finally {
    await client.end()
  }

  await unlink(scaffoldDatabaseFile)
  return true
}

function reviveBuffer(_key, value) {
  if (
    value?.type === "Buffer" &&
    Array.isArray(value.data) &&
    value.data.every(
      (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255
    )
  ) {
    return Buffer.from(value.data)
  }
  return value
}
