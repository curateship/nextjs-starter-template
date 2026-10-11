/**
 * Puts a sample team on the LOCAL database so Project's screens have something
 * on them: one team owned by the account you name, three made-up teammates,
 * two projects, twenty tasks across every status, and three weeks of morning
 * check-ins and five meetings, so the check-in's carry-over step, the Team
 * dashboard's calendar, check-ins and meetings, and task history all have
 * something to show.
 *
 *     node scripts/project-sample-data.mjs you@example.com
 *
 * - It refuses any database that isn't on this machine.
 * - It refuses if the account you name is already on a team.
 * - The made-up teammates have no password, so nobody can sign in as them.
 * - The team uses this machine's time zone, so "today" is your today.
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
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  // Everyone joined four weeks ago, before the first sample check-in.
  const joinedAt = new Date(now.getTime() - 28 * day)
  await client.query(
    `INSERT INTO project_teams (id, name, checkin_time, time_zone, work_days, created_at, updated_at)
     VALUES ($1, 'Sample team', '09:00', $3, '{1,2,3,4,5}', $2, $2)`,
    [teamId, now, zone]
  )
  await client.query(
    "INSERT INTO project_team_members (team_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', $3)",
    [teamId, owner.id, joinedAt]
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
      [teamId, id, role, joinedAt]
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

  const tasks = new Map()
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
    let position = 0
    for (const [title, status, assignee, giver, waiting, due, [done, total], stuck] of tasksByProject[index]) {
      const taskId = randomUUID()
      position += 1
      // A Done task finished three times as many days ago as its due date
      // passed, so "Cookie banner" (due a week ago) is three weeks old and
      // waits behind the Board's "Show older".
      const finishedAt =
        status === "done" ? new Date(now.getTime() - Math.abs(due ?? 1) * 3 * day) : null
      await client.query(
        `INSERT INTO project_tasks (id, project_id, title, notes, status, stuck_reason, assignee_user_id,
           assigned_by_user_id, accepted_at, due_date, created_by_user_id, created_at, updated_at,
           position, completed_at)
         VALUES ($1, $2, $3, '', $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13)`,
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
          position,
          finishedAt,
        ]
      )
      tasks.set(title, { id: taskId, projectId, title })
      // The hand-over the task's history starts with.
      if (assignee && giver && assignee.id !== giver.id) {
        const handedAt = new Date(now.getTime() - 22 * day)
        await client.query(
          `INSERT INTO project_task_events (id, task_id, kind, actor_user_id, target_user_id, created_at)
           VALUES ($1, $2, 'handed_over', $3, $4, $5)`,
          [randomUUID(), taskId, giver.id, assignee.id, handedAt]
        )
        if (!waiting) {
          await client.query(
            `INSERT INTO project_task_events (id, task_id, kind, actor_user_id, created_at)
             VALUES ($1, $2, 'accepted', $3, $4)`,
            [randomUUID(), taskId, assignee.id, new Date(handedAt.getTime() + 3600 * 1000)]
          )
        }
      }
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

  const checkins = await addCheckins({ teamId, zone, people: { me, maya, leo, priya }, tasks })
  await addMeetings({ teamId, zone, people: { me, maya, leo, priya } })

  await client.query("COMMIT")
  console.log(
    `Made "Sample team" for ${ownerEmail}: 3 made-up teammates, 2 projects, 20 tasks, ${checkins} days of check-ins, 5 meetings.`
  )
} catch (error) {
  await client.query("ROLLBACK")
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.end()
}

/**
 * Three weeks of check-ins. Work days count back from today: 1 is the last
 * work day before today, 15 the first. Each entry is a task, the work days it
 * was picked on, and its status at the end of each of those days. "Set up
 * redirects" is picked on the last five work days, so it shows "Picked on 5
 * days". Your own last check-in leaves two tasks unfinished, so the check-in
 * page opens with them. On a work day, Maya and Leo have already checked in
 * today (Leo late) and Priya hasn't.
 */
