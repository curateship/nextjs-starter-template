/**
 * Deploy one app's Coolify resources, then check the live health address.
 *
 *   npm run deploy                     inside apps/<app>, same as --push
 *   node .agents/skills/deploy-app/scripts/deploy.mjs pomodoro --push
 *   node .agents/skills/deploy-app/scripts/deploy.mjs pomodoro --dry-run
 *   node .agents/skills/deploy-app/scripts/deploy.mjs pomodoro --only worker
 *   node .agents/skills/deploy-app/scripts/deploy.mjs pomodoro --in-order
 *   node .agents/skills/deploy-app/scripts/deploy.mjs pomodoro --force
 *
 * `--push` first pushes this branch to `develop` (fast-forward only), because
 * every resource builds whatever `develop` is when its button is pressed.
 * Without it, the script refuses to start when this branch and `develop`
 * differ.
 *
 * Both resources build at the same time, unless the release carries a new
 * database migration (`apps/<app>/drizzle/` changed since the live commit) or
 * the live commit is unknown. Then the website goes first, because it applies
 * the migrations on its way in, and the worker follows once it is healthy.
 * `--in-order` always does it that way.
 *
 * Each app's resources, order, Coolify server and health address are in
 * `apps.json` beside this folder. The Coolify address and token come from
 * `~/.config/deploy-app/secrets.env` (`COOLIFY_<SERVER>_URL`,
 * `COOLIFY_<SERVER>_TOKEN`), or from the same names in the environment, which
 * win. The token is never printed.
 *
 * Nothing here runs on its own. It is a button: somebody types the command.
 */

import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
/** Git runs here, not where the command was typed: `npm run deploy` starts in apps/<app>. */
const repoRoot = path.resolve(here, "..", "..", "..", "..")

const POLL_EVERY_MS = 10_000
const GIVE_UP_AFTER_MS = 25 * 60_000
const HEALTH_TRIES = 12
const HEALTH_GAP_MS = 10_000

/**
 * `npm run deploy` inside an app passes no app name, so npm's own
 * `npm_package_name` (the app's folder name, see the root Dockerfile) fills it.
 */
export function readFlags(argv, packageName = null) {
  const flags = { app: null, only: null, force: false, dryRun: false, push: false, inOrder: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--force") flags.force = true
    else if (arg === "--dry-run") flags.dryRun = true
    else if (arg === "--push") flags.push = true
    else if (arg === "--in-order") flags.inOrder = true
    else if (arg === "--only") flags.only = argv[++i] ?? ""
    else if (arg.startsWith("--only=")) flags.only = arg.slice(7)
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`)
    else if (!flags.app) flags.app = arg
    else throw new Error(`One app at a time; also got "${arg}".`)
  }
  flags.app ||= packageName
  if (!flags.app) throw new Error("Name the app, for example: deploy.mjs pomodoro, or run npm run deploy inside it")
  if (flags.only === "") throw new Error("--only needs a list, for example --only web")
  return flags
}

/** The resources to deploy, in the app's fixed order, narrowed by `--only`. */
export function resourcesToDeploy(app, only) {
  const order = app.resources.map((one) => one.role)
  if (!only) return app.resources
  const wanted = only.split(",").map((one) => one.trim()).filter(Boolean)
  const unknown = wanted.filter((one) => !order.includes(one))
  if (unknown.length) {
    throw new Error(`Unknown resource ${unknown.join(", ")}. Choose from ${order.join(", ")}.`)
  }
  return app.resources.filter((one) => wanted.includes(one.role))
}

/**
 * Together or one after another. Together is only safe when no migration
 * ships, because a worker that starts first would meet the old database.
 */
export function deployPlan({ count, inOrder, liveCommit, migrations }) {
  if (count < 2) return { together: false, why: "one resource" }
  if (inOrder) return { together: false, why: "--in-order" }
  if (!liveCommit) return { together: false, why: "the live commit is unknown, so new migrations cannot be ruled out" }
  if (migrations.length) {
    return { together: false, why: `${migrations.length} new migration${migrations.length === 1 ? "" : "s"} (${migrations.slice(0, 3).join(", ")}), so the website goes first` }
  }
  return { together: true, why: "no new migrations since the live commit" }
}

/** Finished, failed or cancelled means Coolify has stopped working on it. */
export function deploymentOver(status) {
  return ["finished", "failed", "cancelled", "cancelled-by-user"].includes(status)
}

/** The last visible lines Coolify wrote for a build. Its log is a JSON list. */
export function buildLogTail(logs, count = 30) {
  if (typeof logs !== "string" || !logs.trim()) return []
  let entries
  try {
    entries = JSON.parse(logs)
  } catch {
    return logs.split("\n").slice(-count)
  }
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry) => entry && !entry.hidden && typeof entry.output === "string")
    .map((entry) => entry.output.replace(/\s+$/, ""))
    .filter(Boolean)
    .slice(-count)
}

/** `NAME=value` lines; blank lines and `#` comments skipped, quotes removed. */
export function parseEnvText(text) {
  const values = {}
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const at = line.indexOf("=")
    if (at < 1) continue
    let value = line.slice(at + 1).trim()
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1)
    values[line.slice(0, at).trim()] = value
  }
  return values
}

