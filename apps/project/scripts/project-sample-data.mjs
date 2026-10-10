/**
 * Puts a sample team on the LOCAL database so Project's screens have something
 * on them: one team owned by the account you name, three made-up teammates,
 * two projects and twenty tasks across every status.
 *
 *     node scripts/project-sample-data.mjs you@example.com
 *
 * - It refuses any database that isn't on this machine.
 * - It refuses if the account you name is already on a team.
 * - The made-up teammates have no password, so nobody can sign in as them.
 * - It makes no workspaces and touches no menus.
 */
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
await loadEnv(path.join(root, ".env.local"))

const ownerEmail = (process.argv[2] ?? "").trim().toLowerCase()
if (!ownerEmail) {
  console.error("Name the account that will own the sample team:\n  node scripts/project-sample-data.mjs you@example.com")
  process.exit(1)
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const databaseUrl =
  process.env.CUSTOM_SHELL_DATABASE_URL ||
  `postgresql://postgres:localdev@localhost:${process.env.CUSTOM_SHELL_POSTGRES_PORT || "54320"}/${packageJson.name}`
const host = new URL(databaseUrl).hostname
if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
  console.error(`Refusing: ${host} is not this machine. Sample data only goes on a local database.`)
  process.exit(1)
}

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()

try {
  await client.query("BEGIN")
  const owner = (
    await client.query("SELECT id, name FROM users WHERE lower(email) = $1", [ownerEmail])
  ).rows[0]
  if (!owner) throw new Error(`No account with the email ${ownerEmail}. Sign up first.`)
  const onTeam = await client.query("SELECT 1 FROM project_team_members WHERE user_id = $1", [owner.id])
  if (onTeam.rowCount) throw new Error(`${ownerEmail} is already on a team. Leave it first.`)

  const now = new Date()
  const day = 24 * 60 * 60 * 1000
  const dateKey = (offsetDays) => new Date(now.getTime() + offsetDays * day).toISOString().slice(0, 10)

  const teamId = randomUUID()
  await client.query(
    `INSERT INTO project_teams (id, name, checkin_time, time_zone, work_days, created_at, updated_at)
     VALUES ($1, 'Sample team', '09:00', 'UTC', '{1,2,3,4,5}', $2, $2)`,
    [teamId, now]
  )
  await client.query(
    "INSERT INTO project_team_members (team_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', $3)",
    [teamId, owner.id, now]
  )

  // Made-up teammates: no password, so nobody can sign in as them.
  const people = [{ id: owner.id, name: owner.name }]
  for (const [name, role] of [
    ["Maya Chen", "admin"],
    ["Leo Hart", "member"],
    ["Priya Rao", "member"],
  ]) {
    const id = randomUUID()
    const email = `${name.toLowerCase().replace(" ", ".")}.${id.slice(0, 6)}@sample.invalid`
    await client.query(
      `INSERT INTO users (id, email, name, role, status, email_verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'member', 'active', $4, $4, $4)`,
      [id, email, name, now]
    )
    await client.query(
      "INSERT INTO project_team_members (team_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)",
      [teamId, id, role, now]
    )
    people.push({ id, name })
  }
  const [me, maya, leo, priya] = people

  const projects = [
    { name: "Website redesign", color: "blue", description: "New marketing site before the spring launch.", members: [me, maya, leo] },
    { name: "Spring launch", color: "green", description: "Everything that has to be ready on launch day.", members: [me, maya, leo, priya] },
  ]
  // [title, status, assignee, handed out by, waiting, due in days, steps done/total, stuck reason]
  const tasksByProject = [
    [
      ["Write the homepage copy", "doing", leo, me, false, 3, [2, 4], null],
      ["Pick the photo set", "todo", maya, me, true, 5, [0, 0], null],
      ["Draw the pricing page", "todo", leo, maya, true, 9, [0, 3], null],
      ["Set up redirects from the old site", "stuck", maya, me, false, 1, [1, 2], "Waiting on the old site's page list"],
      ["Choose the fonts", "done", leo, leo, false, -4, [3, 3], null],
      ["Accessibility pass", "todo", null, null, false, 14, [0, 0], null],
      ["Contact form", "doing", me, me, false, -1, [1, 3], null],
      ["Cookie banner", "done", maya, me, false, -7, [0, 0], null],
      ["Load speed check", "todo", leo, me, false, null, [0, 0], null],
      ["Footer links", "done", me, me, false, -2, [0, 0], null],
    ],
    [
      ["Launch email", "doing", priya, me, false, 6, [1, 2], null],
      ["Press list", "todo", priya, maya, true, 8, [0, 0], null],
      ["Launch day checklist", "todo", me, maya, true, 10, [0, 5], null],
      ["Book the photographer", "stuck", leo, me, false, 2, [0, 0], "Both studios are booked that week"],
      ["Order the stickers", "done", maya, maya, false, -3, [0, 0], null],
      ["Update the help pages", "todo", null, null, false, 12, [0, 0], null],
      ["Social posts for the week", "doing", priya, me, false, 4, [3, 7], null],
      ["Partner announcement", "todo", me, priya, false, 7, [0, 0], null],
      ["Support rota", "done", leo, me, false, -1, [0, 0], null],
      ["Thank-you notes", "todo", maya, me, false, 20, [0, 0], null],
    ],
  ]

  for (const [index, project] of projects.entries()) {
    const projectId = randomUUID()
    await client.query(
      `INSERT INTO project_projects (id, team_id, name, color, description, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [projectId, teamId, project.name, project.color, project.description, me.id, now]
    )
    for (const member of project.members) {
      await client.query(
        "INSERT INTO project_project_members (project_id, user_id, added_at) VALUES ($1, $2, $3)",
        [projectId, member.id, now]
      )
    }
    for (const [title, status, assignee, giver, waiting, due, [done, total], stuck] of tasksByProject[index]) {
      const taskId = randomUUID()
      await client.query(
        `INSERT INTO project_tasks (id, project_id, title, notes, status, stuck_reason, assignee_user_id,
           assigned_by_user_id, accepted_at, due_date, created_by_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, '', $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [
          taskId,
          projectId,
          title,
          status,
          stuck,
          assignee?.id ?? null,
          assignee ? giver.id : null,
          assignee && !waiting ? now : null,
          due === null ? null : dateKey(due),
          giver?.id ?? me.id,
          now,
        ]
      )
      for (let step = 0; step < total; step++) {
        await client.query(
          `INSERT INTO project_task_steps (id, task_id, text, done, position, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), taskId, `Step ${step + 1}`, step < done, step, now]
        )
      }
      if (stuck && giver) {
        await client.query(
          `INSERT INTO project_task_comments (id, task_id, author_user_id, body, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), taskId, giver.id, "Thanks for flagging. I'll chase it today.", now]
        )
      }
    }
  }

  await client.query("COMMIT")
  console.log(`Made "Sample team" for ${ownerEmail}: 3 made-up teammates, 2 projects, 20 tasks.`)
} catch (error) {
  await client.query("ROLLBACK")
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.end()
}

async function loadEnv(file) {
  if (!existsSync(file)) return
  for (const rawLine of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}
