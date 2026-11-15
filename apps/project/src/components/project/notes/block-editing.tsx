import type { NodeViewProps } from "@tiptap/react"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import type { BlockEditing } from "@/components/project/notes/note-block-drawings"
import type { BlockMenuItem } from "@/components/shared/notes/block-card"

/**
 * What a block's node view hands its drawing: whether the page can be
 * written on, Delete block, and Move up and Move down (Tyler, 15 Nov 2026:
 * "make sure all the blocks have the move up and down function like shell").
 * The moves are worked out when asked, since a block's neighbours change
 * without its own view drawing again.
 */
export function editingOf({ editor, deleteNode, getPos }: NodeViewProps): BlockEditing {
  return {
    editable: editor.isEditable,
    remove: deleteNode,
    moves: () => {
      const pos = getPos()
      if (typeof pos !== "number" || !editor.isEditable) return []
      const up = moveBlock(editor, pos, -1)
      const down = moveBlock(editor, pos, 1)
      return [
        ...(up ? [{ label: "Move up", icon: <ArrowUpIcon className="size-4" />, onSelect: up }] : []),
        ...(down ? [{ label: "Move down", icon: <ArrowDownIcon className="size-4" />, onSelect: down }] : []),
      ] satisfies BlockMenuItem[]
    },
  }
}

/**
 * Move up or Move down for the top-level block at `pos`: it swaps places with
 * the line or block beside it, as the shell's blocks do (`moveBlock` in
 * `shared/notes/block-card.tsx`). Null when there is nothing on that side, or
 * when the block sits inside another, such as a Callout.
 */
function moveBlock(editor: NodeViewProps["editor"], pos: number, direction: -1 | 1) {
  const { doc } = editor.state
  const $pos = doc.resolve(pos)
  if ($pos.depth !== 0) return null
  const index = $pos.index(0)
  const node = doc.child(index)
  const neighbourIndex = index + direction
  if (neighbourIndex < 0 || neighbourIndex >= doc.childCount) return null
  const neighbour = doc.child(neighbourIndex)
  return () => {
    // One step, so the editor never sees the page without the block.
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize)
    const at = direction === -1 ? pos - neighbour.nodeSize : pos + neighbour.nodeSize
    editor.view.dispatch(tr.insert(at, node).scrollIntoView())
  }
}
