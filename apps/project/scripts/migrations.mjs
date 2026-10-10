import { mkdir, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

const { Client } = pg

/**
 * Applying the files in `drizzle/`, once each, in order.
 *
 * Shared by the two commands that need it and owned by neither:
 * `setup-database.mjs` (development, which can start Docker and always seeds)
 * and `migrate-database.mjs` (production, which does neither). Splitting them
 * without splitting this is the point — there must be exactly one description
 * of what "the database is up to date" means, or the two drift and the one
 * that runs in production is the one nobody tested.
 */

// Whole-file records are kept beside the older per-step keys in the same table,
// so the prefix keeps the two apart.
const migrationKeyPrefix = "file:"

/**
 * The lock two starts contend for.
 *
 * Coolify can bring a replacement web container up while the old one is still
 * serving, and both run this on the way in. Postgres advisory locks are the
 * fitting tool: the second one waits at this line, and by the time it gets
 * through, the first has committed both the migration and its record — so the
 * second finds nothing to do rather than applying the same file twice. The
 * number is arbitrary but must never change; it is only ever compared with
 * itself. Session-level, so a killed container releases it by disconnecting.
 */
const MIGRATION_LOCK_KEY = 8323217704311947n

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

// Every file in drizzle/ is run once and then recorded in "migration_state",
// the way migrations are normally handled. They used to be re-run from the top
// on every start, which only holds while every migration is safe to run twice.
// That stopped being true at 0006: it re-adds the rule listing which types a
// notification may have, and 0007 later adds "announcement" to that list. Once
// a database held an announcement, replaying 0006 was rejected and no later
// migration was applied.
export async function runMigrations(url, root, { onApplied } = {}) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY.toString()])
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

      onApplied?.(file)
    }
  } finally {
    // The lock would go on its own when the connection closes; releasing it
    // first keeps a waiting container from sitting through a slow disconnect.
    await client
      .query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY.toString()])
      .catch(() => {})
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

export function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}
