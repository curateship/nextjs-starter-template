import { eq, sql } from "drizzle-orm"

import {
  createDefaultMemberSections,
  type ShellSection,
} from "@/lib/custom-shell"
import { db, type CustomShellDb } from "@/server/db"
import { projectNavigationAdded } from "@/server/project/schema"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"

/**
 * Puts Project's three screens in the left menu: Projects, Team and My work.
 *
 * The shell keeps its menus in the database, not in code. Members share one
 * list on the settings row and an admin sees their workspace's own list, and
 * an app may not edit the shell code that writes either. So this job adds the
 * section itself, once per menu, and writes down that it did. An admin who
 * later removes a link in Settings keeps it removed.
 *
 * It runs on the shell's background loop rather than in a migration because
 * the menus may not exist yet when migrations run: a brand-new install makes
 * its first workspace when its first admin signs in.
 */

export const PROJECT_NAV_SECTION_ID = "section-project"

function projectNavSection(): ShellSection {
  return {
    id: PROJECT_NAV_SECTION_ID,
    title: "Work",
    entries: [
      {
        type: "item",
        id: "item-project-projects",
        label: "Projects",
        href: "/projects",
        icon: "folder-kanban",
        visible: true,
      },
      {
        type: "item",
        id: "item-project-my-work",
        label: "My work",
        href: "/my-work",
        icon: "list-checks",
        visible: true,
      },
      {
        type: "item",
        id: "item-project-team",
        label: "Team",
        href: "/team",
        icon: "users",
        visible: true,
      },
    ],
  }
}

/** The section goes first, ahead of whatever the menu already holds. */
function withProjectSection(sections: unknown): ShellSection[] | null {
  if (!Array.isArray(sections)) return null
  const list = sections as ShellSection[]
  if (list.some((section) => section?.id === PROJECT_NAV_SECTION_ID)) return list
  return [projectNavSection(), ...list]
}

export async function addProjectNavigation(database: CustomShellDb = db) {
  const done = new Set(
    (
      await database
        .select({ scope: projectNavigationAdded.scope })
        .from(projectNavigationAdded)
    ).map((row) => row.scope)
  )
  if (!done.has("members")) await addToMemberMenu(database)
  const workspaces = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellWorkspaces)
  for (const workspace of workspaces) {
    if (!done.has(workspaceScope(workspace.id))) {
      await addToWorkspaceMenu(workspace.id, database)
    }
  }
}

function workspaceScope(workspaceId: string) {
  return `workspace:${workspaceId}`
}

/**
 * Claims the menu by writing its marker first, inside the same transaction as
 * the change, so two overlapping passes can't both add the section.
 */
async function claim(scope: string, tx: Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]) {
  const claimed = await tx
    .insert(projectNavigationAdded)
    .values({ scope, addedAt: new Date() })
    .onConflictDoNothing()
    .returning({ scope: projectNavigationAdded.scope })
  return claimed.length > 0
}

async function addToMemberMenu(database: CustomShellDb) {
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
    const current = Array.isArray(saved.memberSections)
      ? saved.memberSections
      : createDefaultMemberSections()
    const next = withProjectSection(current)
    await tx
      .update(customShellSettings)
      .set({
        settings: sql`jsonb_set(${customShellSettings.settings}, '{memberSections}', ${JSON.stringify(next)}::jsonb, true)`,
        updatedAt: at,
      })
      .where(eq(customShellSettings.key, "default"))
  })
}

async function addToWorkspaceMenu(workspaceId: string, database: CustomShellDb) {
  await database.transaction(async (tx) => {
    if (!(await claim(workspaceScope(workspaceId), tx))) return
    const [row] = await tx
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1)
    const next = withProjectSection(
      (row?.settings as { sections?: unknown } | undefined)?.sections
    )
    // A workspace whose menu isn't a list is one the shell hasn't set up; it
    // is left alone rather than given a menu with only Project's links in it.
    if (!next) return
    await tx
      .update(customShellWorkspaces)
      .set({
        settings: sql`jsonb_set(${customShellWorkspaces.settings}, '{sections}', ${JSON.stringify(next)}::jsonb, true)`,
      })
      .where(eq(customShellWorkspaces.id, workspaceId))
  })
}