async function addCheckins({ teamId, zone, people, tasks }) {
  const { me, maya, leo, priya } = people
  const plan = new Map([
    [me.id, {
      picks: [
        ["Footer links", [6, 5], ["doing", "done"]],
        ["Contact form", [2, 1], ["doing", "doing"]],
        ["Partner announcement", [1], ["todo"]],
      ],
      drops: [],
      minutes: () => -4,
      today: null,
    }],
    [maya.id, {
      picks: [
        ["Cookie banner", [15, 14], ["doing", "done"]],
        ["Order the stickers", [12, 11], ["doing", "done"]],
        ["Thank-you notes", [9], ["todo"]],
        ["Set up redirects from the old site", [5, 4, 3, 2, 1], ["doing", "doing", "doing", "stuck", "stuck"]],
      ],
      drops: [["Thank-you notes", 8, "Waiting until after the launch"]],
      minutes: () => -8,
      today: { minutes: -8, carried: [], fresh: ["Thank-you notes"] },
    }],
    [leo.id, {
      picks: [
        ["Choose the fonts", [13, 12], ["doing", "done"]],
        ["Support rota", [8], ["done"]],
        ["Write the homepage copy", [5, 4], ["doing", "doing"]],
        ["Load speed check", [3], ["todo"]],
        ["Book the photographer", [2, 1], ["doing", "stuck"]],
      ],
      drops: [
        ["Write the homepage copy", 3, "Maya wants the photos first"],
        ["Load speed check", 2, "Maya is taking this one"],
      ],
      minutes: (index) => (index % 3 === 0 ? 25 : 2),
      today: { minutes: 35, carried: ["Book the photographer"], fresh: ["Write the homepage copy"] },
    }],
    [priya.id, {
      picks: [
        ["Launch email", [10, 9], ["doing", "doing"]],
        ["Social posts for the week", [7, 6, 5], ["doing", "doing", "doing"]],
      ],
      drops: [],
      minutes: () => 3,
      missed: [4],
      today: null,
    }],
  ])

  const today = localDay(new Date(), zone)
  const workDays = []
  const daysOff = []
  for (let back = 1; workDays.length < 15; back++) {
    const date = shiftDay(today, -back)
    if (isWorkDay(date)) workDays.push(date)
    else daysOff.push(date)
  }
  let written = 0

  for (const [userId, person] of plan) {
    for (const date of daysOff) {
      await insertDay({ teamId, userId, date, zone, workDay: false, minutes: null, closed: true })
      written++
    }
    for (const [position, date] of workDays.entries()) {
      const index = position + 1
      if (person.missed?.includes(index)) {
        await insertDay({ teamId, userId, date, zone, workDay: true, minutes: null, closed: true })
        written++
        continue
      }
      const checkinId = await insertDay({
        teamId, userId, date, zone, workDay: true, minutes: person.minutes(index), closed: true,
      })
      written++
      for (const [title, days, statuses] of person.picks) {
        const at = days.indexOf(index)
        if (at === -1) continue
        await insertItem(checkinId, tasks.get(title), {
          kind: "pick",
          carriedOver: days.includes(index + 1),
          endStatus: statuses[at],
        })
      }
      for (const [title, onDay, reason] of person.drops) {
        if (onDay === index) await insertItem(checkinId, tasks.get(title), { kind: "drop", reason })
      }
    }
    if (person.today && isWorkDay(today)) {
      const checkinId = await insertDay({
        teamId, userId, date: today, zone, workDay: true, minutes: person.today.minutes, closed: false,
      })
      written++
      for (const title of person.today.carried) {
        await insertItem(checkinId, tasks.get(title), { kind: "pick", carriedOver: true })
      }
      for (const title of person.today.fresh) {
        await insertItem(checkinId, tasks.get(title), { kind: "pick", carriedOver: false })
      }
    }
  }
  return written
}

