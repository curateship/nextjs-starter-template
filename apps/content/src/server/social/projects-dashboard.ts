import { asc, eq } from "drizzle-orm"

import { cleanWidgetLayout, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { isNetwork, type Network } from "@/lib/social/networks"
import {
  DEFAULT_PROJECTS_WIDGETS,
  defaultProjectsPage,
  PROJECTS_PAGE_BLOCK_TYPES,
  PROJECTS_PAGE_ERRORS,
  PROJECTS_WIDGET_IDS,
  withProjectsSectionsBlock,
} from "@/lib/social/projects-dashboard-page"
import { PROJECTS_LIST_SECTIONS, type ProjectsListSection } from "@/lib/social/projects-dashboard-search"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { readPostCounts } from "@/server/social/post-counts"
import { promoProjects, promoProjectsPages } from "@/server/social/schema"

/**
 * The Projects dashboard's own records (Tyler, 12 Nov 2026: "one cohesive 3
 * panel design"): each person's left page and Overview layout, and the
 * posts that need them, for Overview's first widget. Every read and write is
 * the signed-in person's own row.
 */

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page cleaned to what it may hold, its Dashboards block always kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, PROJECTS_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withProjectsSectionsBlock(JSON.parse(stored)))
}

async function pageRow(userId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database.select().from(promoProjectsPages).where(eq(promoProjectsPages.userId, userId)).limit(1)
  return row
}

function pageOf(row: Awaited<ReturnType<typeof pageRow>>): StoredPage {
  const body = row?.body ? cleanPage(row.body) : ""
  return {
    body: body || JSON.stringify(defaultProjectsPage()),
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  userId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    sections: ProjectsSections
  }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(promoProjectsPages)
    .values({ userId, body: "", locked: false, coverUrl: null, coverImages: [], sections: {}, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: promoProjectsPages.userId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first. A locked page refuses. */
export async function saveProjectsPageBody(userId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(PROJECTS_PAGE_ERRORS.tooLong)
  const page = pageOf(await pageRow(userId, database))
  if (page.locked) throw new Error(PROJECTS_PAGE_ERRORS.locked)
  await upsertPage(userId, { body: cleanPage(body) }, database)
}

export async function setProjectsPageLock(userId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(userId, { locked }, database)
}

export async function setProjectsPageCover(
  userId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(userId, cover, database)
}

/** The Dashboards block's sections left out, and the order they were dragged into. Overview is never in either. */
export type ProjectsSections = { hidden: ProjectsListSection[]; order: ProjectsListSection[] }

function readSections(value: unknown): ProjectsListSection[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((section): section is ProjectsListSection => (PROJECTS_LIST_SECTIONS as readonly unknown[]).includes(section))
    ),
  ]
}

function sectionsOf(row: Awaited<ReturnType<typeof pageRow>>): ProjectsSections {
  return { hidden: readSections(row?.sections.hidden), order: readSections(row?.sections.order) }
}

/** The page and the Dashboards block's sections from one read of the person's row, as the dashboard opens. */
export async function getProjectsPageAndSections(userId: string, database: Pick<CustomShellDb, "select"> = db) {
  const row = await pageRow(userId, database)
  return { page: pageOf(row), sections: sectionsOf(row) }
}

export async function saveProjectsSections(userId: string, sections: ProjectsSections, database: CustomShellDb = db) {
  await upsertPage(userId, { sections: { hidden: readSections(sections.hidden), order: readSections(sections.order) } }, database)
}

/** Overview's layout as stored, or the starting one. */
export async function getProjectsWidgets(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<WidgetLayout> {
  const row = await pageRow(userId, database)
  return cleanWidgetLayout(row?.widgets ?? DEFAULT_PROJECTS_WIDGETS, PROJECTS_WIDGET_IDS, DEFAULT_PROJECTS_WIDGETS)
}

/** Saves Overview's layout, cleaned, and answers with it as stored. */
export async function saveProjectsWidgets(userId: string, layout: unknown, database: CustomShellDb = db): Promise<WidgetLayout> {
  const cleaned = cleanWidgetLayout(layout, PROJECTS_WIDGET_IDS, DEFAULT_PROJECTS_WIDGETS)
  await upsertPage(userId, { widgets: cleaned }, database)
  return cleaned
}

/** One network of one project with posts that need you: failed ones and drafts not sent. */
export type PostsNeedingYou = { projectId: string; projectName: string; network: Network; count: number }

/**
 * Every project's posts that need you, network by network, for Overview's
 * Posts that need you. The same figure each network's Posts row shows on the
 * project's own page (`readPostCounts`).
 */
export async function listPostsNeedingYou(userId: string, database: CustomShellDb = db): Promise<PostsNeedingYou[]> {
  const projects = await database
    .select({ id: promoProjects.id, name: promoProjects.name, networks: promoProjects.networks })
    .from(promoProjects)
    .where(eq(promoProjects.userId, userId))
    .orderBy(asc(promoProjects.name))
  const rows = await Promise.all(
    projects.map(async (project) => {
      const networks = (project.networks ?? []).filter(isNetwork)
      const counts = await readPostCounts(userId, project.id, networks, database)
      return networks.flatMap((network) =>
        counts[network] ? [{ projectId: project.id, projectName: project.name, network, count: counts[network] }] : []
      )
    })
  )
  return rows.flat()
}
