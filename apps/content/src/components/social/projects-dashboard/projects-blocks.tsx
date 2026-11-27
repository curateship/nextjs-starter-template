import { FlameIcon } from "lucide-react"

import { makeDashboardBlocks, type DashboardBlocks } from "@/components/dashboard-page/dashboard-blocks"
import { PROJECTS_PICKER_NODE, PROJECTS_SECTIONS_NODE, PROJECTS_VIRAL_NODE } from "@/lib/social/projects-dashboard-page"
import {
  RESEARCH_SECTIONS,
  PROJECTS_LIST_SECTIONS,
  PROJECTS_SECTION_LABELS,
  PROJECTS_SECTIONS,
  type ProjectsListSection,
  type ProjectsSection,
} from "@/lib/social/projects-dashboard-search"

/**
 * The Projects dashboard's own "/" blocks on its left page (Tyler, 12 Nov
 * 2026): Dashboards (Overview, Projects, Accounts and Messages), Content's
 * Viral (Vault, Hooks and Formats; Tyler, 27 Nov 2026: "should be its own
 * block called "Viral""), and Projects, which narrows Overview, Accounts and
 * Messages to one project, and Projects to its own row. Drawn by the shared
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
  group: {
    title: "Viral",
    icon: FlameIcon,
    sections: RESEARCH_SECTIONS,
    node: PROJECTS_VIRAL_NODE,
    kind: "content-viral-sections",
    key: "contentViralSections",
  },
})

export const ProjectsBlocksProvider = blocks.Provider
export const ProjectsSectionsBlock = blocks.SectionsBlock
export const PROJECTS_APP_BLOCKS = blocks.appBlocks
