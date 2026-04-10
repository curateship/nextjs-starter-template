"use client"

import { useEffect, useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { NewsletterCanvas } from "./NewsletterCanvas"
import { NewsletterRichTextBlock } from "../blocks/rich-text/NewsletterRichTextBlock"
import { NewsletterHeaderBlock } from "../blocks/header/NewsletterHeaderBlock"
import { NewsletterDividerBlock } from "../blocks/divider/NewsletterDividerBlock"
import { NewsletterFooterBlock } from "../blocks/footer/NewsletterFooterBlock"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"

interface BlockPropertiesPanelProps {
  selectedBlock: NewsletterBlock | null
  blocks: NewsletterBlock[]
  previewWidth: number
  emailWidth?: number
  updateBlockContent: (blockId: string, field: string, value: any) => void
  onSelectBlock: (block: NewsletterBlock | null) => void
  siteId: string
  subject?: string
  onSubjectChange?: (value: string) => void
  onSubjectClick?: () => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  blocks,
  previewWidth,
  emailWidth = 600,
  updateBlockContent,
  onSelectBlock,
  siteId,
  subject,
  onSubjectChange,
  onSubjectClick,
}: BlockPropertiesPanelProps) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)

  const handleContentChange = (field: string, value: any) => {
    if (!selectedBlock) return
    updateBlockContent(selectedBlock.id, field, value)
  }

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
      <ScrollArea className="h-full">
      {selectedBlock ? (
        <div className="pb-10">
        <AdminLayout>
          {selectedBlock.type === 'newsletter-rich-text' && (
            <NewsletterRichTextBlock
              content={selectedBlock.content}
              onContentChange={handleContentChange}
              onBack={() => onSelectBlock(null)}
              siteId={siteId}
              subject={subject}
              onSubjectChange={onSubjectChange}
            />
          )}

          {selectedBlock.type === 'newsletter-header' && (
            <NewsletterHeaderBlock
              content={selectedBlock.content}
              onContentChange={handleContentChange}
              onBack={() => onSelectBlock(null)}
              siteId={siteId}
            />
          )}

          {selectedBlock.type === 'newsletter-divider' && (
            <NewsletterDividerBlock
              content={selectedBlock.content}
              onContentChange={handleContentChange}
              onBack={() => onSelectBlock(null)}
            />
          )}

          {selectedBlock.type === 'newsletter-footer' && (
            <NewsletterFooterBlock
              content={selectedBlock.content}
              onContentChange={handleContentChange}
              onBack={() => onSelectBlock(null)}
            />
          )}
        </AdminLayout>
        </div>
      ) : (
        <div className="min-h-full">
          <NewsletterCanvas
            blocks={blocks}
            previewWidth={previewWidth}
            emailWidth={emailWidth}
            siteId={siteId}
            onSelectBlock={onSelectBlock}
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
      )}
      </ScrollArea>
    </div>
  )
}
