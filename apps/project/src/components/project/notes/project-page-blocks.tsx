import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { FlagIcon, NotebookPenIcon } from "lucide-react"

import { editingOf } from "@/components/project/notes/block-editing"
import { ADVANCED_BLOCK_FRAME, BlockLine, type BlockEditing } from "@/components/project/notes/note-block-drawings"
import { ProjectBlockCard, QuietHeadingButtons } from "@/components/project/notes/project-block-card"
import { AddMilestoneButton, MilestoneList } from "@/components/project/project-milestones"
import { ProjectNotes } from "@/components/project/project-notes-panel"
import type { Milestone } from "@/lib/api/project/projects"
import type { TaskCard } from "@/lib/api/project/tasks"

/**
 * The blocks only a project's own page offers. Milestones (Tyler, 9 Nov 2026:
 * "remove the details card and make milestone a block") was a card at the
 * foot of the project's left panel; it draws from what the project page
 * already loaded, handed down by `ProjectPageBlocksProvider`, so it follows
 * the page's reloads. Notes (task "Misc/writing-canvas", 15 Nov 2026: "Turn
 * notes into block") was a list behind a note icon in the panel's header.
 */

export type ProjectPageBlocks = {
  projectId: string
  milestones: Milestone[]
  /** The project's tasks, for each milestone's list. */
  tasks: TaskCard[]
  /** An archived project: its milestones show, and nothing changes. */
  readOnly: boolean
  /** A note a # link asked for; `at` changes with each link, so the same note opens again. */
  noteLink: { noteId: string; at: number } | null
  /** Told while a Notes block is on the page, so a # link knows where to open. */
  notesBlockShown: (shown: boolean) => void
}

const ProjectPageBlocksContext = React.createContext<ProjectPageBlocks | null>(null)

export function ProjectPageBlocksProvider({ value, children }: { value: ProjectPageBlocks; children: React.ReactNode }) {
  return <ProjectPageBlocksContext.Provider value={value}>{children}</ProjectPageBlocksContext.Provider>
}

export function MilestonesBlockView(props: NodeViewProps) {
  return (
    <NodeViewWrapper data-selected={props.selected || undefined} data-note-block="" data-note-atom="" className={ADVANCED_BLOCK_FRAME}>
      <MilestonesDrawing editing={editingOf(props)} />
    </NodeViewWrapper>
  )
}

/**
 * The project's milestones in the block card, their count by the title and
 * the "+" that adds one shown while the heading is pointed at. Anyone on the
 * project may add one, as they could from the card, until it's archived.
 */
export function MilestonesDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = React.useContext(ProjectPageBlocksContext)
  if (!blocks) {
    return (
      <BlockLine editing={editing} label="Remove milestones">
        This block shows on a project's page.
      </BlockLine>
    )
  }
  return (
    <ProjectBlockCard
      editing={editing}
      kind="milestones"
      title="Milestones"
      icon={<FlagIcon className="size-4" />}
      count={blocks.milestones.length || undefined}
    >
      {blocks.readOnly ? null : (
        <QuietHeadingButtons>
          <AddMilestoneButton projectId={blocks.projectId} />
        </QuietHeadingButtons>
      )}
      <MilestoneList
        projectId={blocks.projectId}
        milestones={blocks.milestones}
        tasks={blocks.tasks}
        readOnly={blocks.readOnly}
      />
    </ProjectBlockCard>
  )
}

export function ProjectNotesBlockView(props: NodeViewProps) {
  return (
    <NodeViewWrapper data-selected={props.selected || undefined} data-note-block="" data-note-atom="" className={ADVANCED_BLOCK_FRAME}>
      <ProjectNotesDrawing editing={editingOf(props)} />
    </NodeViewWrapper>
  )
}

/**
 * The project's notes in the block card: the list, New note, and a note
 * opened in the block's own place with Back to notes under it. Who may write
 * comes from the server with the notes, not from the page, so everyone on
 * the project writes notes on a page they only read.
 */
export function ProjectNotesDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = React.useContext(ProjectPageBlocksContext)
  const shown = blocks?.notesBlockShown
  React.useEffect(() => {
    if (!shown) return
    shown(true)
    return () => shown(false)
  }, [shown])
  if (!blocks) {
    return (
      <BlockLine editing={editing} label="Remove notes">
        This block shows on a project's page.
      </BlockLine>
    )
  }
  const link = blocks.noteLink
  return (
    <ProjectBlockCard editing={editing} kind="projectNotes" title="Notes" icon={<NotebookPenIcon className="size-4" />}>
      <ProjectNotes
        key={`${blocks.projectId}:${link?.at ?? "notes"}`}
        projectId={blocks.projectId}
        startOpen={link?.noteId ?? null}
        inBlock
      />
    </ProjectBlockCard>
  )
}
