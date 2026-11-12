import * as React from "react"

import {
  DailyCardDrawing,
  ProjectDrawing,
  RatingMonthDrawing,
  RatingTrendDrawing,
  InboxDrawing,
  LookBackDrawing,
} from "@/components/project/notes/dashboard-blocks"
import {
  AttentionDrawing,
  CheckinsDrawing,
  MembersDrawing,
  WeekDrawing,
  WorkloadDrawing,
} from "@/components/project/notes/team-blocks"
import { MilestonesDrawing } from "@/components/project/notes/project-page-blocks"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import {
  CalloutFrame,
  CommentsDrawing,
  FileDrawing,
  FoldHeading,
  ImageDrawing,
  RecordDrawing,
  TaskCardDrawing,
  VideoDrawing,
  WebPageDrawing,
  LinksDrawing,
  type BlockEditing,
} from "@/components/project/notes/note-block-drawings"
import { hiddenByFolds, useFoldsVersion } from "@/components/project/notes/note-folds"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import {
  ADVANCED_ATOM_TYPES,
  NOTE_ATOM_TYPES,
  NOTE_HOLDER_TYPES,
  type CalloutKind,
  type NoteImageAttrs,
  type NoteLink,
  type NoteNode,
} from "@/lib/project/note-blocks"

/**
 * A note drawn for someone who reads it rather than writes in it (Project
 * note blocks task, part 1): the words through the shell's `WrittenPageBody`,
 * exactly as before, and each "/" block through the same drawing the editor
 * uses. Nothing here builds a string of markup. Ticks show but can't be
 * changed, and Fold sections fold for this reader alone.
 */

const READING: BlockEditing = { editable: false, remove: () => undefined }
const BLOCK_TYPES = new Set<string>([...NOTE_ATOM_TYPES, ...NOTE_HOLDER_TYPES])
/** The reader's frame for a block: the editor's, less the editor's own gap above and below. */
const READER_FRAME = "group/block relative [&_a]:text-inherit! [&_a]:no-underline! [&_a:hover]:text-foreground!"
/** An advanced block's frame, reaching the panel's edges as in the editor (`ADVANCED_BLOCK_FRAME`). */
const ADVANCED_READER_FRAME = `${READER_FRAME} mx-[calc(var(--panel-gutter,0px)*var(--shell-block-bleed,0)*-1)]`

function holdsBlocks(node: NoteNode): boolean {
  return BLOCK_TYPES.has(node.type) || (node.content ?? []).some(holdsBlocks)
}

function text(attr: unknown) {
  return typeof attr === "string" ? attr : null
}

