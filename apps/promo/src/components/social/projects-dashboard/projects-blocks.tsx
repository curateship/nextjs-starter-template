import * as React from "react"
import { EyeIcon, EyeOffIcon, FolderOpenIcon, LayoutDashboardIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import { orderSections } from "@/lib/layout/styling-values"
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
 * 2026). Each keeps no values: it draws what the dashboard hands down
 * through `ProjectsBlocksProvider`, as the CRM's and Travel's Trips blocks do.
 */

export type ProjectsBlocks = {
  /** The section showing, and picking another. */
  section: ProjectsSection
  onPickSection: (section: ProjectsSection) => void
  /** Sections left out of the Dashboards block, and their dragged order. */
  hiddenSections: readonly ProjectsListSection[]
  sectionOrder: readonly ProjectsListSection[]
  onSectionsChange: (sections: { hidden: ProjectsListSection[]; order: ProjectsListSection[] }) => void
  /** Each row's count. Null while it is read. */
  counts: Record<ProjectsSection, number | null>
  /**
   * Every project, pinned ones first, each with how many of the open
   * section's rows are its own. A null count shows no pill: Voices belong to
   * no project.
   */
  projects: { id: string; name: string; count: number | null }[]
  /** The project the sections are narrowed to, or "". */
  activeProject: string
  /** Narrows to a project; "" lets it go. */
  onProject: (projectId: string) => void
}

function listSections(sections: readonly string[]): ProjectsListSection[] {
  return sections.filter((section): section is ProjectsListSection =>
    (PROJECTS_LIST_SECTIONS as readonly string[]).includes(section)
  )
}

const ProjectsBlocksContext = React.createContext<ProjectsBlocks | null>(null)

export function ProjectsBlocksProvider({ value, children }: { value: ProjectsBlocks; children: React.ReactNode }) {
  return <ProjectsBlocksContext.Provider value={value}>{children}</ProjectsBlocksContext.Provider>
}

/** What a block shows on a page with no Projects dashboard behind it. */
function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Projects dashboard.</p>
}

/**
 * Dashboards: Overview, Projects, Voices, Accounts, Archive and Messages, the
 * one showing picked, each with its count. Its ⋮ shows and hides every
 * section but Overview and drags them into order; Overview stays first and
 * always shows. A section hidden keeps its row while it is the one showing.
 */
export function ProjectsSectionsBlock() {
  const blocks = React.useContext(ProjectsBlocksContext)
  const hidden: readonly ProjectsSection[] = blocks?.hiddenSections ?? []
  const ordered = orderSections(PROJECTS_SECTIONS, blocks?.sectionOrder)
  const change = blocks?.onSectionsChange
  useBlockMenu(
    change
      ? ordered
          .filter((section) => section !== "overview")
          .map((section) => {
            const isHidden = hidden.includes(section)
            return {
              label: PROJECTS_SECTION_LABELS[section],
              ariaLabel: `${isHidden ? "Show" : "Hide"} ${PROJECTS_SECTION_LABELS[section]}`,
              muted: isHidden,
              keepOpen: true,
              end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
              sortKey: section,
              onSelect: () =>
                change({
                  hidden: listSections(isHidden ? hidden.filter((other) => other !== section) : [...hidden, section]),
                  order: listSections(ordered),
                }),
            }
          })
      : undefined,
    change ? (keys) => change({ hidden: listSections(hidden), order: listSections(keys) }) : undefined
  )
  if (!blocks) return <NotHere />
  return (
    <DashboardsRows
      current={blocks.section}
      onPick={blocks.onPickSection}
      sections={ordered
        .filter((section) => section === blocks.section || !hidden.includes(section))
        .map((section) => ({
          key: section,
          label: PROJECTS_SECTION_LABELS[section],
          value: blocks.counts[section]?.toLocaleString(),
        }))}
    />
  )
}

/**
 * Projects: every project, pinned first. Pressing one narrows Overview,
 * Accounts, Archive and Messages to it, and Projects to its own row;
 * pressing it again lets it go (Tyler, 12 Nov 2026: picked over a Project
 * filter in each header).
 */
function ProjectsPickerBlock() {
  const blocks = React.useContext(ProjectsBlocksContext)
  useBlockCount(blocks?.projects.length || undefined)
  if (!blocks) return <NotHere />
  return (
    <SideRows
      empty="No projects yet. New project in the Projects section makes one."
      rows={blocks.projects.map((project) => ({
        key: project.id,
        name: project.name,
        value: project.count === null ? undefined : project.count.toLocaleString(),
        picked: blocks.activeProject === project.id,
        onPress: () => blocks.onProject(blocks.activeProject === project.id ? "" : project.id),
      }))}
    />
  )
}

const SectionsBlockView = blockView({
  kind: "promo-sections",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: ProjectsSectionsBlock,
  fixed: true,
})

const ProjectsBlockView = blockView({
  kind: "promo-projects",
  title: "Projects",
  icon: <FolderOpenIcon />,
  Draw: ProjectsPickerBlock,
})

/**
 * Every block the Projects page knows: Dashboards (fixed, never in the "/"
 * list), then Projects under Advanced blocks. Their node names are
 * `PROJECTS_PAGE_BLOCK_TYPES`, which the server cleans a saved page with.
 */
export const PROJECTS_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "promoSections",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: PROJECTS_SECTIONS_NODE,
    extension: keepOnPage(blockNode(PROJECTS_SECTIONS_NODE, {}, SectionsBlockView)),
    offered: false,
  },
  {
    key: "promoProjects",
    label: "Projects",
    icon: FolderOpenIcon,
    node: PROJECTS_PICKER_NODE,
    extension: blockNode(PROJECTS_PICKER_NODE, {}, ProjectsBlockView),
  },
]
