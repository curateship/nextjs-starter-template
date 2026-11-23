/**
 * A project page's three dashboards, picked in the fixed Dashboards block on
 * its left page (Tyler, 16 Nov 2026: "remove the notes and milestone block
 * and instead create a dashboards for it. Also need to create a fixed block
 * for link dashboards", the links being Tasks, Notes and Milestones). Each
 * keeps the left page and puts its own list in the middle and its open row
 * on the right.
 */
export const PROJECT_SECTIONS = ["tasks", "notes", "milestones"] as const
export type ProjectSection = (typeof PROJECT_SECTIONS)[number]

export const PROJECT_SECTION_LABEL: Record<ProjectSection, string> = {
  tasks: "Tasks",
  notes: "Notes",
  milestones: "Milestones",
}

export function readProjectSection(value: unknown): ProjectSection | undefined {
  return PROJECT_SECTIONS.includes(value as ProjectSection) ? (value as ProjectSection) : undefined
}

/**
 * Which dashboard an address shows. `?section=` says so; an address without
 * it goes by what it opens, so links made before the dashboards still land
 * where they point: a # link's `?note=` on Notes, `?milestone=` on
 * Milestones, and a task or the chat on Tasks.
 */
export function sectionOfAddress(search: { section?: ProjectSection; note?: string; milestone?: string }): ProjectSection {
  if (search.section) return search.section
  if (search.note) return "notes"
  if (search.milestone) return "milestones"
  return "tasks"
}

/** The dashboard a project's page showed last in this browser, per project. */
export const projectSectionKey = (projectId: string) => `project-page-section-${projectId}`

/** The row a dashboard's right panel shows: the one in the address, or the first when that one isn't there. */
export function shownRow<Row extends { id: string }>(rows: readonly Row[] | undefined, id: string | undefined): Row | undefined {
  if (!rows) return undefined
  return rows.find((row) => row.id === id) ?? rows[0]
}

/** The Dashboards block's own settings, kept on the block in the page. */
export type SectionSettings = { hidden?: string[]; order?: string[] }

/** The dashboards in the order dragged in the block's ⋮; any not in it follow in the usual order. */
export function orderedSections(order: readonly string[] | undefined): ProjectSection[] {
  const saved = (order ?? []).filter((key): key is ProjectSection => PROJECT_SECTIONS.includes(key as ProjectSection))
  return [...new Set([...saved, ...PROJECT_SECTIONS])]
}
