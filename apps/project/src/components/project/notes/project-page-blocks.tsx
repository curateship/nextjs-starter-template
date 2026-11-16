import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, LayoutDashboardIcon } from "lucide-react"

import { editingOf } from "@/components/project/notes/block-editing"
import { ADVANCED_BLOCK_FRAME, BlockLine, type BlockEditing } from "@/components/project/notes/note-block-drawings"
import { ProjectBlockCard } from "@/components/project/notes/project-block-card"
import type { BlockMenuItem } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { PROJECT_SECTIONS_NODE, type NoteNode } from "@/lib/project/note-blocks"
import {
  orderedSections,
  PROJECT_SECTION_LABEL,
  type ProjectSection,
  type SectionSettings,
} from "@/lib/project/project-sections"

/**
 * The block only a project's own page has: Dashboards, a row each for the
 * project's Tasks, Notes and Milestones (Tyler, 16 Nov 2026: "remove the notes
 * and milestone block and instead create a dashboards for it. Also need to
 * create a fixed block for link dashboards"). It replaced the Milestones block
 * (9 Nov 2026) and the Notes block (15 Nov 2026), whose lists are now the
 * Milestones and Notes dashboards.
 *
 * It is fixed, as the Admin and CRM pages' Dashboards blocks are: never in the
 * "/" list, the editor refuses to take it off, a page saved without it gets
 * it back at the top (`cleanNoteBody`), and its ⋮ holds no Delete block.
 *
 * Its ⋮ lists the three with an eye that hides or shows each, the rows
 * dragging into a new order, then Move up and Move down (Tyler, 16 Nov 2026:
 * "missing 3 dot dropdown to move block up and down as well as hide/unhide
 * items"). Both are kept on the block, in the page, so everyone on the
 * project sees the same rows. The dashboard showing keeps its row while
 * hidden, until another is picked. Only whoever writes the page changes them:
 * the site admin, and on a locked page the change unlocks it, saves and
 * locks it again, as the shell's locked pages move their blocks.
 */

export type ProjectPageBlocks = {
  /** The dashboard showing now, from the address. */
  section: ProjectSection
  onPick: (section: ProjectSection) => void
  /** Each row's count; one not known yet shows none. */
  counts: Partial<Record<ProjectSection, number>>
  /**
   * On a locked page the site admin could otherwise write: changes the saved
   * page in one save that unlocks it and locks it again.
   */
  lockedPage?: { body: NoteNode; change: (next: NoteNode) => void }
}

const ProjectPageBlocksContext = React.createContext<ProjectPageBlocks | null>(null)

export function ProjectPageBlocksProvider({ value, children }: { value: ProjectPageBlocks; children: React.ReactNode }) {
  return <ProjectPageBlocksContext.Provider value={value}>{children}</ProjectPageBlocksContext.Provider>
}

export function ProjectSectionsBlockView(props: NodeViewProps) {
  return (
    <NodeViewWrapper data-selected={props.selected || undefined} data-note-block="" data-note-atom="" className={ADVANCED_BLOCK_FRAME}>
      <ProjectSectionsDrawing
        editing={editingOf(props)}
        settings={props.node.attrs as SectionSettings}
        onSettings={props.editor.isEditable ? (next) => props.updateAttributes(next) : undefined}
      />
    </NodeViewWrapper>
  )
}

/** The page with the Dashboards block's settings changed, for a locked page's one save. */
function withSettings(body: NoteNode, next: SectionSettings): NoteNode {
  return {
    ...body,
    content: (body.content ?? []).map((node) =>
      node.type === PROJECT_SECTIONS_NODE ? { ...node, attrs: { ...node.attrs, ...next } } : node
    ),
  }
}

/** The page with the Dashboards block swapped with the line or block beside it. */
function withBlockMoved(body: NoteNode, direction: -1 | 1): NoteNode | null {
  const content = [...(body.content ?? [])]
  const at = content.findIndex((node) => node.type === PROJECT_SECTIONS_NODE)
  const to = at + direction
  if (at < 0 || to < 0 || to >= content.length) return null
  ;[content[at], content[to]] = [content[to], content[at]]
  return { ...body, content }
}

/**
 * The rows, drawn the shell's way (`DashboardsRows`): the picked one dark with
 * its bar, a count in each pill. `settings` are the block's own; `onSettings`
 * is given while the page can be written on.
 */
export function ProjectSectionsDrawing({
  editing,
  settings = {},
  onSettings,
}: {
  editing: BlockEditing
  settings?: SectionSettings
  onSettings?: (next: SectionSettings) => void
}) {
  const blocks = React.useContext(ProjectPageBlocksContext)
  const locked = blocks?.lockedPage
  const change = onSettings ?? (locked ? (next: SectionSettings) => locked.change(withSettings(locked.body, next)) : undefined)
  const hidden = settings.hidden ?? []
  const ordered = orderedSections(settings.order)

  const menu: BlockMenuItem[] | undefined = change
    ? ordered.map((section) => {
        const isHidden = hidden.includes(section)
        const label = PROJECT_SECTION_LABEL[section]
        return {
          label,
          ariaLabel: `${isHidden ? "Show" : "Hide"} ${label}`,
          muted: isHidden,
          keepOpen: true,
          end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
          sortKey: section,
          onSelect: () => change({ hidden: isHidden ? hidden.filter((other) => other !== section) : [...hidden, section] }),
        }
      })
    : undefined
  const onReorder = change ? (keys: string[]) => change({ order: keys }) : undefined

  // A locked page's block moves through the same one save.
  const lockedMoves = locked
    ? () =>
        ([-1, 1] as const).flatMap((direction) => {
          const moved = withBlockMoved(locked.body, direction)
          if (!moved) return []
          return [
            {
              label: direction === -1 ? "Move up" : "Move down",
              icon: direction === -1 ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />,
              onSelect: () => locked.change(moved),
            },
          ]
        })
    : undefined
  const cardEditing = editing.editable || !lockedMoves ? editing : { ...editing, moves: lockedMoves }

  if (!blocks) {
    return (
      <BlockLine editing={editing} label="Dashboards">
        This block shows on a project's page.
      </BlockLine>
    )
  }
  return (
    <ProjectBlockCard
      editing={cardEditing}
      kind="project-sections"
      title="Dashboards"
      icon={<LayoutDashboardIcon className="size-4" />}
      menu={menu}
      onReorder={onReorder}
      fixed
    >
      <DashboardsRows
        current={blocks.section}
        onPick={blocks.onPick}
        sections={ordered
          .filter((section) => section === blocks.section || !hidden.includes(section))
          .map((section) => ({
            key: section,
            label: PROJECT_SECTION_LABEL[section],
            value: blocks.counts[section]?.toLocaleString(),
          }))}
      />
    </ProjectBlockCard>
  )
}
