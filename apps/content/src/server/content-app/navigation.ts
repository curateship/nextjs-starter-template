import { and, eq, sql } from "drizzle-orm"

import { createDefaultMemberSections, type ShellSection } from "@/lib/custom-shell"
import { CONTENT_HOME_PATH, CONTENT_NAV_SECTION_ID, CONTENT_OLD_ITEM_IDS, contentNavSection } from "@/lib/content-app/menu"
import { contentNavigationAdded } from "@/server/content-app/schema"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"

/**
 * Puts Content's section at the top of the left menu, once per menu, and
 * makes the Projects dashboard the home page once (`workspace/docs/content-app.md`,
 * "One left menu"). Copied from Viral's `navigation.ts`, which Content runs in
 * its place.
 *
 * The shell keeps its menus in the database, not in code, and an app may not
 * edit the shell code that writes them. So this job changes Content's section
 * itself and writes down that it did. An admin who later removes a link in
 * Settings keeps it removed.
 *
 * It runs on the shell's background loop rather than in a migration because a
 * menu may not exist yet when migrations run: a new install makes its first
 * workspace when its first admin signs in.
 */
export async function addContentNavigation(database: CustomShellDb = db) {
  const done = new Set(
    (await database.select({ scope: contentNavigationAdded.scope }).from(contentNavigationAdded)).map((row) => row.scope)
  )
  if (!done.has("members")) await changeMemberMenu("members", withContentSection, database)
  const workspaces = await database.select({ id: customShellWorkspaces.id }).from(customShellWorkspaces)
  for (const workspace of workspaces) {
    const scope = `workspace:${workspace.id}`
    if (!done.has(scope)) await changeWorkspaceMenu(scope, workspace.id, withContentSection, database)
  }
  if (!done.has("home:projects")) await makeProjectsHome(database)
  // Links Content's menu no longer has, taken out of every menu once.
  if (!done.has("drop:members")) await changeMemberMenu("drop:members", withoutOldItems, database)
  for (const workspace of workspaces) {
    const scope = `drop:workspace:${workspace.id}`
    if (!done.has(scope)) await changeWorkspaceMenu(scope, workspace.id, withoutOldItems, database)
  }
}

/** Every section with the links Content took away removed (`CONTENT_OLD_ITEM_IDS`); the rest stays as it is. */
export function withoutOldItems(sections: unknown): ShellSection[] | null {
  if (sections === undefined || sections === null) return []
  if (!Array.isArray(sections)) return null
  const old: readonly string[] = CONTENT_OLD_ITEM_IDS
  return (sections as ShellSection[]).map((section) =>
    Array.isArray(section?.entries) ? { ...section, entries: section.entries.filter((entry) => !old.includes(entry?.id)) } : section
  )
}

/**
 * The section goes first, ahead of whatever the menu already holds. A menu
 * that was never stored is the shell's starting one, an empty list
 * (`createDefaultShellConfig`), which is what a workspace made by the shell's
 * setup has. Anything else that isn't a list is left alone.
 */
export function withContentSection(sections: unknown): ShellSection[] | null {
  if (sections === undefined || sections === null) return [contentNavSection()]
  if (!Array.isArray(sections)) return null
  const list = sections as ShellSection[]
  if (list.some((section) => section?.id === CONTENT_NAV_SECTION_ID)) return list
  return [contentNavSection(), ...list]
}

/**
 * The Projects dashboard is Content's home page. The shell's own Home route
 * setting (Settings → General) says where an admin lands, so this sets it
 * once, and only while nobody has chosen one. An admin who picks another page
 * keeps it.
 */
async function makeProjectsHome(database: CustomShellDb) {
  await database.transaction(async (tx) => {
    if (!(await claim("home:projects", tx))) return
    const at = new Date()
    await tx
      .insert(customShellSettings)
      .values({ key: "default", settings: {}, createdAt: at, updatedAt: at })
      .onConflictDoNothing()
    await tx
      .update(customShellSettings)
      .set({
        settings: sql`jsonb_set(${customShellSettings.settings}, '{adminRoute}', to_jsonb(${CONTENT_HOME_PATH}::text), true)`,
        updatedAt: at,
      })
      .where(
        and(eq(customShellSettings.key, "default"), sql`coalesce(${customShellSettings.settings}->>'adminRoute', '') = ''`)
      )
  })
}

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/**
 * Claims the menu by writing its marker first, inside the same transaction as
 * the change, so two overlapping passes can't both add the section.
 */
async function claim(scope: string, tx: Tx) {
  const claimed = await tx
    .insert(contentNavigationAdded)
    .values({ scope, addedAt: new Date() })
    .onConflictDoNothing()
    .returning({ scope: contentNavigationAdded.scope })
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
    const [row] = await tx
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1)
    const next = change((row?.settings as { sections?: unknown } | undefined)?.sections)
    // A menu that is stored but isn't a list is left alone, and not marked
    // done, so a later pass can still add the section once it is.
    if (!next) return
    if (!(await claim(scope, tx))) return
    await tx
      .update(customShellWorkspaces)
      .set({ settings: sql`jsonb_set(${customShellWorkspaces.settings}, '{sections}', ${JSON.stringify(next)}::jsonb, true)` })
      .where(eq(customShellWorkspaces.id, workspaceId))
  })
}
