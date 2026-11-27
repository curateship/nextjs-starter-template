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
 * - **Projects**, when `projectsBlock` names one: every project, pinned
 *   first. Pressing one narrows the sections to it; pressing it again lets it
 *   go. The Anti Detect dashboard has it; Content's Projects dashboard does
 *   not, since a row of its Projects list opens the project (Tyler, 27 Nov
 *   2026: "Remove projects block. List row only").
 * - **One row for several sections**, when `folded` names them: Content's
 *   Viral row stands for Vault, Hooks and Formats, which show as tabs in the
 *   middle (Tyler, 27 Nov 2026: "remove the viral block and add a "Viral"
 *   link in the dashboard"). It is picked while any of them shows, and opens
 *   the one last shown. The ⋮ shows, hides and moves it as one row.
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
  /** Sections the Dashboards block draws as one row: its key and name, and the sections, the first opened first. */
  folded?: { key: string; label: string; sections: readonly ListSection[] }
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

  const folded = config.folded
  const isFolded = (section: string) => (folded?.sections as readonly string[] | undefined)?.includes(section) ?? false
  /** The folded section last shown, which its row opens again. */
  const remembered: { section: ListSection | null } = { section: null }

  /** A row of the Dashboards block: one section, or the folded ones under one key. */
  type Row = { key: string; label: string; sections: Section[] }

  /** The Dashboards block: a row per section, the folded ones as one, with its menu and picking. */
  function SectionsBlock() {
    const blocks = React.useContext(Context)
    const hidden: readonly Section[] = blocks?.hiddenSections ?? []
    // Every section's order, which a save keeps whole; the folded ones sit where the first of them is.
    const everyOrdered = orderSections(config.sections, blocks?.sectionOrder)
    const rows: Row[] = []
    for (const section of everyOrdered) {
      if (folded && isFolded(section)) {
        if (!rows.some((row) => row.key === folded.key)) rows.push({ key: folded.key, label: folded.label, sections: everyOrdered.filter(isFolded) })
      } else rows.push({ key: section, label: config.labels[section], sections: [section] })
    }
    const rowHidden = (row: Row) => row.sections.every((section) => hidden.includes(section))
    const current = blocks ? (folded && isFolded(blocks.section) ? folded.key : blocks.section) : ""
    const showing = blocks?.section
    React.useEffect(() => {
      if (showing && isFolded(showing)) remembered.section = showing as ListSection
    }, [showing])
    const change = blocks?.onSectionsChange
    useBlockMenu(
      change
        ? rows
            .filter((row) => row.sections.every((section) => (config.listSections as readonly string[]).includes(section)))
            .map((row) => {
              const isHidden = rowHidden(row)
              return {
                label: row.label,
                ariaLabel: `${isHidden ? "Show" : "Hide"} ${row.label}`,
                muted: isHidden,
                keepOpen: true,
                end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
                sortKey: row.key,
                onSelect: () =>
                  change({
                    hidden: listOnly(isHidden ? hidden.filter((other) => !row.sections.includes(other)) : [...hidden, ...row.sections]),
                    order: listOnly(everyOrdered),
                  }),
              }
            })
        : undefined,
      // Dragged rows, each opened back into its sections.
      change
        ? (keys) =>
            change({
              hidden: listOnly(hidden),
              order: listOnly(keys.flatMap((key) => rows.find((row) => row.key === key)?.sections ?? [])),
            })
        : undefined
    )
    if (!blocks) return <NotHere />
    return (
      <DashboardsRows
        current={current}
        onPick={(key) => {
          const row = rows.find((one) => one.key === key)
          if (!row) return
          const last = remembered.section
          const open = row.key === folded?.key ? (last && !hidden.includes(last) ? last : row.sections.find((section) => !hidden.includes(section))) : row.sections[0]
          if (open) blocks.onPickSection(open)
        }}
        sections={rows
          .filter((row) => row.key === current || !rowHidden(row))
          .map((row) => {
            const counts = row.sections.map((section) => blocks.counts[section]).filter((count): count is number => count !== null)
            return {
              key: row.key,
              label: row.label,
              value: counts.length ? counts.reduce((sum, count) => sum + count, 0).toLocaleString() : undefined,
            }
          })}
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

  /** Dashboards (fixed, never in the "/" list), then Projects under Advanced blocks when there is one. */
  const appBlocks: readonly AppBlock[] = [
    {
      key: "promoSections",
      label: "Dashboards",
      icon: LayoutDashboardIcon,
      node: config.sectionsNode,
      extension: keepOnPage(blockNode(config.sectionsNode, {}, SectionsView)),
      offered: false,
    },
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
