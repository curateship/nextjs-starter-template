import { eq, sql } from "drizzle-orm"

import { createDefaultMemberSections, type ShellSection } from "@/lib/custom-shell"
import { FITNESS_NAV_SECTION_ID, fitnessNavSection } from "@/lib/fitness/menu"
import { db, type CustomShellDb } from "@/server/db"
import { fitnessNavigationAdded } from "@/server/fitness/schema"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"

/**
 * Puts Programs and Exercises in the left menu.
 *
 * The shell keeps its menus in the database, not in code. Members share one
 * list on the settings row and an admin sees their workspace's own list, and
 * an app may not edit the shell code that writes either. So this job adds the
 * section itself, once per menu, and writes down that it did. An admin who
 * later removes a link in Settings, Navigation keeps it removed.
 *
 * It runs on the shell's background loop rather than in a migration because a
 * workspace's menu may not exist yet when migrations run. Project's
 * `src/server/project/navigation.ts` is the same job.
 */
export async function addFitnessNavigation(database: CustomShellDb = db) {
  const done = new Set(
    (await database.select({ scope: fitnessNavigationAdded.scope }).from(fitnessNavigationAdded)).map(
      (row) => row.scope
    )
  )
  if (!done.has("members")) await changeMemberMenu(database)
  const workspaces = await database.select({ id: customShellWorkspaces.id }).from(customShellWorkspaces)
  for (const workspace of workspaces) {
    const scope = `workspace:${workspace.id}`
    if (!done.has(scope)) await changeWorkspaceMenu(scope, workspace.id, database)
  }
}

/** The section goes first, ahead of whatever the menu already holds. */
function withFitnessSection(sections: unknown): ShellSection[] | null {
  if (!Array.isArray(sections)) return null
  const list = sections as ShellSection[]
  if (list.some((section) => section?.id === FITNESS_NAV_SECTION_ID)) return list
  return [fitnessNavSection(), ...list]
}

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/** Claims the menu by writing its marker first, inside the same transaction as the change. */
async function claim(scope: string, tx: Tx) {
  const claimed = await tx
    .insert(fitnessNavigationAdded)
    .values({ scope, addedAt: new Date() })
    .onConflictDoNothing()
    .returning({ scope: fitnessNavigationAdded.scope })
  return claimed.length > 0
}

async function changeMemberMenu(database: CustomShellDb) {
  await database.transaction(async (tx) => {
    if (!(await claim("members", tx))) return
    const at = new Date()
    await tx
      .insert(customShellSettings)
      .values({ key: "default", settings: {}, createdAt: at, updatedAt: at })
      .onConflictDoNothing()
    const [row] = await tx
      .select({ settings: customShellSettings.settings })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, "default"))
      .limit(1)
    const saved = (row?.settings ?? {}) as { memberSections?: unknown }
    // A row that has never had a member menu shows the shell's starter list,
    // so that list is what the section is added to, not an empty one.
    const current = Array.isArray(saved.memberSections) ? saved.memberSections : createDefaultMemberSections()
    const next = withFitnessSection(current)
    await tx
      .update(customShellSettings)
      .set({
        settings: sql`jsonb_set(${customShellSettings.settings}, '{memberSections}', ${JSON.stringify(next)}::jsonb, true)`,
        updatedAt: at,
      })
      .where(eq(customShellSettings.key, "default"))
  })
}

async function changeWorkspaceMenu(scope: string, workspaceId: string, database: CustomShellDb) {
  await database.transaction(async (tx) => {
    if (!(await claim(scope, tx))) return
    const [row] = await tx
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1)
    const next = withFitnessSection((row?.settings as { sections?: unknown } | undefined)?.sections)
    // A workspace whose menu isn't a list is one the shell hasn't set up; it
    // is left alone rather than given a menu with only Fitness's links in it.
    if (!next) return
    await tx
      .update(customShellWorkspaces)
      .set({
        settings: sql`jsonb_set(${customShellWorkspaces.settings}, '{sections}', ${JSON.stringify(next)}::jsonb, true)`,
      })
      .where(eq(customShellWorkspaces.id, workspaceId))
  })
}
