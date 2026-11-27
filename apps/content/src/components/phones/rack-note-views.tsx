import type * as React from "react"
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"

import {
  BLOCK_FRAME,
  CalloutFrame,
  FoldHeading,
  ImageDrawing,
  LinksDrawing,
  VideoDrawing,
  type BlockEditing,
} from "@/components/phones/rack-note-drawings"
import type { CalloutKind, NoteImageAttrs, NoteLink } from "@/lib/phones/rack-notes"

/**
 * Each "/" block in a rack's notes as the editor draws it, copied from
 * Project (`apps/project/src/components/project/notes/note-block-views.tsx`):
 * the block's frame, and its drawing from `rack-note-drawings.tsx` with the
 * editor's own ways to fill, change and remove it.
 */

/** `atom` for a block with no writing inside, so the notes' own list and paragraph styles stay out of it. */
function Frame({ selected, atom = true, children }: { selected: boolean; atom?: boolean; children: React.ReactNode }) {
  return (
    <NodeViewWrapper data-selected={selected || undefined} data-note-block="" data-note-atom={atom ? "" : undefined} className={BLOCK_FRAME}>
      {children}
    </NodeViewWrapper>
  )
}

/** Fills the block in, then puts the cursor on the line under it, so the notes are not left as if clicked away. */
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

export function ImageBlockView(props: NodeViewProps) {
  const attrs = props.node.attrs as Partial<NoteImageAttrs>
  return (
    <Frame selected={props.selected}>
      <ImageDrawing attrs={attrs} editing={editingOf(props)} onPick={(next) => fill(props, next)} />
    </Frame>
  )
}

export function VideoBlockView(props: NodeViewProps) {
  const url = typeof props.node.attrs.url === "string" ? props.node.attrs.url : null
  return (
    <Frame selected={props.selected}>
      <VideoDrawing url={url} editing={editingOf(props)} onSet={(next) => fill(props, { url: next })} />
    </Frame>
  )
}

export function LinksBlockView(props: NodeViewProps) {
  const links = (Array.isArray(props.node.attrs.links) ? props.node.attrs.links : []) as NoteLink[]
  return (
    <Frame selected={props.selected}>
      <LinksDrawing links={links} editing={editingOf(props)} onChange={(next) => props.updateAttributes({ links: next })} />
    </Frame>
  )
}

export function CalloutBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected} atom={false}>
      <CalloutFrame kind={props.node.attrs.kind as CalloutKind} editing={editingOf(props)} onKind={(kind) => props.updateAttributes({ kind })}>
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
