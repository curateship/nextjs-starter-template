"use client"

import { useEffect, useState } from "react"
import { NewsletterCanvas } from "./NewsletterCanvas"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"

interface NewsletterPreviewPaneProps {
  selectedBlock: NewsletterBlock | null
  blocks: NewsletterBlock[]
  emailWidth?: number
  siteId: string
  subject?: string
  onSubjectChange?: (value: string) => void
  onSubjectClick?: () => void
  updateBlockContent: (blockId: string, field: string, value: any) => void
  onSelectBlock: (block: NewsletterBlock | null) => void
}

export function NewsletterPreviewPane({
  selectedBlock,
  blocks,
  emailWidth = 600,
  siteId,
  subject,
  onSubjectChange,
  onSubjectClick,
  updateBlockContent,
  onSelectBlock,
}: NewsletterPreviewPaneProps) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)

  useEffect(() => {
    if (selectedBlock) {
      setEditingBlockId(null)
    }
  }, [selectedBlock])

  useEffect(() => {
    if (!editingBlockId) {
      return
    }

    const editingBlock = blocks.find((block) => block.id === editingBlockId)
    if (!editingBlock || editingBlock.type !== "newsletter-rich-text") {
      setEditingBlockId(null)
    }
  }, [blocks, editingBlockId])

  useEffect(() => {
    if (!editingBlockId) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      const targetElement =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null

      if (!targetElement) {
        return
      }

      if (
        targetElement.closest('[data-newsletter-inline-editor-shell="true"]') ||
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
  }, [editingBlockId])

  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <NewsletterCanvas
        blocks={blocks}
        emailWidth={emailWidth}
        siteId={siteId}
        onSelectBlock={(block) => onSelectBlock(block)}
        subject={subject}
        onSubjectChange={onSubjectChange}
        onSubjectClick={onSubjectClick}
        editingBlockId={editingBlockId}
        onStartInlineEdit={setEditingBlockId}
        onStopInlineEdit={() => setEditingBlockId(null)}
        onUpdateInlineRichText={(blockId, htmlContent) => updateBlockContent(blockId, "htmlContent", htmlContent)}
        onOpenBlockSettings={(block) => onSelectBlock(block)}
      />
    </div>
  )
}
