import { eq, sql } from "drizzle-orm"

import {
  createDefaultMemberSections,
  type ShellSection,
} from "@/lib/custom-shell"
import { db, type CustomShellDb } from "@/server/db"
import { projectNavigationAdded } from "@/server/project/schema"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"

/**
 * Puts Project's dashboards in the left menu: My dashboard, Projects, Team
 * and Task types.
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
 *
 * A link added after a menu already has the section (Task types, 12 Oct 2026)
 * goes in by its own pass with its own marker, into the section where it
 * stands. A menu whose admin removed the whole section stays without it.
 */

export const PROJECT_NAV_SECTION_ID = "section-project"

function projectNavSection(): ShellSection {
  return {
    id: PROJECT_NAV_SECTION_ID,
    title: "Work",
    entries: [
      {
        type: "item",
        id: "item-project-dashboard",
        label: "My dashboard",
        href: "/dashboard",
        icon: "layout-dashboard",
        visible: true,
      },
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
        id: "item-project-team",
        label: "Team",
        href: "/team",
        icon: "users",
        visible: true,
      },
      taskTypesItem(),
    ],
  }
}

const TASK_TYPES_ITEM_ID = "item-project-task-types"

function taskTypesItem(): ShellSection["entries"][number] {
  return {
    type: "item",
    id: TASK_TYPES_ITEM_ID,
    label: "Task types",
    href: "/task-types",
    icon: "shapes",
    visible: true,
  }
}

/** Task types goes after Team in the Work section, when that section is still there. */
function withTaskTypesLink(sections: unknown): ShellSection[] | null {
  if (!Array.isArray(sections)) return null
  const list = sections as ShellSection[]
  return list.map((section) => {
    if (section?.id !== PROJECT_NAV_SECTION_ID || !Array.isArray(section.entries)) return section
    if (section.entries.some((entry) => entry?.id === TASK_TYPES_ITEM_ID)) return section
    const team = section.entries.findIndex((entry) => entry?.id === "item-project-team")
    const entries = [...section.entries]
    entries.splice(team === -1 ? entries.length : team + 1, 0, taskTypesItem())
    return { ...section, entries }
  })
}

/** Each change to the menus, with the marker that says a menu has had it. */
const PASSES = [
  { suffix: "", change: withProjectSection },
  { suffix: ":task-types", change: withTaskTypesLink },
] as const

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
  const workspaces = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellWorkspaces)
  for (const pass of PASSES) {
    const members = `members${pass.suffix}`
    if (!done.has(members)) await changeMemberMenu(members, pass.change, database)
    for (const workspace of workspaces) {
      const scope = `${workspaceScope(workspace.id)}${pass.suffix}`
      if (!done.has(scope)) await changeWorkspaceMenu(scope, workspace.id, pass.change, database)
    }
  }
}

type MenuChange = (sections: unknown) => ShellSection[] | null

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

async function changeMemberMenu(scope: string, change: MenuChange, database: CustomShellDb) {
  await database.transaction(async (tx) => {
    if (!(await claim(scope, tx))) return
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
    const next = change(current)
    await tx
      .update(customShellSettings)
      .set({
        settings: sql`jsonb_set(${customShellSettings.settings}, '{memberSections}', ${JSON.stringify(next)}::jsonb, true)`,
        updatedAt: at,
      })
      .where(eq(customShellSettings.key, "default"))
  })
}

async function changeWorkspaceMenu(
  scope: string,
  workspaceId: string,
  change: MenuChange,
  database: CustomShellDb
) {
  await database.transaction(async (tx) => {
    if (!(await claim(scope, tx))) return
    const [row] = await tx
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1)
    const next = change((row?.settings as { sections?: unknown } | undefined)?.sections)
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
