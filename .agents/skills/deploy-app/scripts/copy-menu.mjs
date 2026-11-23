/**
 * Make the local left menu the same as the live one. Live wins: Tyler edits
 * the menu on the live site, and the laptop follows it (2 Nov 2026, after
 * every deploy had been putting the laptop's default menu back over his live
 * edits since 8 Oct 2026).
 *
 *   node .agents/skills/deploy-app/scripts/copy-menu.mjs pomodoro
 *   node .agents/skills/deploy-app/scripts/copy-menu.mjs pomodoro --dry-run
 *
 * `deploy.mjs` runs this by itself after every deploy that includes the
 * website. Run it by hand to bring the laptop up to date without a deploy.
 *
 * The menu is saved data, not code, so a deploy alone never changes it:
 *
 * - **The admin menu** is the `sections`, `topRightNavigation` and `name` of
 *   the workspace Tyler's account points at (`users.current_workspace_id`).
 * - **The members' menu** is `memberSections` and `memberTopRightNavigation`
 *   in the one `settings` row.
 *
 * It reads both from the live database, then writes them over the ones in
 * the local database in `apps/<app>/.env.local`, matched by
 * `FIRST_ADMIN_EMAIL`. Nothing is ever written to live, and every other saved
 * setting on the laptop stays as it is.
 */

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

/** Only the keys `pick` names that hold a saved list. Missing ones are left alone on the laptop. */
export function pickLists(settings, keys) {
  const picked = {}
  for (const key of keys) if (Array.isArray(settings?.[key])) picked[key] = settings[key]
  return picked
}

/** "[Title] Label, Label" per section, so a person can compare two menus by eye. */
export function describeSections(sections) {
  return (sections ?? []).map((one) => `[${one.title}] ${(one.entries ?? []).map((entry) => entry.label ?? entry.id).join(", ")}`).join("  ")
}

/** The admin and members' menus as one database holds them. */
async function readMenu(client, email, where) {
  const workspace = (await client.query(ADMIN_WORKSPACE_SQL, [email])).rows[0]
  if (!workspace) throw new Error(`${email} has no current workspace in the ${where} database.`)
  const shared = (await client.query("select settings from settings where key = 'default'")).rows[0]?.settings ?? {}
  return { workspace, shared, admin: pickLists(workspace.settings, ADMIN_KEYS), members: pickLists(shared, MEMBER_KEYS) }
}

/** Copies the live menu to the local database. Returns what changed, for the deploy report. */
export async function copyMenu(appName, { dryRun = false } = {}) {
  const secrets = await readSecrets()
  const email = secrets.FIRST_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error(`FIRST_ADMIN_EMAIL must be in ${SECRETS_FILE}.`)

  const live = await withLiveDatabase(appName, (client) => readMenu(client, email, "live"))
  console.log(`Live admin menu:  ${describeSections(live.admin.sections)}`)

  const env = parseEnvText(await readFile(path.join(repoRoot, "apps", appName, ".env.local"), "utf8"))
  const { Client } = requireFromApp(appName)("pg")
  const client = new Client({ connectionString: env.CUSTOM_SHELL_DATABASE_URL, connectionTimeoutMillis: 5_000 })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(`Could not reach the local database (${error instanceof Error ? error.message : error}). Is the app's local Postgres running?`)
  }
  try {
    const local = await readMenu(client, email, "local")
    console.log(`Local admin menu: ${describeSections(local.admin.sections)}`)
    const adminSame =
      local.workspace.name === live.workspace.name &&
      ADMIN_KEYS.every((key) => !(key in live.admin) || JSON.stringify(local.admin[key]) === JSON.stringify(live.admin[key]))
    const membersSame = MEMBER_KEYS.every(
      (key) => !(key in live.members) || JSON.stringify(local.members[key]) === JSON.stringify(live.members[key])
    )
    console.log(`Admin menu: ${adminSame ? "already the same" : "differs"}. Members' menu: ${membersSame ? "already the same" : "differs"}.`)
    if (dryRun || (adminSame && membersSame)) return { adminChanged: false, membersChanged: false }

    await client.query("begin")
    try {
      if (!adminSame) {
        await client.query(
          "update workspaces set name = $2, settings = coalesce(settings, '{}'::jsonb) || $3::jsonb, updated_at = now() where id = $1",
          [local.workspace.id, live.workspace.name, JSON.stringify(live.admin)]
        )
      }
      if (!membersSame) {
        await client.query(
          `insert into settings (key, settings, created_at, updated_at) values ('default', $1::jsonb, now(), now())
           on conflict (key) do update set settings = settings.settings || excluded.settings, updated_at = now()`,
          [JSON.stringify(live.members)]
        )
      }
      await client.query("commit")
    } catch (error) {
      await client.query("rollback").catch(() => {})
      throw error
    }
    console.log(`Copied to local: ${[!adminSame && "admin menu", !membersSame && "members' menu"].filter(Boolean).join(" and ")}.`)
    return { adminChanged: !adminSame, membersChanged: !membersSame }
  } finally {
    await client.end()
  }
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
