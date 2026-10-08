/**
 * Make Tyler's admin account on a live app, verified, with the password from
 * the private keys file. Run once after an app's first deploy.
 *
 *   node .agents/skills/deploy-app/scripts/create-admin.mjs pomodoro
 *
 * It reaches the live database through `live-db.mjs`, which opens a public
 * port for the minute the change takes and closes it again. The admin's
 * password only travels as an argon2 hash.
 *
 * When the account already exists (Tyler registered first), it becomes admin,
 * is marked verified, and gets this password. Nothing else about it changes.
 *
 * Reads `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_NAME` and `FIRST_ADMIN_PASSWORD`
 * from `~/.config/deploy-app/secrets.env`. Prints neither password.
 */

import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { SECRETS_FILE } from "./deploy.mjs"
import { readSecrets, requireFromApp, withLiveDatabase } from "./live-db.mjs"

/** The same settings as `hashPassword` in `src/server/auth/security.ts`. */
const ARGON2_OPTIONS = { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 4 }

export const UPSERT_ADMIN_SQL = `insert into users (id, email, name, role, status, password_hash, created_at, updated_at, email_verified_at)
values ($1, $2, $3, 'admin', 'active', $4, now(), now(), now())
on conflict (email) do update set
  role = 'admin',
  password_hash = excluded.password_hash,
  email_verified_at = coalesce(users.email_verified_at, now()),
  updated_at = now()
returning id, (xmax = 0) as created`

async function main() {
  const appName = process.argv[2]
  if (!appName) throw new Error("Name the app, for example: create-admin.mjs pomodoro")

  const secrets = await readSecrets()
  const email = secrets.FIRST_ADMIN_EMAIL?.trim().toLowerCase()
  const name = secrets.FIRST_ADMIN_NAME?.trim() || "Admin"
  const password = secrets.FIRST_ADMIN_PASSWORD
  if (!email || !password) throw new Error(`FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD must be in ${SECRETS_FILE}.`)

  const passwordHash = await requireFromApp(appName)("argon2").hash(password, ARGON2_OPTIONS)
  await withLiveDatabase(appName, async (client) => {
    const { rows } = await client.query(UPSERT_ADMIN_SQL, [randomUUID(), email, name, passwordHash])
    console.log(`${rows[0].created ? "Created" : "Updated"} ${email} as a verified admin (user ${rows[0].id}).`)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