/**
 * The meetings from Tyler's mockup: Weekly planning on Mondays, Design review
 * on Wednesdays, Sprint retro every other Friday, all starting four weeks
 * back, and a 1:1 with Maya and an All-hands next week.
 */
async function addMeetings({ teamId, zone, people }) {
  const { me, maya, leo, priya } = people
  const today = localDay(new Date(), zone)
  const weekday = (date) => {
    const [year, month, dayOfMonth] = date.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay()
  }
  // The Monday four weeks before this week's, and next week's Monday.
  const thisMonday = shiftDay(today, -((weekday(today) + 6) % 7))
  const firstMonday = shiftDay(thisMonday, -28)
  const nextMonday = shiftDay(thisMonday, 7)
  const everyone = [me, maya, leo, priya]
  const meetings = [
    ["Weekly planning", "blue", firstMonday, "10:00", "10:45", "week", "https://meet.google.com/abc-defg-hij", everyone],
    ["Design review", "green", shiftDay(firstMonday, 2), "14:00", "14:30", "week", "https://zoom.us/j/5551234567", [me, maya, leo]],
    ["Sprint retro", "orange", shiftDay(firstMonday, 4), "15:00", "15:45", "two_weeks", "https://teams.microsoft.com/l/meetup-join/sample", everyone],
    ["1:1 Maya", "slate", shiftDay(nextMonday, 2), "11:00", "11:30", null, null, [me, maya]],
    ["All-hands", "violet", shiftDay(nextMonday, 3), "16:00", "17:00", null, "https://meet.google.com/xyz-abcd-efg", everyone],
  ]
  for (const [title, color, day, start, end, repeat, videoUrl, invited] of meetings) {
    const id = randomUUID()
    await client.query(
      `INSERT INTO project_meetings (id, team_id, title, color, day, start_time, end_time, time_zone,
         repeat_every, video_url, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())`,
      [id, teamId, title, color, day, start, end, zone, repeat, videoUrl, me.id]
    )
    for (const person of invited) {
      await client.query("INSERT INTO project_meeting_people (meeting_id, user_id) VALUES ($1, $2)", [id, person.id])
    }
  }
}

async function insertDay({ teamId, userId, date, zone, workDay, minutes, closed }) {
  const id = randomUUID()
  // Today's check-in is never later than now.
  await client.query(
    `INSERT INTO project_checkins
       (id, team_id, user_id, day, time_zone, work_day, due_at, checked_in_at, closed_at, created_at)
     SELECT $1::text, $2::text, $3::text, $4::date, $5::text, $6::boolean, due, checked,
       $7::timestamptz, coalesce(checked, now())
     FROM (SELECT ($4::date + time '09:00') AT TIME ZONE $5::text AS due) d
     CROSS JOIN LATERAL (
       SELECT CASE WHEN $8::int IS NULL THEN NULL
         ELSE least(d.due + make_interval(mins => $8::int), now()) END AS checked
     ) c`,
    [id, teamId, userId, date, zone, workDay, closed ? new Date() : null, minutes]
  )
  return id
}

async function insertItem(checkinId, task, { kind, carriedOver = false, endStatus = null, reason = null }) {
  await client.query(
    `INSERT INTO project_checkin_items
       (id, checkin_id, task_id, project_id, task_title, kind, carried_over, reason, end_status, created_at)
     SELECT $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::boolean, $8::text, $9::text,
       checked_in_at
     FROM project_checkins WHERE id = $2::text`,
    [randomUUID(), checkinId, task.id, task.projectId, task.title, kind, carriedOver, reason, endStatus]
  )
}

function localDay(at, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

function shiftDay(date, count) {
  const [year, month, dayOfMonth] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, dayOfMonth + count)).toISOString().slice(0, 10)
}

function isWorkDay(date) {
  const [year, month, dayOfMonth] = date.split("-").map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay()
  return weekday >= 1 && weekday <= 5
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
