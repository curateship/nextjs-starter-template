import { makeDashboardBlocks, type DashboardBlocks } from "@/components/dashboard-page/dashboard-blocks"
import { PROJECTS_PICKER_NODE, PROJECTS_SECTIONS_NODE } from "@/lib/social/projects-dashboard-page"
import {
  PROJECTS_LIST_SECTIONS,
  PROJECTS_SECTION_LABELS,
  PROJECTS_SECTIONS,
  type ProjectsListSection,
  type ProjectsSection,
} from "@/lib/social/projects-dashboard-search"

/**
 * The Projects dashboard's own "/" blocks on its left page (Tyler, 12 Nov
 * 2026): Dashboards (Overview, Projects, Voices, Accounts, Archive and
 * Messages) and Projects, which narrows Overview, Accounts, Archive and
 * Messages to one project, and Projects to its own row. Voices belong to no
 * project, so on Voices its rows have no count. Drawn by the shared
 * `makeDashboardBlocks`, as the Anti Detect dashboard's are.
 */

export type ProjectsBlocks = DashboardBlocks<ProjectsSection, ProjectsListSection>

const blocks = makeDashboardBlocks<ProjectsSection, ProjectsListSection>({
  dashboard: "Projects",
  sections: PROJECTS_SECTIONS,
  listSections: PROJECTS_LIST_SECTIONS,
  labels: PROJECTS_SECTION_LABELS,
  sectionsNode: PROJECTS_SECTIONS_NODE,
  projectsNode: PROJECTS_PICKER_NODE,
  sectionsKind: "promo-sections",
  projectsKind: "promo-projects",
  noProjects: "No projects yet. New project in the Projects section makes one.",
})

export const ProjectsBlocksProvider = blocks.Provider
export const ProjectsSectionsBlock = blocks.SectionsBlock
export const PROJECTS_APP_BLOCKS = blocks.appBlocks
