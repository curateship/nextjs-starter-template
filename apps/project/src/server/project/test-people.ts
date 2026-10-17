import { eq } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { EMPLOYEE_ROLE } from "@/server/project/invites"
import { projectTeamMembers } from "@/server/project/schema"
import { giveStarterTasks } from "@/server/project/starter-tasks"
import { addProjectMember, createProject } from "@/server/project/projects"
import { createTeam, type TeamSummary } from "@/server/project/teams"
import { joinWholeTeamProjects } from "@/server/project/whole-team"
import { insertUser } from "@/server/test-support"
import { customShellUsers, type CustomShellUser } from "@/server/schema"

/**
 * The people Project's tests need: the site admin, who runs every team
 * without being on one, and employees, who do the work. Nothing outside a
 * test imports this file.
 */

/** A site admin: an account with the shell's `admin` role. */
export async function insertSiteAdmin(
  database: CustomShellDb,
  overrides: Partial<typeof customShellUsers.$inferInsert> = {}
): Promise<CustomShellUser> {
  return insertUser(database, {
    name: "Tyler",
    email: `admin-${uuid().slice(0, 8)}@example.test`,
    role: "admin",
    ...overrides,
  })
}

/** An employee who isn't on a team yet. */
export async function insertEmployee(
  database: CustomShellDb,
  overrides: Partial<typeof customShellUsers.$inferInsert> = {}
): Promise<CustomShellUser> {
  return insertUser(database, { role: EMPLOYEE_ROLE, ...overrides })
}

/**
 * Puts someone on a team the way an invite does: they become an employee, get
 * the team's starter tasks and join its whole-team projects.
 */
export async function joinTeam(database: CustomShellDb, teamId: string, person: CustomShellUser) {
  await database.update(customShellUsers).set({ role: EMPLOYEE_ROLE }).where(eq(customShellUsers.id, person.id))
  await database.transaction(async (tx) => {
    await tx.insert(projectTeamMembers).values({ teamId, userId: person.id, role: "member", joinedAt: now() })
    await giveStarterTasks(teamId, person.id, tx)
    await joinWholeTeamProjects(teamId, person.id, tx)
  })
}

/**
 * A team made by a site admin, with these people on it as employees. A site
 * admin is made for it unless one is given; the admin's team picker ends on
 * this team.
 */
export async function startTeam(
  database: CustomShellDb,
  people: CustomShellUser[],
  { name = "Acme", admin }: { name?: string; admin?: CustomShellUser } = {}
): Promise<{ team: TeamSummary; admin: CustomShellUser }> {
  const siteAdmin = admin ?? (await insertSiteAdmin(database))
  const team = await createTeam(siteAdmin.id, { name, timeZone: "UTC" }, database)
  for (const person of people) await joinTeam(database, team.id, person)
  return { team, admin: siteAdmin }
}

/**
 * A project the site admin makes for someone, who is put on it straight away.
 * Only the site admin makes projects (Tyler, 16 Oct 2026), and isn't on them,
 * so this stands in for "Anna makes a project and is its first member".
 */
export async function projectFor(
  admin: CustomShellUser,
  personId: string,
  input: Parameters<typeof createProject>[1],
  database: CustomShellDb
): Promise<{ id: string }> {
  const made = await createProject(admin.id, input, database)
  if (personId !== admin.id) await addProjectMember(admin.id, made.id, personId, database)
  return made
}
