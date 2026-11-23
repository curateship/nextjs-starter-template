import * as React from "react"
import {
  EllipsisIcon,
  EyeIcon,
  EyeOffIcon,
  FlameIcon,
  FolderIcon,
  FolderPlusIcon,
  LayoutDashboardIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ViralPageFigures } from "@/lib/api/viral/viral-dashboard"
import type { ViralFolderSummary } from "@/lib/api/viral/viral-projects"
import { orderSections } from "@/lib/layout/styling-values"
import { VIRAL_FOLDERS_NODE, VIRAL_PROJECTS_NODE, VIRAL_SECTIONS_NODE } from "@/lib/viral/dashboard-page"
import {
  VIRAL_LIST_SECTIONS,
  VIRAL_SECTION_LABELS,
  VIRAL_SECTIONS,
  type ViralListSection,
  type ViralSection,
} from "@/lib/viral/dashboard-search"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/viral/project-folders"


/**
 * The Viral dashboard's own "/" blocks on its left page (task features/03),
 * drawn the way Directory's Events dashboard's are:
 *
 * - **Dashboards**, fixed: Overview, Projects, Vault, Hooks and Formats, the
 *   one showing picked, each with its count. Its ⋮ shows and hides every
 *   row but Overview and drags them into order.
 * - **Projects**: "All projects", then each project that isn't archived.
 *   As Promo's Projects block, a project narrows whichever row is showing
 *   to it (`?project=`), with each project's ideas, or hooks on Hooks, in
 *   its pill. It took the place of the project lists on the left of the old
 *   Vault and Library pages.
 * - **Folders**: All, No folder, each folder and Archived. Pressing one
 *   narrows the Projects row. Its ⋮ holds New folder, and a folder row's ⋯
 *   Rename and Delete. It took the place of the old Projects page's folder
 *   dropdown.
 */

export type ViralBlocks = {
  section: ViralSection
  onPickSection: (section: ViralSection) => void
  hiddenSections: readonly ViralListSection[]
  sectionOrder: readonly ViralListSection[]
  onSectionsChange: (sections: { hidden: ViralListSection[]; order: ViralListSection[] }) => void
  /** Each row's count. Null while it is read. */
  counts: Record<ViralSection, number | null>
  /** The projects and folders, or null while read. */
  figures: ViralPageFigures | null
  /** The project Vault, Hooks or Formats is narrowed to, or "". */
  activeProject: string
  onProject: (projectId: string) => void
  /** The folder the Projects row is narrowed to: "", `none`, `archived` or a folder's id. */
  activeFolder: string
  onFolder: (folder: string) => void
  onNewFolder: () => void
  onRenameFolder: (folder: ViralFolderSummary) => void
  onDeleteFolder: (folder: ViralFolderSummary) => void
}

const Context = React.createContext<ViralBlocks | null>(null)

export function ViralBlocksProvider({ value, children }: { value: ViralBlocks; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

const listOnly = (sections: readonly string[]): ViralListSection[] =>
  sections.filter((section): section is ViralListSection => (VIRAL_LIST_SECTIONS as readonly string[]).includes(section))

function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Viral dashboard.</p>
}

export function ViralSectionsBlock() {
  const blocks = React.useContext(Context)
  const hidden: readonly ViralSection[] = blocks?.hiddenSections ?? []
  const ordered = orderSections(VIRAL_SECTIONS, blocks?.sectionOrder)
  const change = blocks?.onSectionsChange
  useBlockMenu(
    change
      ? ordered
          .filter((section) => (VIRAL_LIST_SECTIONS as readonly string[]).includes(section))
          .map((section) => {
            const isHidden = hidden.includes(section)
            return {
              label: VIRAL_SECTION_LABELS[section],
              ariaLabel: `${isHidden ? "Show" : "Hide"} ${VIRAL_SECTION_LABELS[section]}`,
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
          label: VIRAL_SECTION_LABELS[section],
          value: blocks.counts[section]?.toLocaleString(),
        }))}
    />
  )
}

