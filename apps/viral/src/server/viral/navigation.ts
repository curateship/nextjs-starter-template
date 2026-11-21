import { and, eq, sql } from "drizzle-orm"

import { createDefaultMemberSections, type ShellSection } from "@/lib/custom-shell"
import {
  VIRAL_DASHBOARD_ITEM_ID,
  VIRAL_DASHBOARD_PATH,
  VIRAL_NAV_SECTION_ID,
  VIRAL_OLD_HOME_PATH,
  VIRAL_OLD_ITEM_IDS,
  viralDashboardItem,
  viralNavSection,
} from "@/lib/viral/menu"
import { db, type CustomShellDb } from "@/server/db"
import { viralNavigationAdded } from "@/server/viral/schema"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"

/**
 * Puts Viral's section in the left menu, copied from Travel's
 * `navigation.ts`, and makes the Viral dashboard the home page once.
 *
 * The shell keeps its menus in the database, not in code, and an app may not
 * edit the shell code that writes them. So this job changes Viral's section
 * itself, once per menu, and writes down that it did. An admin who later
 * removes the link in Settings keeps it removed.
 *
 * It runs on the shell's background loop rather than in a migration because a
 * menu may not exist yet when migrations run: a new install makes its first
 * workspace when its first admin signs in.
 *
 * Today, Projects, Vault and Library became one dashboard on 21 Nov 2026
 * (task features/03), so every menu has its four links swapped for the one,
 * once (`dashboard:` scopes), and a home page still on Today moves to the
 * dashboard (`home:dashboard`). The steps that once added Today and Library
 * are gone, so they never put the old links back.
 */
export async function addViralNavigation(database: CustomShellDb = db) {
  const done = new Set(
    (await database.select({ scope: viralNavigationAdded.scope }).from(viralNavigationAdded)).map(
      (row) => row.scope
    )
  )
  if (!done.has("members")) await changeMemberMenu("members", withViralSection, database)
  const workspaces = await database.select({ id: customShellWorkspaces.id }).from(customShellWorkspaces)
  for (const workspace of workspaces) {
    const scope = `workspace:${workspace.id}`
    if (!done.has(scope)) await changeWorkspaceMenu(scope, workspace.id, withViralSection, database)
  }
  if (!done.has("dashboard:members")) await changeMemberMenu("dashboard:members", withDashboardItem, database)
  for (const workspace of workspaces) {
    const scope = `dashboard:workspace:${workspace.id}`
    if (!done.has(scope)) await changeWorkspaceMenu(scope, workspace.id, withDashboardItem, database)
  }
  if (!done.has("home:dashboard")) await makeDashboardHome(database)
}

/**
 * Viral's section with the four old links taken out and the dashboard's one
 * put where the first of them was, or first when none was left. A section
 * that already has the dashboard's link keeps it where it is. A section the
 * admin removed stays gone.
 */
function withDashboardItem(sections: unknown): ShellSection[] | null {
  if (!Array.isArray(sections)) return null
  const list = sections as ShellSection[]
  const old: readonly string[] = VIRAL_OLD_ITEM_IDS
  return list.map((section) => {
    if (section?.id !== VIRAL_NAV_SECTION_ID || !Array.isArray(section.entries)) return section
    const entries = section.entries
    const at = entries.findIndex((entry) => old.includes(entry?.id))
    const kept = entries.filter((entry) => !old.includes(entry?.id))
    if (kept.some((entry) => entry?.id === VIRAL_DASHBOARD_ITEM_ID)) return { ...section, entries: kept }
    const place = at === -1 ? 0 : entries.slice(0, at).filter((entry) => !old.includes(entry?.id)).length
    return { ...section, entries: [...kept.slice(0, place), viralDashboardItem(), ...kept.slice(place)] }
  })
}

/**
 * The Viral dashboard is Viral's home page. The shell's own Home route
 * setting (Settings → General) says where an admin lands, so this sets it
 * once, and only while nobody has chosen one or it is still the old Today
 * page, which is gone. An admin who picks another page keeps it.
 */
async function makeDashboardHome(database: CustomShellDb) {
  await database.transaction(async (tx) => {
    const claimed = await tx
      .insert(viralNavigationAdded)
      .values({ scope: "home:dashboard", addedAt: new Date() })
      .onConflictDoNothing()
      .returning({ scope: viralNavigationAdded.scope })
    if (!claimed.length) return
    const at = new Date()
    await tx
      .insert(customShellSettings)
      .values({ key: "default", settings: {}, createdAt: at, updatedAt: at })
      .onConflictDoNothing()
    await tx
      .update(customShellSettings)
      .set({
        settings: sql`jsonb_set(${customShellSettings.settings}, '{adminRoute}', to_jsonb(${VIRAL_DASHBOARD_PATH}::text), true)`,
        updatedAt: at,
      })
      .where(
        and(
          eq(customShellSettings.key, "default"),
          sql`coalesce(${customShellSettings.settings}->>'adminRoute', '') in ('', ${VIRAL_OLD_HOME_PATH})`
        )
      )
  })
}

/** The section goes first, ahead of whatever the menu already holds. */
function withViralSection(sections: unknown): ShellSection[] | null {
  if (!Array.isArray(sections)) return null
  const list = sections as ShellSection[]
  if (list.some((section) => section?.id === VIRAL_NAV_SECTION_ID)) return list
  return [viralNavSection(), ...list]
}

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/**
 * Claims the menu by writing its marker first, inside the same transaction as
 * the change, so two overlapping passes can't both add the section.
 */
async function claim(scope: string, tx: Tx) {
  const claimed = await tx
    .insert(viralNavigationAdded)
    .values({ scope, addedAt: new Date() })
    .onConflictDoNothing()
    .returning({ scope: viralNavigationAdded.scope })
  return claimed.length > 0
}

type MenuChange = (sections: unknown) => ShellSection[] | null

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
    const current = Array.isArray(saved.memberSections) ? saved.memberSections : createDefaultMemberSections()
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

async function changeWorkspaceMenu(scope: string, workspaceId: string, change: MenuChange, database: CustomShellDb) {
  await database.transaction(async (tx) => {
    if (!(await claim(scope, tx))) return
    const [row] = await tx
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1)
    const next = change((row?.settings as { sections?: unknown } | undefined)?.sections)
    // A workspace whose menu isn't a list is one the shell hasn't set up; it
    // is left alone rather than given a menu with only Viral's links in it.
    if (!next) return
    await tx
      .update(customShellWorkspaces)
      .set({
        settings: sql`jsonb_set(${customShellWorkspaces.settings}, '{sections}', ${JSON.stringify(next)}::jsonb, true)`,
      })
      .where(eq(customShellWorkspaces.id, workspaceId))
  })
}
