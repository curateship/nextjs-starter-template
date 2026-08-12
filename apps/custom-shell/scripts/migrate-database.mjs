import path from "node:path"
import { fileURLToPath } from "node:url"

import { runMigrations } from "./migrations.mjs"

/**
 * Bring a deployed database up to date, and do nothing else.
 *
 * The web container runs this on its way in, before it takes traffic. If it
 * fails, the container never becomes healthy and the release stops there —
 * which is the point. A half-migrated database serving requests is worse than
 * a deploy that visibly refused.
 *
 * Deliberately *not* `db:setup`. That command starts Docker, creates the
 * database, loads the scaffold snapshot and seeds a known admin account with a
 * known password. Every one of those is right for a laptop and wrong for a
 * server, and the last one is a way in. So this command has none of them: it
 * connects to the database it was given, applies whatever files that database
 * has not run, and stops.
 *
 * The address must be supplied. There is no local fallback here at all, not
 * even the development one — a production container that quietly reached for
 * `localhost` would either find nothing or, on a host running several of these,
 * find another app's database and migrate that instead.
 *
 * Run it repeatedly if you like; each file runs once and is recorded. Two
 * containers starting at the same moment are safe too — see the advisory lock
 * in `migrations.mjs`.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const databaseUrl = process.env.CUSTOM_SHELL_DATABASE_URL

if (!databaseUrl) {
  console.error(
    "CUSTOM_SHELL_DATABASE_URL is required. Point it at this app's own database."
  )
  process.exit(1)
}

let applied = 0
try {
  // Named as they go, so a failed release says how far it got. The names are
  // filenames from this repository — nothing about the database or its
  // credentials reaches the log.
  await runMigrations(databaseUrl, root, {
    onApplied: (file) => {
      applied += 1
      console.log(`Applied ${file}`)
    },
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

console.log(
  applied ? `Database up to date, ${applied} applied` : "Database already up to date"
)
