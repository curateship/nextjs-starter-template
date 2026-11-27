import { makeDashboardBlocks, type DashboardBlocks } from "@/components/dashboard-page/dashboard-blocks"
import { PROJECTS_SECTIONS_NODE } from "@/lib/social/projects-dashboard-page"
import {
  RESEARCH_SECTIONS,
  PROJECTS_LIST_SECTIONS,
  PROJECTS_SECTION_LABELS,
  PROJECTS_SECTIONS,
  type ProjectsListSection,
  type ProjectsSection,
} from "@/lib/social/projects-dashboard-search"

/**
 * The Projects dashboard's own "/" block on its left page (Tyler, 12 Nov
 * 2026): Dashboards, with Overview, Projects, Accounts, Messages and Viral.
 * Viral is one row for Vault, Hooks and Formats, which are tabs in the middle
 * (Tyler, 27 Nov 2026: "remove the viral block and add a "Viral" link in the
 * dashboard. Clicking on that link will show 3 middle tabs"). Drawn by the
 * shared `makeDashboardBlocks`, as the Anti Detect dashboard's are. The same left panel shows on a project's page
 * (`content-app/projects-left.tsx`).
 *
 * It has no Projects block (Tyler, 27 Nov 2026: "Remove projects block. List
 * row only"): a row of the Projects list opens the project in the middle and
 * right.
 */

export type ProjectsBlocks = DashboardBlocks<ProjectsSection, ProjectsListSection>

const blocks = makeDashboardBlocks<ProjectsSection, ProjectsListSection>({
  dashboard: "Projects",
  sections: PROJECTS_SECTIONS,
  listSections: PROJECTS_LIST_SECTIONS,
  labels: PROJECTS_SECTION_LABELS,
  sectionsNode: PROJECTS_SECTIONS_NODE,
  sectionsKind: "promo-sections",
  folded: { key: "viral", label: "Viral", sections: RESEARCH_SECTIONS },
})

export const ProjectsBlocksProvider = blocks.Provider
export const ProjectsSectionsBlock = blocks.SectionsBlock
export const PROJECTS_APP_BLOCKS = blocks.appBlocks
