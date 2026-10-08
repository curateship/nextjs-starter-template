/**
 * Make a live app's left menu the same as the local one.
 *
 *   node .agents/skills/deploy-app/scripts/copy-menu.mjs pomodoro
 *   node .agents/skills/deploy-app/scripts/copy-menu.mjs pomodoro --dry-run
 *
 * `deploy.mjs` runs this by itself after every deploy that includes the
 * website. Run it by hand after changing the menu locally without a deploy.
 *
 * The menu is saved data, not code, so a deploy alone never changes it:
 *
 * - **The admin menu** is the `sections`, `topRightNavigation` and `name` of
 *   the workspace Tyler's account points at (`users.current_workspace_id`).
 * - **The members' menu** is `memberSections` and `memberTopRightNavigation`
 *   in the one `settings` row.
 *
 * It reads both from the local database in `apps/<app>/.env.local`, then
 * writes them over the live ones, matched by `FIRST_ADMIN_EMAIL`. Every other
 * saved setting on live stays as it is. Before writing, it lists any menu link
 * whose page is not in the commit `develop` holds, because that link would open
 * a "not found" page on the live site.
 */

import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parseEnvText, SECRETS_FILE } from "./deploy.mjs"
import { readSecrets, repoRoot, requireFromApp, withLiveDatabase } from "./live-db.mjs"

const ADMIN_KEYS = ["sections", "topRightNavigation"]
const MEMBER_KEYS = ["memberSections", "memberTopRightNavigation"]

export const ADMIN_WORKSPACE_SQL = `select w.id, w.name, w.settings
from users u join workspaces w on w.id = u.current_workspace_id
where u.email = $1`

/** Only the keys `pick` names that hold a saved list. Missing ones are left alone on live. */
export function pickLists(settings, keys) {
  const picked = {}
  for (const key of keys) if (Array.isArray(settings?.[key])) picked[key] = settings[key]
  return picked
}

/** Every `href` anywhere in the menu, once each. */
export function menuHrefs(menu) {
  const found = new Set()
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== "object") return
    if (typeof value.href === "string") found.add(value.href)
    Object.values(value).forEach(walk)
  }
  walk(menu)
  return [...found]
}

