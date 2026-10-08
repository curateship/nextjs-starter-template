/**
 * Make Tyler's admin account on a live app, verified, with the password from
 * the private keys file. Run once after an app's first deploy.
 *
 *   node .agents/skills/deploy-app/scripts/create-admin.mjs pomodoro
 *
 * An app's database has no outside access, on purpose. This opens a public
 * port on it through Coolify for the minute the change takes and closes it in
 * a `finally`, so a failure part-way still closes it. The link is not
 * encrypted for that minute (the database has no SSL). Postgres checks the
 * password by challenge, so the database password itself never crosses the
 * wire, and the admin's password only travels as an argon2 hash.
 *
 * When the account already exists (Tyler registered first), it becomes admin,
 * is marked verified, and gets this password. Nothing else about it changes.
 *
 * Reads `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_NAME`, `FIRST_ADMIN_PASSWORD` and
 * the app's Coolify server from `~/.config/deploy-app/secrets.env`, and the
 * database login from `apps/<app>/.env.live`. Prints neither password.
 */

import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parseEnvText, SECRETS_FILE } from "./deploy.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..", "..", "..")

/** The same settings as `hashPassword` in `src/server/auth/security.ts`. */
const ARGON2_OPTIONS = { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 4 }

/** Above the ports other databases on these servers use (54319, 54320). */
const TEMPORARY_PORT = 54390

export const UPSERT_ADMIN_SQL = `insert into users (id, email, name, role, status, password_hash, created_at, updated_at, email_verified_at)
values ($1, $2, $3, 'admin', 'active', $4, now(), now(), now())
on conflict (email) do update set
  role = 'admin',
  password_hash = excluded.password_hash,
  email_verified_at = coalesce(users.email_verified_at, now()),
  updated_at = now()
returning id, (xmax = 0) as created`

/** user, password and database name out of a postgres:// address. */
export function databaseLogin(address) {
  const url = new URL(address)
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  }
}

async function coolify(settings, method, route, body) {
  const response = await fetch(`${settings.url}/api/v1${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Coolify answered ${response.status} to ${method} ${route}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

function portOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 3000 })
    socket.once("connect", () => (socket.destroy(), resolve(true)))
    socket.once("timeout", () => (socket.destroy(), resolve(false)))
    socket.once("error", () => resolve(false))
  })
}

async function waitForPort(host, port, wanted, seconds) {
  for (let i = 0; i < seconds / 3; i++) {
    if ((await portOpen(host, port)) === wanted) return true
    await new Promise((done) => setTimeout(done, 3000))
  }
  return false
}

async function main() {
  const appName = process.argv[2]
  if (!appName) throw new Error("Name the app, for example: create-admin.mjs pomodoro")
  const apps = JSON.parse(await readFile(path.join(here, "..", "apps.json"), "utf8"))
  const app = apps[appName]
  if (!app?.database?.uuid) throw new Error(`apps.json has no database uuid for "${appName}".`)

  const secrets = parseEnvText(await readFile(SECRETS_FILE, "utf8"))
  const server = app.server.toUpperCase()
  const settings = { url: secrets[`COOLIFY_${server}_URL`]?.replace(/\/+$/, ""), token: secrets[`COOLIFY_${server}_TOKEN`] }
  const email = secrets.FIRST_ADMIN_EMAIL?.trim().toLowerCase()
  const name = secrets.FIRST_ADMIN_NAME?.trim() || "Admin"
  const password = secrets.FIRST_ADMIN_PASSWORD
  if (!email || !password || !settings.url || !settings.token) {
    throw new Error(`FIRST_ADMIN_EMAIL, FIRST_ADMIN_PASSWORD and COOLIFY_${server}_* must be in ${SECRETS_FILE}.`)
  }

  const appDir = path.join(repoRoot, "apps", appName)
  const live = parseEnvText(await readFile(path.join(appDir, ".env.live"), "utf8"))
  const login = databaseLogin(live.CUSTOM_SHELL_DATABASE_URL)
  const fromApp = createRequire(path.join(appDir, "package.json"))
  const argon2 = fromApp("argon2")
  const { Client } = fromApp("pg")
  const host = new URL(settings.url).hostname

  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS)
  const db = app.database.uuid

  console.log(`Opening port ${TEMPORARY_PORT} on the ${appName} database for this change...`)
  await coolify(settings, "PATCH", `/databases/${db}`, { is_public: true, public_port: TEMPORARY_PORT })
  try {
    if (!(await waitForPort(host, TEMPORARY_PORT, true, 90))) throw new Error("The port never opened.")
    const client = new Client({ host, port: TEMPORARY_PORT, ...login, ssl: false, connectionTimeoutMillis: 10_000 })
    await client.connect()
    try {
      const { rows } = await client.query(UPSERT_ADMIN_SQL, [randomUUID(), email, name, passwordHash])
      console.log(`${rows[0].created ? "Created" : "Updated"} ${email} as a verified admin (user ${rows[0].id}).`)
    } finally {
      await client.end()
    }
  } finally {
    await coolify(settings, "PATCH", `/databases/${db}`, { is_public: false })
    const closed = await waitForPort(host, TEMPORARY_PORT, false, 90)
    console.log(closed ? "Port closed again." : `WARNING: port ${TEMPORARY_PORT} still answers. Close it in Coolify now.`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
