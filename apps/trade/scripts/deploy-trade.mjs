/**
 * Deploy Trade: web, then worker, then engine, one after the other.
 *
 *   npm run deploy            all three, in that order
 *   npm run deploy -- --force rebuild without Docker's cache
 *   npm run deploy -- --only engine,web
 *
 * Why one command: Trade runs as three Coolify apps, and each one builds
 * whatever `develop` is at the moment its own button is pressed. Pressing one
 * button leaves the other two on older builds. On 3 Sep and 4 Sep 2026 the
 * engine was redeployed alone, the website and the shell worker were still a
 * build from 24 Aug, and in the seconds the engine was away one of them took
 * the trading lock and ran old code over live grids. This script presses all
 * three buttons and waits for each build to finish before starting the next.
 *
 * Why the engine goes LAST: the moment the engine restarts, its lock is free
 * for a few seconds, and whatever website or worker is alive at that moment
 * may ask for it. On 4 Sep 2026 the engine went first, the old website was
 * still up, took the lock, and stripped twelve short grids in the five
 * minutes before the new website replaced it. Rebuilding the website and the
 * worker first means that by the time the engine restarts, nothing old is
 * left to stand in. The engine is still the newest build, so it still leads.
 *
 * What it needs, in `apps/trade/.env.live` (gitignored) or the environment:
 *
 *   COOLIFY_URL              http://46.224.177.156:8000
 *   COOLIFY_API_TOKEN        a token minted in Coolify → Keys & Tokens → API
 *   COOLIFY_TRADE_ENGINE     the engine app's uuid   (default: current German box)
 *   COOLIFY_TRADE_WORKER     the worker app's uuid   (default: current German box)
 *   COOLIFY_TRADE_WEB        the web app's uuid      (default: current German box)
 *
 * Nothing here is run on its own. It is a button: somebody types the command.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const DEFAULTS = {
  COOLIFY_URL: "http://46.224.177.156:8000",
  COOLIFY_TRADE_ENGINE: "ffczihue94jcuffjomtwrsd5",
  COOLIFY_TRADE_WORKER: "qctdyzm1krljaifnndqbee7j",
  COOLIFY_TRADE_WEB: "mhp3m2mhz1mwrqve5dmtr4xh",
}

/**
 * The order matters: the engine LAST, so nothing old is alive when its lock
 * is briefly free, and it is still the newest build, so it leads.
 */
const ORDER = ["web", "worker", "engine"]

const POLL_EVERY_MS = 5_000
const GIVE_UP_AFTER_MS = 20 * 60_000

async function envFile(name) {
  try {
    const text = await readFile(path.join(root, name), "utf8")
    const values = {}
    for (const raw of text.split("\n")) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      const at = line.indexOf("=")
      if (at < 1) continue
      const key = line.slice(0, at).trim()
      let value = line.slice(at + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      values[key] = value
    }
    return values
  } catch {
    return {}
  }
}

function readFlags(argv) {
  const flags = { force: false, only: null }
  for (const arg of argv) {
    if (arg === "--force") flags.force = true
    else if (arg.startsWith("--only=")) flags.only = arg.slice(7)
    else if (arg === "--only") flags.only = "?"
    else if (flags.only === "?") flags.only = arg
    else {
      console.error(`Unknown option ${arg}`)
      process.exit(2)
    }
  }
  if (flags.only === "?") {
    console.error("--only needs a list, for example --only engine,web")
    process.exit(2)
  }
  return flags
}

/** Which apps to deploy, in the fixed order, from `--only` if given. */
export function appsToDeploy(only) {
  if (!only) return ORDER
  const wanted = only.split(",").map((one) => one.trim()).filter(Boolean)
  const unknown = wanted.filter((one) => !ORDER.includes(one))
  if (unknown.length) {
    throw new Error(`Unknown app ${unknown.join(", ")}. Choose from ${ORDER.join(", ")}.`)
  }
  return ORDER.filter((one) => wanted.includes(one))
}

/** One line for the terminal from Coolify's deployment record. */
export function deploymentLine(name, record) {
  const status = record?.status ?? "unknown"
  const commit = typeof record?.commit === "string" ? record.commit.slice(0, 7) : null
  return commit ? `${name}: ${status} (${commit})` : `${name}: ${status}`
}

/** Finished, failed or cancelled means Coolify has stopped working on it. */
export function deploymentOver(status) {
  return status === "finished" || status === "failed" || status === "cancelled"
}