/** The page addresses in a TanStack `routeTree.gen.ts`. */
export function routePaths(routeTreeText) {
  return [...new Set([...routeTreeText.matchAll(/fullPath: '([^']+)'/g)].map((match) => match[1]))]
}

/**
 * Menu links with no page behind them. `$id` in a route matches any one part,
 * a lone `$` matches the rest, and links to other sites are never flagged.
 */
export function missingPages(hrefs, paths) {
  const patterns = paths.map((one) => {
    const trimmed = one.length > 1 ? one.replace(/\/$/, "") : one
    const source = trimmed
      .split("/")
      .map((part) => (part === "$" ? ".*" : part.startsWith("$") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/")
    return new RegExp(`^${source}$`)
  })
  return hrefs.filter((href) => {
    if (!href.startsWith("/")) return false
    const bare = href.split(/[?#]/)[0].replace(/(.)\/$/, "$1")
    return !patterns.some((pattern) => pattern.test(bare))
  })
}

/** "[Title] Label, Label" per section, so a person can compare two menus by eye. */
export function describeSections(sections) {
  return (sections ?? []).map((one) => `[${one.title}] ${(one.entries ?? []).map((entry) => entry.label ?? entry.id).join(", ")}`).join("  ")
}

async function readLocalMenu(appName, email) {
  const local = parseEnvText(await readFile(path.join(repoRoot, "apps", appName, ".env.local"), "utf8"))
  const { Client } = requireFromApp(appName)("pg")
  const client = new Client({ connectionString: local.CUSTOM_SHELL_DATABASE_URL, connectionTimeoutMillis: 5_000 })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(`Could not reach the local database (${error instanceof Error ? error.message : error}). Is the app's local Postgres running?`)
  }
  try {
    const workspace = (await client.query(ADMIN_WORKSPACE_SQL, [email])).rows[0]
    if (!workspace) throw new Error(`${email} has no current workspace in the local database.`)
    const shared = (await client.query("select settings from settings where key = 'default'")).rows[0]?.settings ?? {}
    return { name: workspace.name, admin: pickLists(workspace.settings, ADMIN_KEYS), members: pickLists(shared, MEMBER_KEYS) }
  } finally {
    await client.end()
  }
}

function shippedRoutes(appName) {
  try {
    execFileSync("git", ["fetch", "--quiet", "origin", "develop"], { cwd: repoRoot })
    return routePaths(execFileSync("git", ["show", `origin/develop:apps/${appName}/src/routeTree.gen.ts`], { cwd: repoRoot, encoding: "utf8" }))
  } catch {
    return null
  }
}

/** Copies the local menu to live. Returns what changed, for the deploy report. */
export async function copyMenu(appName, { dryRun = false } = {}) {
  const secrets = await readSecrets()
  const email = secrets.FIRST_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error(`FIRST_ADMIN_EMAIL must be in ${SECRETS_FILE}.`)

  const menu = await readLocalMenu(appName, email)
  console.log(`Local admin menu: ${describeSections(menu.admin.sections)}`)

  const routes = shippedRoutes(appName)
  if (!routes) console.log("Could not read develop's route list, so links were not checked.")
  else {
    const missing = missingPages(menuHrefs([menu.admin, menu.members]), routes)
    if (missing.length) console.log(`WARNING: these menu links have no page on develop yet, so live shows "not found": ${missing.join(", ")}`)
  }

  return withLiveDatabase(appName, async (client) => {
    const workspace = (await client.query(ADMIN_WORKSPACE_SQL, [email])).rows[0]
    if (!workspace) throw new Error(`${email} has no current workspace on live. Run create-admin.mjs and sign in once first.`)
    const shared = (await client.query("select settings from settings where key = 'default'")).rows[0]?.settings ?? {}
    const adminSame = workspace.name === menu.name && ADMIN_KEYS.every((key) => !(key in menu.admin) || JSON.stringify(workspace.settings?.[key]) === JSON.stringify(menu.admin[key]))
    const membersSame = MEMBER_KEYS.every((key) => !(key in menu.members) || JSON.stringify(shared[key]) === JSON.stringify(menu.members[key]))
    console.log(`Live admin menu:  ${describeSections(workspace.settings?.sections)}`)
    console.log(`Admin menu: ${adminSame ? "already the same" : "differs"}. Members' menu: ${membersSame ? "already the same" : "differs"}.`)
    if (dryRun || (adminSame && membersSame)) return { adminChanged: false, membersChanged: false }

    await client.query("begin")
    try {
      if (!adminSame) {
        await client.query(
          "update workspaces set name = $2, settings = coalesce(settings, '{}'::jsonb) || $3::jsonb, updated_at = now() where id = $1",
          [workspace.id, menu.name, JSON.stringify(menu.admin)]
        )
      }
      if (!membersSame) {
        await client.query(
          `insert into settings (key, settings, created_at, updated_at) values ('default', $1::jsonb, now(), now())
           on conflict (key) do update set settings = settings.settings || excluded.settings, updated_at = now()`,
          [JSON.stringify(menu.members)]
        )
      }
      await client.query("commit")
    } catch (error) {
      await client.query("rollback").catch(() => {})
      throw error
    }
    console.log(`Copied to live: ${[!adminSame && "admin menu", !membersSame && "members' menu"].filter(Boolean).join(" and ")}.`)
    return { adminChanged: !adminSame, membersChanged: !membersSame }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const appName = args.find((one) => !one.startsWith("--"))
  ;(appName ? copyMenu(appName, { dryRun: args.includes("--dry-run") }) : Promise.reject(new Error("Name the app, for example: copy-menu.mjs pomodoro")))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