export const SECRETS_FILE = path.join(os.homedir(), ".config", "deploy-app", "secrets.env")

async function coolifySettings(server) {
  let saved = {}
  try {
    saved = parseEnvText(await readFile(SECRETS_FILE, "utf8"))
  } catch {
    // No file yet: the environment may still carry the values.
  }
  const name = (part) => `COOLIFY_${server.toUpperCase()}_${part}`
  const url = process.env[name("URL")] || saved[name("URL")]
  const token = process.env[name("TOKEN")] || saved[name("TOKEN")]
  if (!token || !url) {
    throw new Error(`No ${name("URL")} and ${name("TOKEN")} in ${SECRETS_FILE}. See the deploy-app skill's one-time setup.`)
  }
  return { url: url.replace(/\/+$/, ""), token }
}

async function coolify(settings, method, route) {
  const response = await fetch(`${settings.url}/api/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${settings.token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  })
  const text = await response.text()
  let body = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Keep the text as it came.
  }
  if (!response.ok) {
    throw new Error(`Coolify answered ${response.status} to ${method} ${route}: ${typeof body === "string" ? body : JSON.stringify(body)}`)
  }
  return body
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: repoRoot }).trim()
}

/** The migration files an app gained between two commits. */
export function migrationsBetween(from, to, app) {
  return git("diff", "--name-only", `${from}..${to}`, "--", `apps/${app}/drizzle/`)
    .split("\n")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => path.basename(file))
}

/**
 * What Coolify will build: `develop` on GitHub. `mismatch` says so when this
 * branch is somewhere else, which a real deploy refuses and a dry run reports.
 */
function developCommit() {
  git("fetch", "--quiet", "origin", "develop")
  const develop = git("rev-parse", "origin/develop")
  const head = git("rev-parse", "HEAD")
  return {
    line: `${develop.slice(0, 9)} ${git("log", "-1", "--format=%s", develop).slice(0, 90)}`,
    mismatch:
      develop === head
        ? null
        : `origin/develop is ${develop.slice(0, 9)} but this branch is ${head.slice(0, 9)}. Push first: git push origin HEAD:develop (fast-forward only).`,
  }
}

async function waitForDeployment(settings, label, deploymentUuid) {
  const startedAt = Date.now()
  let said = null
  while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
    const record = await coolify(settings, "GET", `/deployments/${deploymentUuid}`)
    const status = record?.status ?? "unknown"
    const line = `${label}: ${status} after ${Math.round((Date.now() - startedAt) / 1000)}s`
    if (status !== said) {
      console.log(`  ${line}`)
      said = status
    }
    if (deploymentOver(status)) {
      const tail = buildLogTail(record?.logs, status === "finished" ? 4 : 30)
      for (const one of tail) console.log(`  | ${one}`)
      return status
    }
    await new Promise((done) => setTimeout(done, POLL_EVERY_MS))
  }
  throw new Error(`${label}: still building after ${GIVE_UP_AFTER_MS / 60_000} minutes. Look at Coolify.`)
}

async function checkHealth(url) {
  for (let i = 1; i <= HEALTH_TRIES; i++) {
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) })
      const text = (await response.text()).slice(0, 120)
      if (response.ok) return `${response.status} ${text}`
      console.log(`  health try ${i}: ${response.status}`)
    } catch (error) {
      console.log(`  health try ${i}: ${error instanceof Error ? error.message : error}`)
    }
    await new Promise((done) => setTimeout(done, HEALTH_GAP_MS))
  }
  throw new Error(`${url} never answered 200.`)
}

/** The commit of the newest finished deployment of a resource, if any. */
async function liveCommit(settings, uuid) {
  const answer = await coolify(settings, "GET", `/deployments/applications/${uuid}?skip=0&take=10`)
  const list = Array.isArray(answer) ? answer : answer?.deployments ?? []
  const done = list.find((one) => one.status === "finished" && typeof one.commit === "string" && one.commit.length >= 7)
  return done?.commit ?? null
}

async function deployOne(settings, resource, force) {
  const started = await coolify(
    settings,
    "GET",
    `/deploy?uuid=${encodeURIComponent(resource.uuid)}&force=${force ? "true" : "false"}`
  )
  const deployment = started?.deployments?.find((one) => one.resource_uuid === resource.uuid) ?? started?.deployments?.[0]
  if (!deployment?.deployment_uuid) throw new Error(`Coolify did not start ${resource.role}: ${JSON.stringify(started)}`)
  console.log(`  ${resource.role}: deployment ${deployment.deployment_uuid}`)
  return deployment.deployment_uuid
}

async function main() {
  const flags = readFlags(process.argv.slice(2), process.env.npm_package_name || null)
  const apps = JSON.parse(await readFile(path.join(here, "..", "apps.json"), "utf8"))
  const app = apps[flags.app]
  if (!app) throw new Error(`No app "${flags.app}" in apps.json. Known: ${Object.keys(apps).join(", ")}.`)
  if (app.ownScript) throw new Error(`${flags.app} deploys with its own script: ${app.ownScript}`)

  const settings = await coolifySettings(app.server)
  const resources = resourcesToDeploy(app, flags.only)

  const dirty = git("status", "--porcelain")
  if (dirty) console.log("Note: uncommitted changes here do not ship. Coolify builds what is on GitHub.")
  if (flags.push && !flags.dryRun) {
    console.log("Pushing this branch to develop (fast-forward only)...")
    try {
      execFileSync("git", ["push", "origin", "HEAD:develop"], { stdio: "inherit", cwd: repoRoot })
    } catch {
      throw new Error("The push was refused: develop has commits this branch lacks. Nothing was deployed.")
    }
  }
  const commit = developCommit()
  console.log(`Building: ${commit.line}`)
  if (commit.mismatch && !flags.dryRun) throw new Error(commit.mismatch)
  if (commit.mismatch) console.log(`Warning: ${commit.mismatch}`)

  // Name every resource from Coolify's own list first, so a wrong uuid is
  // caught before anything is rebuilt.
  const listed = await coolify(settings, "GET", "/applications")
  const byUuid = new Map((Array.isArray(listed) ? listed : []).map((one) => [one.uuid, one]))
  for (const resource of resources) {
    const found = byUuid.get(resource.uuid)
    if (!found) throw new Error(`No Coolify app ${resource.uuid} (${resource.role}) on ${settings.url}.`)
    console.log(`${resource.role}: "${found.name}" (${resource.uuid}), now ${found.status}`)
  }

  const live = await liveCommit(settings, app.resources[0].uuid)
  let migrations = []
  if (live) {
    // A dry run has not pushed, so it measures what the push would ship.
    const target = git("rev-parse", commit.mismatch && flags.dryRun ? "HEAD" : "origin/develop")
    const shipping = git("rev-list", "--count", `${live}..${target}`)
    migrations = migrationsBetween(live, target, flags.app)
    console.log(`Live now: ${live.slice(0, 9)}. Shipping ${shipping} commit${shipping === "1" ? "" : "s"}.`)
  }
  const plan = deployPlan({ count: resources.length, inOrder: flags.inOrder, liveCommit: live, migrations })
  console.log(`Plan: ${resources.length > 1 ? (plan.together ? "both at the same time" : "one after another") : resources[0].role} (${plan.why}).`)

  if (flags.dryRun) {
    console.log("\nDry run: nothing deployed.")
    return
  }

  if (plan.together) {
    console.log(`\nDeploying ${resources.map((one) => one.role).join(" and ")} together${flags.force ? " without cache" : ""}...`)
    const started = []
    for (const resource of resources) started.push([resource, await deployOne(settings, resource, flags.force)])
    const results = await Promise.all(started.map(([resource, id]) => waitForDeployment(settings, resource.role, id)))
    const failed = started.map(([resource], i) => [resource.role, results[i]]).filter(([, status]) => status !== "finished").map(([role, status]) => `${role} ${status}`)
    if (failed.length) throw new Error(`${failed.join(", ")}. Look at Coolify before deploying again.`)
  } else {
    for (const resource of resources) {
      console.log(`\nDeploying ${resource.role}${flags.force ? " without cache" : ""}...`)
      const status = await waitForDeployment(settings, resource.role, await deployOne(settings, resource, flags.force))
      if (status !== "finished") throw new Error(`${resource.role} ${status}. Stopped, so the rest keep the build they have.`)
    }
  }

  if (app.healthUrl) console.log(`\nHealth ${app.healthUrl}: ${await checkHealth(app.healthUrl)}`)
  console.log(`\nDone: ${resources.map((one) => one.role).join(", ")} deployed.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
