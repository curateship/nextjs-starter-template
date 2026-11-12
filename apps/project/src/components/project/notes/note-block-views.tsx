import * as React from "react"
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"

import {
  ADVANCED_BLOCK_FRAME,
  BLOCK_FRAME,
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
import type { CalloutKind, NoteImageAttrs, NoteLink } from "@/lib/project/note-blocks"

/**
 * Each "/" block as the editor draws it (Project note blocks task): the
 * block's frame, and its drawing from `note-block-drawings.tsx` with the
 * editor's own ways to fill, change and remove it.
 */

/**
 * `atom` for a block with no writing inside, so the note's own list and
 * paragraph styles stay out of it. `advanced` for Task card, File, Comments
 * and Video or Promo, which reach the panel's edges with "Advanced blocks
 * reach the panel's edges" on (`ADVANCED_ATOM_TYPES`).
 */
function Frame({
  selected,
  atom = true,
  advanced = false,
  children,
}: {
  selected: boolean
  atom?: boolean
  advanced?: boolean
  children: React.ReactNode
}) {
  return (
    <NodeViewWrapper
      data-selected={selected || undefined}
      data-note-block=""
      data-note-atom={atom ? "" : undefined}
      className={advanced ? ADVANCED_BLOCK_FRAME : BLOCK_FRAME}
    >
      {children}
    </NodeViewWrapper>
  )
}

/**
 * Fills the block in, then puts the cursor on the line under it. The button or field that filled
 * it goes away as it does, and without this the cursor would leave the notes with it, which saves
 * and redraws them as if the person had clicked away.
 */
function fill(props: NodeViewProps, attrs: Record<string, unknown>) {
  props.updateAttributes(attrs)
  window.requestAnimationFrame(() => {
    const { editor } = props
    const at = props.getPos()
    if (editor.isDestroyed || typeof at !== "number") return
    const after = at + props.node.nodeSize
    const next = editor.state.doc.nodeAt(after)
    if (next?.isTextblock) editor.chain().focus().setTextSelection(after + 1).run()
    else editor.commands.focus()
  })
}

function editingOf({ editor, deleteNode }: NodeViewProps): BlockEditing {
  return { editable: editor.isEditable, remove: deleteNode }
}

/** A block not filled in yet is never saved, so a note that can't be written in never shows one. */
function emptyAndLocked(props: NodeViewProps, filled: boolean) {
  return !filled && !props.editor.isEditable
}

export function ImageBlockView(props: NodeViewProps) {
  const attrs = props.node.attrs as Partial<NoteImageAttrs>
  if (emptyAndLocked(props, Boolean(attrs.src || attrs.fileId))) return <NodeViewWrapper />
  return (
    <Frame selected={props.selected}>
      <ImageDrawing attrs={attrs} editing={editingOf(props)} onPick={(next) => fill(props, next)} />
    </Frame>
  )
}

export function VideoBlockView(props: NodeViewProps) {
  const url = typeof props.node.attrs.url === "string" ? props.node.attrs.url : null
  if (emptyAndLocked(props, Boolean(url))) return <NodeViewWrapper />
  return (
    <Frame selected={props.selected}>
      <VideoDrawing url={url} editing={editingOf(props)} onSet={(next) => fill(props, { url: next })} />
    </Frame>
  )
}

export function TaskBlockView(props: NodeViewProps) {
  const taskId = typeof props.node.attrs.taskId === "string" ? props.node.attrs.taskId : null
  if (emptyAndLocked(props, Boolean(taskId))) return <NodeViewWrapper />
  return (
    <Frame selected={props.selected} advanced>
      <TaskCardDrawing taskId={taskId} editing={editingOf(props)} onPick={(next) => fill(props, { taskId: next })} />
    </Frame>
  )
}

export function FileBlockView(props: NodeViewProps) {
  const fileId = typeof props.node.attrs.fileId === "string" ? props.node.attrs.fileId : null
  if (emptyAndLocked(props, Boolean(fileId))) return <NodeViewWrapper />
  return (
    <Frame selected={props.selected} advanced>
      <FileDrawing fileId={fileId} editing={editingOf(props)} onPick={(next) => fill(props, { fileId: next })} />
    </Frame>
  )
}

export function CommentsBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected} advanced>
      <CommentsDrawing editing={editingOf(props)} />
    </Frame>
  )
}

export function RecordBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected} advanced>
      <RecordDrawing editing={editingOf(props)} />
    </Frame>
  )
}

export function WebPageBlockView(props: NodeViewProps) {
  const url = typeof props.node.attrs.url === "string" ? props.node.attrs.url : null
  if (emptyAndLocked(props, Boolean(url))) return <NodeViewWrapper />
  return (
    <Frame selected={props.selected}>
      <WebPageDrawing url={url} editing={editingOf(props)} onSet={(next) => fill(props, { url: next })} />
    </Frame>
  )
}

export function LinksBlockView(props: NodeViewProps) {
  const links = (Array.isArray(props.node.attrs.links) ? props.node.attrs.links : []) as NoteLink[]
  if (emptyAndLocked(props, links.length > 0)) return <NodeViewWrapper />
  // Each change saves the whole list; the cursor stays in the block's own fields while it's open.
  return (
    <Frame selected={props.selected}>
      <LinksDrawing links={links} editing={editingOf(props)} onChange={(next) => props.updateAttributes({ links: next })} />
    </Frame>
  )
}

export function CalloutBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected} atom={false}>
      <CalloutFrame
        kind={props.node.attrs.kind as CalloutKind}
        editing={editingOf(props)}
        onKind={(kind) => props.updateAttributes({ kind })}
      >
        <NodeViewContent />
      </CalloutFrame>
    </Frame>
  )
}

export function FoldBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected} atom={false}>
      <FoldHeading id={String(props.node.attrs.id)} editing={editingOf(props)}>
        <NodeViewContent />
      </FoldHeading>
    </Frame>
  )
}
