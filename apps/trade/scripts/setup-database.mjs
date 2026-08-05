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

// Whole-file records are kept beside the older per-step keys in the same table,
// so the prefix keeps the two apart.
const migrationKeyPrefix = "file:"

// What proves a migration already ran, for databases built before any of this
// was recorded. Each database reads this once and writes down the answer, so
// migrations added from here on are recorded as they run and never need an
// entry here.
const earlierMigrationProof = Object.freeze({
  "0000_custom_shell_baseline.sql": { table: "users" },
  "0001_custom_shell_feedback_comments.sql": { table: "feedback_comments" },
  "0002_custom_shell_notifications.sql": { table: "notifications" },
  "0003_custom_shell_workspaces.sql": { table: "workspaces" },
  "0004_custom_shell_saas.sql": { table: "plans" },
  "0005_custom_shell_automations.sql": { table: "automations" },
  "0006_custom_shell_changelog.sql": { table: "changelog_entries" },
  "0007_custom_shell_announcements.sql": { table: "announcements" },
  "0008_custom_shell_view_as.sql": { column: ["sessions", "viewing_as_user_id"] },
  "0009_custom_shell_drop_audit.sql": { droppedTable: "admin_audit_logs" },
  "0010_custom_shell_session_policy.sql": { column: ["sessions", "last_seen_at"] },
  "0011_custom_shell_session_devices.sql": { column: ["sessions", "user_agent"] },
  "0012_custom_shell_magic_link.sql": { constraint: "auth_tokens_purpose_check", allows: "login" },
  "0013_custom_shell_oauth.sql": { table: "oauth_accounts" },
  "0014_custom_shell_email_change.sql": { column: ["auth_tokens", "new_email"] },
  "0015_custom_shell_soft_delete.sql": { column: ["users", "deleted_at"] },
  "0016_custom_shell_avatars.sql": { column: ["users", "avatar_url"] },
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

// Every file in drizzle/ is run once and then recorded in "migration_state",
// the way migrations are normally handled. They used to be re-run from the top
// on every start, which only holds while every migration is safe to run twice.
// That stopped being true at 0006: it re-adds the rule listing which types a
// notification may have, and 0007 later adds "announcement" to that list. Once
// a database held an announcement, replaying 0006 was rejected and no later
// migration was applied.
async function runMigrations(url) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query("create extension if not exists pgcrypto")
    await client.query(
      `create table if not exists "migration_state" (
         "key" text primary key not null,
         "applied_at" timestamp with time zone default now() not null
       )`
    )

    const folder = path.join(root, "drizzle")
    await mkdir(folder, { recursive: true })
    const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
    const applied = await adoptEarlierMigrations(client, files)

    for (const file of files) {
      if (applied.has(file)) continue

      const sql = await readFile(path.join(folder, file), "utf8")
      if (!sql.trim()) continue

      // The file and its record commit together, so a failure leaves neither.
      await client.query("begin")
      try {
        await client.query(sql)
        await recordMigration(client, file)
        await client.query("commit")
      } catch (error) {
        await client.query("rollback").catch(() => {})
        throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error })
      }
    }
  } finally {
    await client.end()
  }
}

// A database built before any of this was recorded still needs an answer for
// what it has already run, so take the answer from the database itself: walk the
// files in order and mark off each one whose work is already present, stopping
// at the first that is missing. Everything from there on still runs. Assuming an
// older database was up to date would skip migrations it genuinely needs.
async function adoptEarlierMigrations(client, files) {
  const recorded = await client.query(`select "key" from "migration_state" where "key" like $1`, [
    `${migrationKeyPrefix}%`,
  ])
  const applied = new Set(recorded.rows.map((row) => row.key.slice(migrationKeyPrefix.length)))

  // Nothing to adopt once records exist, or on a database with no tables yet.
  if (applied.size || !(await tableExists(client, "users"))) return applied

  for (const file of files) {
    const proof = earlierMigrationProof[file]
    if (!proof || !(await isAlreadyApplied(client, proof))) break

    await recordMigration(client, file)
    applied.add(file)
  }

  return applied
}

async function isAlreadyApplied(client, proof) {
  if (proof.table) return tableExists(client, proof.table)
  if (proof.droppedTable) return !(await tableExists(client, proof.droppedTable))

  if (proof.column) {
    const [table, column] = proof.column
    const result = await client.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [table, column]
    )
    return result.rowCount > 0
  }

  const result = await client.query(
    `select 1 from pg_constraint where conname = $1 and pg_get_constraintdef(oid) like $2`,
    [proof.constraint, `%'${proof.allows}'%`]
  )
  return result.rowCount > 0
}

async function tableExists(client, name) {
  const result = await client.query(
    `select 1 from information_schema.tables
      where table_schema = 'public' and table_name = $1`,
    [name]
  )
  return result.rowCount > 0
}

async function recordMigration(client, file) {
  await client.query(
    `insert into "migration_state" ("key") values ($1) on conflict ("key") do nothing`,
    [`${migrationKeyPrefix}${file}`]
  )
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
  } finally {
    await client.end()
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}
