import * as React from "react"
import { EyeIcon, EyeOffIcon, FolderOpenIcon, LayoutDashboardIcon, type LucideIcon } from "lucide-react"

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
 * - **Projects**, when `projectsBlock` names one: every project, pinned
 *   first. Pressing one narrows the sections to it; pressing it again lets it
 *   go. The Anti Detect dashboard has it; Content's Projects dashboard does
 *   not, since a row of its Projects list opens the project (Tyler, 27 Nov
 *   2026: "Remove projects block. List row only").
 * - **A group of its own**, fixed, when `group` names one: some sections in a
 *   block of their own under Dashboards, as Content's Viral block holds
 *   Vault, Hooks and Formats. Its ⋮ shows, hides and orders them as the
 *   Dashboards block's does.
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
  /**
   * The Projects block's rows, when the dashboard has one: every project,
   * pinned ones first, each with how many of the open section's rows are its
   * own; null shows no pill.
   */
  projects?: { id: string; name: string; count: number | null }[]
  /** The project the sections are narrowed to, or "". */
  activeProject?: string
  /** Narrows to a project; "" lets it go. */
  onProject?: (projectId: string) => void
}

export function makeDashboardBlocks<Section extends string, ListSection extends Section>(config: {
  /** The dashboard's name, for a block drawn on a page with no dashboard behind it. */
  dashboard: string
  sections: readonly Section[]
  listSections: readonly ListSection[]
  labels: Record<Section, string>
  /** The "/" node names; the server cleans a saved page with them. */
  sectionsNode: string
  /** The Dashboards block's kind, which its remembered fold is kept under. */
  sectionsKind: string
  /** The Projects block, when the dashboard has one: its node, its kind and its line with no project yet. */
  projectsBlock?: { node: string; kind: string; empty: string }
  /** Sections drawn in a fixed block of their own, under Dashboards, rather than in it. */
  group?: {
    title: string
    icon: LucideIcon
    sections: readonly ListSection[]
    node: string
    kind: string
    key: string
  }
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

  const grouped = (section: string) => (config.group?.sections as readonly string[] | undefined)?.includes(section) ?? false

  /** The Dashboards block, or with `inGroup` the group's block: the same rows, menu and picking. */
  function SectionsBlock({ inGroup = false }: { inGroup?: boolean } = {}) {
    const blocks = React.useContext(Context)
    const hidden: readonly Section[] = blocks?.hiddenSections ?? []
    // Every section's order, which a save keeps whole, and this block's share of it.
    const everyOrdered = orderSections(config.sections, blocks?.sectionOrder)
    const ordered = everyOrdered.filter((section) => grouped(section) === inGroup)
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
                    order: listOnly(everyOrdered),
                  }),
              }
            })
        : undefined,
      // Dragged within this block, kept beside the other block's order.
      change
        ? (keys) =>
            change({
              hidden: listOnly(hidden),
              order: listOnly([...keys, ...everyOrdered.filter((section) => grouped(section) !== inGroup)]),
            })
        : undefined
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
    const projects = blocks?.projects ?? []
    useBlockCount(projects.length || undefined)
    if (!blocks) return <NotHere />
    return (
      <SideRows
        empty={config.projectsBlock?.empty ?? ""}
        rows={projects.map((project) => ({
          key: project.id,
          name: project.name,
          value: project.count === null ? undefined : project.count.toLocaleString(),
          picked: blocks.activeProject === project.id,
          onPress: () => blocks.onProject?.(blocks.activeProject === project.id ? "" : project.id),
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

  const projectsBlock = config.projectsBlock
  const ProjectsView = projectsBlock
    ? blockView({
        kind: projectsBlock.kind,
        title: "Projects",
        icon: <FolderOpenIcon />,
        Draw: ProjectsBlock,
      })
    : null

  const group = config.group
  const GroupView = group
    ? blockView({
        kind: group.kind,
        title: group.title,
        icon: <group.icon />,
        Draw: () => <SectionsBlock inGroup />,
        fixed: true,
      })
    : null

  /** Dashboards (fixed, never in the "/" list), the group's block when there is one, then Projects under Advanced blocks when there is one. */
  const appBlocks: readonly AppBlock[] = [
    {
      key: "promoSections",
      label: "Dashboards",
      icon: LayoutDashboardIcon,
      node: config.sectionsNode,
      extension: keepOnPage(blockNode(config.sectionsNode, {}, SectionsView)),
      offered: false,
    },
    ...(group && GroupView
      ? [
          {
            key: group.key,
            label: group.title,
            icon: group.icon,
            node: group.node,
            extension: keepOnPage(blockNode(group.node, {}, GroupView)),
            offered: false,
          },
        ]
      : []),
    ...(projectsBlock && ProjectsView
      ? [
          {
            key: "promoProjects",
            label: "Projects",
            icon: FolderOpenIcon,
            node: projectsBlock.node,
            extension: blockNode(projectsBlock.node, {}, ProjectsView),
          },
        ]
      : []),
  ]

  return { Provider, SectionsBlock, appBlocks }
}