async function coolify(settings, method, route) {
  const response = await fetch(`${settings.url}/api/v1${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/json",
    },
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) {
    throw new Error(
      `Coolify answered ${response.status} to ${method} ${route}: ${typeof body === "string" ? body : JSON.stringify(body)}`
    )
  }
  return body
}

async function settingsFromEnv() {
  const fromFile = { ...(await envFile(".env.local")), ...(await envFile(".env.live")) }
  const read = (key) => process.env[key] || fromFile[key] || DEFAULTS[key] || null
  const token = read("COOLIFY_API_TOKEN")
  if (!token) {
    console.error(
      "COOLIFY_API_TOKEN is not set. Put it in apps/trade/.env.live as COOLIFY_API_TOKEN=... (the file is gitignored)."
    )
    process.exit(1)
  }
  return {
    url: read("COOLIFY_URL").replace(/\/+$/, ""),
    token,
    uuids: {
      engine: read("COOLIFY_TRADE_ENGINE"),
      worker: read("COOLIFY_TRADE_WORKER"),
      web: read("COOLIFY_TRADE_WEB"),
    },
  }
}

/**
 * The last lines Coolify wrote for a build, so a failure says why on this
 * screen instead of sending somebody to the Coolify page. Coolify keeps the
 * log as a JSON list of entries; anything else is shown as it came.
 */
export function buildLogTail(logs, count = 40) {
  if (typeof logs !== "string" || !logs.trim()) return []
  let entries
  try {
    entries = JSON.parse(logs)
  } catch {
    return logs.split("\n").slice(-count)
  }
  if (!Array.isArray(entries)) return [String(logs)].slice(-count)
  return entries
    .filter((entry) => entry && !entry.hidden && typeof entry.output === "string")
    .map((entry) => entry.output.replace(/\s+$/, ""))
    .filter(Boolean)
    .slice(-count)
}

async function waitForDeployment(settings, name, deploymentUuid) {
  const startedAt = Date.now()
  let lastSaid = null
  while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
    const record = await coolify(settings, "GET", `/deployments/${deploymentUuid}`)
    const line = deploymentLine(name, record)
    if (line !== lastSaid) {
      console.log(`  ${line}`)
      lastSaid = line
    }
    if (deploymentOver(record?.status)) {
      if (record?.status !== "finished") {
        const tail = buildLogTail(record?.logs)
        if (tail.length) {
          console.error(`\n  Last lines of the ${name} build log (deployment ${deploymentUuid}):`)
          for (const one of tail) console.error(`  | ${one}`)
        } else {
          console.error(`  Coolify kept no log lines for deployment ${deploymentUuid}; open it in Coolify.`)
        }
      }
      return record?.status
    }
    await new Promise((done) => setTimeout(done, POLL_EVERY_MS))
  }
  throw new Error(`${name}: still building after ${GIVE_UP_AFTER_MS / 60_000} minutes; look at Coolify.`)
}

async function main() {
  const flags = readFlags(process.argv.slice(2))
  const settings = await settingsFromEnv()
  const apps = appsToDeploy(flags.only)

  // Name each app from Coolify's own list first, so a wrong uuid is said
  // before anything is rebuilt.
  const listed = await coolify(settings, "GET", "/applications")
  const byUuid = new Map((Array.isArray(listed) ? listed : []).map((app) => [app.uuid, app]))
  for (const name of apps) {
    const uuid = settings.uuids[name]
    const app = byUuid.get(uuid)
    if (!app) {
      console.error(`No Coolify app with uuid ${uuid} for ${name}. Set COOLIFY_TRADE_${name.toUpperCase()} in .env.live.`)
      process.exit(1)
    }
    console.log(`${name}: "${app.name}" (${uuid})`)
  }

  for (const name of apps) {
    const uuid = settings.uuids[name]
    console.log(`\nDeploying ${name}${flags.force ? " without cache" : ""}…`)
    const started = await coolify(
      settings,
      "POST",
      `/deploy?uuid=${encodeURIComponent(uuid)}&force=${flags.force ? "true" : "false"}`
    )
    const deployment = started?.deployments?.find((one) => one.resource_uuid === uuid) ?? started?.deployments?.[0]
    const deploymentUuid = deployment?.deployment_uuid
    if (!deploymentUuid) {
      console.error(`Coolify did not start a deployment for ${name}: ${JSON.stringify(started)}`)
      process.exit(1)
    }
    if (deployment.message) console.log(`  ${deployment.message}`)
    console.log(`  deployment ${deploymentUuid}`)
    const status = await waitForDeployment(settings, name, deploymentUuid)
    if (status !== "finished") {
      console.error(`\n${name} ${status}. Stopping here so the other apps keep the build they have.`)
      process.exit(1)
    }
  }
  console.log(`\nDone: ${apps.join(", ")} now run the same build.`)
}

// Only run when invoked directly; tests import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
