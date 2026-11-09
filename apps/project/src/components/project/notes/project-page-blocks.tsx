import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { FlagIcon } from "lucide-react"

import { BLOCK_FRAME, BlockLine, type BlockEditing } from "@/components/project/notes/note-block-drawings"
import { ProjectBlockCard, QuietHeadingButtons } from "@/components/project/notes/project-block-card"
import { AddMilestoneButton, MilestoneList } from "@/components/project/project-milestones"
import type { Milestone } from "@/lib/api/project/projects"
import type { TaskCard } from "@/lib/api/project/tasks"

/**
 * The block only a project's own page offers (Tyler, 9 Nov 2026: "remove the
 * details card and make milestone a block"): Milestones, which was a card at
 * the foot of the project's left panel. It draws from what the project page
 * already loaded, handed down by `ProjectPageBlocksProvider`, so it follows
 * the page's reloads.
 */

export type ProjectPageBlocks = {
  projectId: string
  milestones: Milestone[]
  /** The project's tasks, for each milestone's list. */
  tasks: TaskCard[]
  /** An archived project: its milestones show, and nothing changes. */
  readOnly: boolean
}

const ProjectPageBlocksContext = React.createContext<ProjectPageBlocks | null>(null)

export function ProjectPageBlocksProvider({ value, children }: { value: ProjectPageBlocks; children: React.ReactNode }) {
  return <ProjectPageBlocksContext.Provider value={value}>{children}</ProjectPageBlocksContext.Provider>
}

export function MilestonesBlockView(props: NodeViewProps) {
  return (
    <NodeViewWrapper data-selected={props.selected || undefined} data-note-block="" data-note-atom="" className={BLOCK_FRAME}>
      <MilestonesDrawing editing={{ editable: props.editor.isEditable, remove: props.deleteNode }} />
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
