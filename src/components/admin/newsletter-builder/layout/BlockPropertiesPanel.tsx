"use client"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { NewsletterCanvas } from "./NewsletterCanvas"
import { NewsletterRichTextBlock } from "../blocks/rich-text/NewsletterRichTextBlock"
import { NewsletterHeaderBlock } from "../blocks/header/NewsletterHeaderBlock"
import { NewsletterDividerBlock } from "../blocks/divider/NewsletterDividerBlock"
import { NewsletterFooterBlock } from "../blocks/footer/NewsletterFooterBlock"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"

interface BlockPropertiesPanelProps {
  selectedBlock: NewsletterBlock | null
  blocks: NewsletterBlock[]
  previewWidth: number
  updateBlockContent: (blockId: string, field: string, value: any) => void
  onSelectBlock: (block: NewsletterBlock | null) => void
  siteId: string
  subject?: string
  onOpenSettings?: () => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  blocks,
  previewWidth,
  updateBlockContent,
  onSelectBlock,
  siteId,
  subject,
  onOpenSettings,
}: BlockPropertiesPanelProps) {
  const handleContentChange = (field: string, value: any) => {
    if (!selectedBlock) return
    updateBlockContent(selectedBlock.id, field, value)
  }

  return (
    <div className={`flex-1 border-r bg-background ${selectedBlock ? 'overflow-y-auto pb-10' : 'overflow-hidden'}`}>
      {selectedBlock ? (
        <AdminLayout>
          {selectedBlock.type === 'newsletter-rich-text' && (
            <NewsletterRichTextBlock
              content={selectedBlock.content}
              onContentChange={handleContentChange}
              onBack={() => onSelectBlock(null)}
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
      ) : (
        <div className="h-full">
          <NewsletterCanvas
            blocks={blocks}
            previewWidth={previewWidth}
            onSelectBlock={onSelectBlock}
            selectedBlock={selectedBlock}
            subject={subject}
            onOpenSettings={onOpenSettings}
          />
        </div>
      )}
    </div>
  )
}