function ProjectsBlock() {
  const blocks = React.useContext(Context)
  useBlockCount(blocks?.figures?.projects.length || undefined)
  if (!blocks) return <NotHere />
  if (!blocks.figures) return <p className="px-4 py-3 text-sm text-muted-foreground">Reading…</p>
  // As Promo's Projects block: a project narrows whichever row is showing to
  // it, and pressing it again lets it go. Formats belong to no project, so
  // there it picks the project Write a script writes for, with no counts.
  const figure = (row: { vaultCount: number; hookCount: number }) =>
    blocks.section === "hooks" ? row.hookCount : blocks.section === "formats" || blocks.section === "projects" ? null : row.vaultCount
  const total = blocks.section === "hooks" ? blocks.counts.hooks : blocks.section === "vault" || blocks.section === "overview" ? blocks.counts.vault : null
  return (
    <SideRows
      empty="No projects yet. Press + at the top of this panel to make one."
      rows={[
        { key: "all", name: "All projects", value: total?.toLocaleString(), picked: !blocks.activeProject, onPress: () => blocks.onProject("") },
        ...blocks.figures.projects.map((row) => ({
          key: row.id,
          name: row.name,
          value: figure(row)?.toLocaleString(),
          picked: blocks.activeProject === row.id,
          onPress: () => blocks.onProject(blocks.activeProject === row.id ? "" : row.id),
        })),
      ]}
    />
  )
}

function FoldersBlock() {
  const blocks = React.useContext(Context)
  useBlockMenu(blocks ? [{ label: "New folder", icon: <FolderPlusIcon />, onSelect: blocks.onNewFolder }] : undefined)
  useBlockCount(blocks?.figures?.folders.rows.length || undefined)
  if (!blocks) return <NotHere />
  if (!blocks.figures) return <p className="px-4 py-3 text-sm text-muted-foreground">Reading…</p>
  const { folders } = blocks.figures
  // Picked only while the Projects row shows, since only it is narrowed.
  const picking = blocks.section === "projects"
  const pick = (folder: string) => ({
    picked: picking ? blocks.activeFolder === folder : undefined,
    onPress: () => blocks.onFolder(picking && blocks.activeFolder === folder ? "" : folder),
  })
  return (
    <SideRows
      showAll
      empty="No folders yet."
      rows={[
        { key: "all", name: "All projects", value: folders.all.toLocaleString(), ...pick("") },
        { key: NO_FOLDER, name: "No folder", value: folders.none.toLocaleString(), ...pick(NO_FOLDER) },
        ...folders.rows.map((folder) => ({
          key: folder.id,
          name: folder.name,
          value: folder.count.toLocaleString(),
          ...pick(folder.id),
          menu: (
            <FolderRowMenu
              name={folder.name}
              onRename={() => blocks.onRenameFolder({ id: folder.id, name: folder.name, project_count: folder.count })}
              onDelete={() => blocks.onDeleteFolder({ id: folder.id, name: folder.name, project_count: folder.count })}
            />
          ),
        })),
        { key: ARCHIVED_PROJECTS, name: "Archived", value: folders.archived.toLocaleString(), ...pick(ARCHIVED_PROJECTS) },
      ]}
    />
  )
}

/** A folder row's ⋯: Rename, then Delete under a line. */
function FolderRowMenu({ name, onRename, onDelete }: { name: string; onRename: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`More for ${name}`}>
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onRename}>
          <PencilIcon />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SectionsView = blockView({
  kind: "viral-sections",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: ViralSectionsBlock,
  fixed: true,
})

const ProjectsView = blockView({
  kind: "viral-projects",
  title: "Projects",
  icon: <FlameIcon />,
  Draw: ProjectsBlock,
})

const FoldersView = blockView({
  kind: "viral-folders",
  title: "Folders",
  icon: <FolderIcon />,
  Draw: FoldersBlock,
})

/** Dashboards (fixed, never in the "/" list), then Projects and Folders under Advanced blocks. */
export const VIRAL_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "viralSections",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: VIRAL_SECTIONS_NODE,
    extension: keepOnPage(blockNode(VIRAL_SECTIONS_NODE, {}, SectionsView)),
    offered: false,
  },
  {
    key: "viralProjects",
    label: "Projects",
    icon: FlameIcon,
    node: VIRAL_PROJECTS_NODE,
    extension: blockNode(VIRAL_PROJECTS_NODE, {}, ProjectsView),
  },
  {
    key: "viralFolders",
    label: "Folders",
    icon: FolderIcon,
    node: VIRAL_FOLDERS_NODE,
    extension: blockNode(VIRAL_FOLDERS_NODE, {}, FoldersView),
  },
]
