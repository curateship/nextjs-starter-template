import { and, count, eq, isNotNull, isNull } from "drizzle-orm"

import { cleanWidgetLayout, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import {
  DEFAULT_VIRAL_WIDGETS,
  defaultViralPage,
  VIRAL_PAGE_BLOCK_TYPES,
  VIRAL_PAGE_ERRORS,
  VIRAL_WIDGET_IDS,
  withViralSectionsBlock,
} from "@/lib/viral/dashboard-page"
import { VIRAL_LIST_SECTIONS, type ViralListSection } from "@/lib/viral/dashboard-search"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { listFormats } from "@/server/viral/formats"
import { listLibraryHooks } from "@/server/viral/library"
import { listViralFolders } from "@/server/viral/projects"
import { viralDashboardPages, viralProjects, viralVaultItems } from "@/server/viral/schema"

/**
 * The Viral dashboard's own records (task features/03): each person's left
 * page, its Dashboards block's rows and Overview's layout, every row's
 * count, and the rows of the Projects and Folders blocks. The same shape as
 * Directory's Events dashboard (`server/events/events-dashboard.ts`), kept
 * per person instead of per site, since every Viral record belongs to its
 * owner. Only the owner reads or writes a page.
 */

type Database = typeof db

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

function cleanPage(text: string) {
  const stored = storedPageBody(text, VIRAL_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withViralSectionsBlock(JSON.parse(stored)))
}

async function pageRow(ownerId: string, database: Database) {
  const [row] = await database.select().from(viralDashboardPages).where(eq(viralDashboardPages.ownerId, ownerId)).limit(1)
  return row
}

function pageOf(row: Awaited<ReturnType<typeof pageRow>>): StoredPage {
  const body = row?.body ? cleanPage(row.body) : JSON.stringify(defaultViralPage())
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

/** The Dashboards block's rows left out, and their dragged order. Overview is never in either. */
export type ViralSections = { hidden: ViralListSection[]; order: ViralListSection[] }

function readSections(value: unknown): ViralListSection[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((section): section is ViralListSection => (VIRAL_LIST_SECTIONS as readonly unknown[]).includes(section))
    ),
  ]
}

async function upsertPage(
  ownerId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    sections: ViralSections
  }>,
  database: Database
) {
  const at = now()
  await database
    .insert(viralDashboardPages)
    .values({ ownerId, body: "", locked: false, coverUrl: null, coverImages: [], sections: {}, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: viralDashboardPages.ownerId, set: { ...values, updatedAt: at } })
}

export async function saveViralPageBody(ownerId: string, body: string, database: Database = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(VIRAL_PAGE_ERRORS.tooLong)
  const page = pageOf(await pageRow(ownerId, database))
  if (page.locked) throw new Error(VIRAL_PAGE_ERRORS.locked)
  await upsertPage(ownerId, { body: cleanPage(body) }, database)
}

export async function setViralPageLock(ownerId: string, locked: boolean, database: Database = db) {
  await upsertPage(ownerId, { locked }, database)
}

export async function setViralPageCover(
  ownerId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: Database = db
) {
  await upsertPage(ownerId, cover, database)
}

export async function saveViralSections(ownerId: string, sections: ViralSections, database: Database = db) {
  await upsertPage(
    ownerId,
    { sections: { hidden: readSections(sections.hidden), order: readSections(sections.order) } },
    database
  )
}

export async function getViralWidgets(ownerId: string, database: Database = db): Promise<WidgetLayout> {
  const row = await pageRow(ownerId, database)
  return cleanWidgetLayout(row?.widgets ?? DEFAULT_VIRAL_WIDGETS, VIRAL_WIDGET_IDS, DEFAULT_VIRAL_WIDGETS)
}

export async function saveViralWidgets(ownerId: string, layout: unknown, database: Database = db): Promise<WidgetLayout> {
  const cleaned = cleanWidgetLayout(layout, VIRAL_WIDGET_IDS, DEFAULT_VIRAL_WIDGETS)
  await upsertPage(ownerId, { widgets: cleaned }, database)
  return cleaned
}

/** Each row's pill. */
export type ViralSectionCounts = Record<ViralListSection, number>

/** One row of the Projects block: a project that isn't archived, with its ideas and hooks. */
export type ViralProjectBlockRow = { id: string; name: string; vaultCount: number; hookCount: number }

/** One row of the Folders block. `none` is the projects in no folder; `archived` the archived ones. */
export type ViralFolderBlockRow = { id: string; name: string; count: number }

/** What the left page's blocks draw: every row's count, the projects and the folders. */
export type ViralPageFigures = {
  counts: ViralSectionCounts
  projects: ViralProjectBlockRow[]
  folders: { all: number; none: number; archived: number; rows: ViralFolderBlockRow[] }
}

/**
 * Every figure the left page shows, in one read. Each pill counts what its
 * row opens on: Projects the ones not archived, Vault every idea, Hooks
 * every hook (your own included), Formats every saved format.
 */
export async function viralPageFigures(ownerId: string, database: Database = db): Promise<ViralPageFigures> {
  const [projects, vaultByProject, hooks, formats, folders, archived] = await Promise.all([
    database
      .select({ id: viralProjects.id, name: viralProjects.name, folderId: viralProjects.folderId })
      .from(viralProjects)
      .where(and(eq(viralProjects.ownerId, ownerId), isNull(viralProjects.archivedAt))),
    database
      .select({ projectId: viralVaultItems.projectId, total: count() })
      .from(viralVaultItems)
      .where(eq(viralVaultItems.ownerId, ownerId))
      .groupBy(viralVaultItems.projectId),
    listLibraryHooks(ownerId),
    listFormats(ownerId),
    listViralFolders(ownerId),
    database
      .select({ total: count() })
      .from(viralProjects)
      .where(and(eq(viralProjects.ownerId, ownerId), isNotNull(viralProjects.archivedAt))),
  ])
  const vaultCounts = new Map(vaultByProject.map((row) => [row.projectId, row.total]))
  const hookCounts = new Map<string, number>()
  for (const hook of hooks) {
    if (hook.kind !== "video") continue
    for (const project of hook.projects) hookCounts.set(project.id, (hookCounts.get(project.id) ?? 0) + 1)
  }
  const projectRows = projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      vaultCount: vaultCounts.get(project.id) ?? 0,
      hookCount: hookCounts.get(project.id) ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
  // A folder's count is its projects that aren't archived, as the Projects row lists them.
  const inFolder = new Map<string, number>()
  for (const project of projects) {
    if (project.folderId) inFolder.set(project.folderId, (inFolder.get(project.folderId) ?? 0) + 1)
  }
  return {
    counts: {
      projects: projects.length,
      vault: vaultByProject.reduce((sum, row) => sum + row.total, 0),
      hooks: hooks.length,
      formats: formats.length,
    },
    projects: projectRows,
    folders: {
      all: projects.length,
      none: projects.filter((project) => !project.folderId).length,
      archived: archived[0]?.total ?? 0,
      rows: folders.map((folder) => ({ id: folder.id, name: folder.name, count: inFolder.get(folder.id) ?? 0 })),
    },
  }
}

/** The left page, its rows and every figure its blocks draw, in one read. */
export async function getViralPage(ownerId: string, database: Database = db) {
  const [row, figures] = await Promise.all([pageRow(ownerId, database), viralPageFigures(ownerId, database)])
  return {
    page: pageOf(row),
    sections: { hidden: readSections(row?.sections.hidden), order: readSections(row?.sections.order) },
    ...figures,
  }
}