function Block({ node }: { node: NoteNode }) {
  const attrs = node.attrs ?? {}
  const none = () => undefined
  switch (node.type) {
    case "noteImage":
      return <ImageDrawing attrs={attrs as Partial<NoteImageAttrs>} editing={READING} onPick={none} />
    case "noteVideo":
      return <VideoDrawing url={text(attrs.url)} editing={READING} onSet={none} />
    case "noteTask":
      return <TaskCardDrawing taskId={text(attrs.taskId)} editing={READING} onPick={none} />
    case "noteFile":
      return <FileDrawing fileId={text(attrs.fileId)} editing={READING} onPick={none} />
    case "noteComments":
      return <CommentsDrawing editing={READING} />
    case "noteRecord":
      return <RecordDrawing editing={READING} />
    case "noteWebPage":
      return <WebPageDrawing url={text(attrs.url)} editing={READING} onSet={none} />
    case "noteLinks":
      return <LinksDrawing links={(Array.isArray(attrs.links) ? attrs.links : []) as NoteLink[]} editing={READING} onChange={none} />
    case "horizontalRule":
      return <hr className="border-t" />
    // The site admin's own page, read only while it's locked.
    case "noteProject":
      return <ProjectDrawing projectId={text(attrs.projectId)} editing={READING} onPick={none} />
    case "noteHabit":
      return <DailyCardDrawing editing={READING} />
    case "noteRatingMonth":
      return <RatingMonthDrawing editing={READING} />
    case "noteRatingTrend":
      return <RatingTrendDrawing editing={READING} />
    case "noteInbox":
      return <InboxDrawing editing={READING} />
    case "noteLookBack":
      return <LookBackDrawing editing={READING} />
    // A team's page, as every member but the site admin reads it.
    case "noteTeamCheckins":
      return <CheckinsDrawing editing={READING} />
    case "noteTeamWorkload":
      return <WorkloadDrawing editing={READING} />
    case "noteTeamAttention":
      return <AttentionDrawing editing={READING} />
    case "noteTeamWeek":
      return <WeekDrawing editing={READING} />
    case "noteTeamMembers":
      return <MembersDrawing editing={READING} />
    // A project's page, as everyone but the site admin reads it.
    case "noteMilestones":
      return <MilestonesDrawing editing={READING} />
    case "noteCallout":
      return (
        <CalloutFrame kind={(attrs.kind as CalloutKind) ?? "note"} editing={READING}>
          <NoteChildren nodes={node.content ?? []} />
        </CalloutFrame>
      )
    case "noteFold":
      return (
        <FoldHeading id={String(attrs.id)} editing={READING}>
          <WrittenPageBody body={{ type: "doc", content: [{ type: "paragraph", content: node.content as WrittenPageNode[] }] }} />
        </FoldHeading>
      )
    case "taskList":
      return (
        <ul className="grid gap-1 text-sm">
          {(node.content ?? []).map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={item.attrs?.checked === true}
                disabled
                aria-label={item.attrs?.checked === true ? "Done" : "Not done"}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <div className={item.attrs?.checked === true ? "min-w-0 flex-1 text-muted-foreground line-through" : "min-w-0 flex-1"}>
                <NoteChildren nodes={item.content ?? []} />
              </div>
            </li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

/** A list or quote with a block somewhere inside it, drawn the way `WrittenPageBody` draws one. */
function Container({ node }: { node: NoteNode }) {
  const inner = <NoteChildren nodes={node.content ?? []} />
  if (node.type === "bulletList") return <ul className="grid gap-1 pl-5 text-sm [&>li]:list-disc">{inner}</ul>
  if (node.type === "orderedList") return <ol className="grid gap-1 pl-5 text-sm [&>li]:list-decimal">{inner}</ol>
  if (node.type === "listItem") return <li className="leading-relaxed">{inner}</li>
  if (node.type === "blockquote") return <blockquote className="border-l-2 pl-4 text-sm text-muted-foreground">{inner}</blockquote>
  return inner
}

/** A run of children: words in one `WrittenPageBody`, each block in its own frame. */
function NoteChildren({ nodes, hidden }: { nodes: NoteNode[]; hidden?: boolean[] }) {
  const parts: React.ReactNode[] = []
  let words: NoteNode[] = []
  const flush = () => {
    if (!words.length) return
    parts.push(<WrittenPageBody key={`words-${parts.length}`} body={{ type: "doc", content: words as WrittenPageNode[] }} />)
    words = []
  }
  nodes.forEach((node, index) => {
    if (hidden?.[index]) return
    if (!holdsBlocks(node)) {
      words.push(node)
      return
    }
    flush()
    parts.push(
      BLOCK_TYPES.has(node.type) ? (
        <div key={index} data-note-block="" className={ADVANCED_ATOM_TYPES.has(node.type) ? ADVANCED_READER_FRAME : READER_FRAME}>
          <Block node={node} />
        </div>
      ) : (
        <Container key={index} node={node} />
      )
    )
  })
  flush()
  return <div className="grid gap-4">{parts}</div>
}

export function NoteReader({ body }: { body: NoteNode }) {
  // A fold anywhere on the page redraws which blocks sit under a folded heading.
  useFoldsVersion()
  const nodes = body.content ?? []
  const hidden = hiddenByFolds(nodes, (node) => (node.type === "noteFold" ? String(node.attrs?.id) : null))
  return <NoteChildren nodes={nodes} hidden={hidden} />
}
