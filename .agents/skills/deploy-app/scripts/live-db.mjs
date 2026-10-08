/**
 * Talk to a live app's database from this Mac for one short job.
 *
 * An app's database has no outside access, on purpose. `withLiveDatabase`
 * opens a public port on it through Coolify for the minute the job takes and
 * closes it in a `finally`, so a failure part-way still closes it. The link is
 * not encrypted for that minute (the database has no SSL). Postgres checks the
 * password by challenge, so the database password itself never crosses the
 * wire.
 *
 * Reads the app's Coolify server from `~/.config/deploy-app/secrets.env`, the
 * database uuid from `apps.json`, and the database login from
 * `apps/<app>/.env.live`. Prints no secret.
 */

import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parseEnvText, SECRETS_FILE } from "./deploy.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, "..", "..", "..", "..")

/** Above the ports other databases on these servers use (54319, 54320). */
const TEMPORARY_PORT = 54390

/** user, password and database name out of a postgres:// address. */
export function databaseLogin(address) {
  const url = new URL(address)
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  }
}

export async function readSecrets() {
  return parseEnvText(await readFile(SECRETS_FILE, "utf8"))
}

/** `require` that resolves packages (pg, argon2) from the app's own folder. */
export function requireFromApp(appName) {
  return createRequire(path.join(repoRoot, "apps", appName, "package.json"))
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

/** Runs `work(client)` against the app's live database, port open only meanwhile. */
export async function withLiveDatabase(appName, work) {
  const apps = JSON.parse(await readFile(path.join(here, "..", "apps.json"), "utf8"))
  const app = apps[appName]
  if (!app?.database?.uuid) throw new Error(`apps.json has no database uuid for "${appName}".`)

  const secrets = await readSecrets()
  const server = app.server.toUpperCase()
  const settings = { url: secrets[`COOLIFY_${server}_URL`]?.replace(/\/+$/, ""), token: secrets[`COOLIFY_${server}_TOKEN`] }
  if (!settings.url || !settings.token) throw new Error(`COOLIFY_${server}_URL and COOLIFY_${server}_TOKEN must be in ${SECRETS_FILE}.`)

  const live = parseEnvText(await readFile(path.join(repoRoot, "apps", appName, ".env.live"), "utf8"))
  const login = databaseLogin(live.CUSTOM_SHELL_DATABASE_URL)
  const { Client } = requireFromApp(appName)("pg")
  const host = new URL(settings.url).hostname
  const db = app.database.uuid

  console.log(`Opening port ${TEMPORARY_PORT} on the live ${appName} database...`)
  await coolify(settings, "PATCH", `/databases/${db}`, { is_public: true, public_port: TEMPORARY_PORT })
  try {
    if (!(await waitForPort(host, TEMPORARY_PORT, true, 90))) throw new Error("The port never opened.")
    const client = new Client({ host, port: TEMPORARY_PORT, ...login, ssl: false, connectionTimeoutMillis: 10_000 })
    await client.connect()
    try {
      return await work(client)
    } finally {
      await client.end()
    }
  } finally {
    await coolify(settings, "PATCH", `/databases/${db}`, { is_public: false })
    const closed = await waitForPort(host, TEMPORARY_PORT, false, 90)
    console.log(closed ? "Port closed again." : `WARNING: port ${TEMPORARY_PORT} still answers. Close it in Coolify now.`)
  }
}
