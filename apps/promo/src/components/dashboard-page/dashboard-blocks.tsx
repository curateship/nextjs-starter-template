import * as React from "react"
import { EyeIcon, EyeOffIcon, FolderOpenIcon, LayoutDashboardIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import { orderSections } from "@/lib/layout/styling-values"

/**
 * The two "/" blocks a Promo dashboard of sections has on its left page, the
 * Projects dashboard's and the Anti Detect dashboard's (Tyler, 12 Nov 2026):
 *
 * - **Dashboards**, fixed: Overview, then each section, the one showing
 *   picked, each with its count. Its ⋮ shows and hides every section but
 *   Overview and drags them into order.
 * - **Projects**: every project, pinned first. Pressing one narrows the
 *   sections to it; pressing it again lets it go.
 *
 * Each keeps no values: it draws what the dashboard hands down through the
 * blocks' Provider.
 */

export type DashboardBlocks<Section extends string, ListSection extends Section> = {
  /** The section showing, and picking another. */
  section: Section
  onPickSection: (section: Section) => void
  /** Sections left out of the Dashboards block, and their dragged order. */
  hiddenSections: readonly ListSection[]
  sectionOrder: readonly ListSection[]
  onSectionsChange: (sections: { hidden: ListSection[]; order: ListSection[] }) => void
  /** Each row's count. Null while it is read. */
  counts: Record<Section, number | null>
  /** Every project, pinned ones first, each with how many of the open section's rows are its own; null shows no pill. */
  projects: { id: string; name: string; count: number | null }[]
  /** The project the sections are narrowed to, or "". */
  activeProject: string
  /** Narrows to a project; "" lets it go. */
  onProject: (projectId: string) => void
}

export function makeDashboardBlocks<Section extends string, ListSection extends Section>(config: {
  /** The dashboard's name, for a block drawn on a page with no dashboard behind it. */
  dashboard: string
  sections: readonly Section[]
  listSections: readonly ListSection[]
  labels: Record<Section, string>
  /** The "/" node names; the server cleans a saved page with them. */
  sectionsNode: string
  projectsNode: string
  /** Each block's kind, which its remembered fold is kept under. */
  sectionsKind: string
  projectsKind: string
  /** The Projects block's line with no project yet. */
  noProjects: string
}) {
  type Blocks = DashboardBlocks<Section, ListSection>
  const Context = React.createContext<Blocks | null>(null)

  function Provider({ value, children }: { value: Blocks; children: React.ReactNode }) {
    return <Context.Provider value={value}>{children}</Context.Provider>
  }

  const listOnly = (sections: readonly string[]): ListSection[] =>
    sections.filter((section): section is ListSection => (config.listSections as readonly string[]).includes(section))

  function NotHere() {
    return <p className="p-3 text-xs text-muted-foreground">This block shows on the {config.dashboard} dashboard.</p>
  }

  function SectionsBlock() {
    const blocks = React.useContext(Context)
    const hidden: readonly Section[] = blocks?.hiddenSections ?? []
    const ordered = orderSections(config.sections, blocks?.sectionOrder)
    const change = blocks?.onSectionsChange
    useBlockMenu(
      change
        ? ordered
            .filter((section) => (config.listSections as readonly string[]).includes(section))
            .map((section) => {
              const isHidden = hidden.includes(section)
              return {
                label: config.labels[section],
                ariaLabel: `${isHidden ? "Show" : "Hide"} ${config.labels[section]}`,
                muted: isHidden,
                keepOpen: true,
                end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
                sortKey: section,
                onSelect: () =>
                  change({
                    hidden: listOnly(isHidden ? hidden.filter((other) => other !== section) : [...hidden, section]),
                    order: listOnly(ordered),
                  }),
              }
            })
        : undefined,
      change ? (keys) => change({ hidden: listOnly(hidden), order: listOnly(keys) }) : undefined
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
            label: config.labels[section],
            value: blocks.counts[section]?.toLocaleString(),
          }))}
      />
    )
  }

  function ProjectsBlock() {
    const blocks = React.useContext(Context)
    useBlockCount(blocks?.projects.length || undefined)
    if (!blocks) return <NotHere />
    return (
      <SideRows
        empty={config.noProjects}
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

  const SectionsView = blockView({
    kind: config.sectionsKind,
    title: "Dashboards",
    icon: <LayoutDashboardIcon />,
    Draw: SectionsBlock,
    fixed: true,
  })

  const ProjectsView = blockView({
    kind: config.projectsKind,
    title: "Projects",
    icon: <FolderOpenIcon />,
    Draw: ProjectsBlock,
  })

  /** Dashboards (fixed, never in the "/" list), then Projects under Advanced blocks. */
  const appBlocks: readonly AppBlock[] = [
    {
      key: "promoSections",
      label: "Dashboards",
      icon: LayoutDashboardIcon,
      node: config.sectionsNode,
      extension: keepOnPage(blockNode(config.sectionsNode, {}, SectionsView)),
      offered: false,
    },
    {
      key: "promoProjects",
      label: "Projects",
      icon: FolderOpenIcon,
      node: config.projectsNode,
      extension: blockNode(config.projectsNode, {}, ProjectsView),
    },
  ]

  return { Provider, SectionsBlock, appBlocks }
}
