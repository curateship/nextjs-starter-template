"use client"

import { useEffect, useState } from "react"

interface PreviewEditableBlock {
  id: string
  type: string
}

export function useInlinePreviewEditing({
  blocks,
  selectedBlock,
  editableType,
  editorShellSelector,
}: {
  blocks: PreviewEditableBlock[]
  selectedBlock?: PreviewEditableBlock | null
  editableType: string
  editorShellSelector: string
}) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)

  useEffect(() => {
    if (selectedBlock) {
      setEditingBlockId(null)
    }
  }, [selectedBlock])

  useEffect(() => {
    if (!editingBlockId) return

    const editingBlock = blocks.find((block) => block.id === editingBlockId)
    if (!editingBlock || editingBlock.type !== editableType) {
      setEditingBlockId(null)
    }
  }, [blocks, editableType, editingBlockId])

  useEffect(() => {
    if (!editingBlockId) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      const targetElement =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null

      if (!targetElement) return

      if (
        targetElement.closest(editorShellSelector) ||
        targetElement.closest('[data-newsletter-inline-editor-menu="true"]') ||
        targetElement.closest('[data-media-picker-dialog="true"]') ||
        targetElement.closest('[data-newsletter-inline-link-dialog="true"]')
      ) {
        return
      }

      setEditingBlockId(null)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [editingBlockId, editorShellSelector])

  return { editingBlockId, setEditingBlockId }
}
