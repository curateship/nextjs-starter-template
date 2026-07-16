"use client"

import Settings from "lucide-react/dist/esm/icons/settings.js"
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { useInlinePreviewEditing } from "@/components/admin/layout/builder/useInlinePreviewEditing"
import { Button } from "@/components/ui/button"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import { normalizePageRichTextContent } from "@/components/admin/page-builder/config/page-block-utils"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { getHeroNavigationBackgroundColor } from "@/lib/utils/page-hero-background"
import { cn } from "@/lib/utils/tailwind"

interface PagePreviewProps {
  blocks: PreviewBlock[]
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      favicon?: string
      [key: string]: any
    }
  }
  className?: string
  blocksLoading?: boolean
  allBlocks?: PageBlock[]
  selectedBlock?: PageBlock | null
  onSelectBlock?: (block: PageBlock) => void
  onSelectSiteChrome?: (type: "navigation" | "footer") => void
  onUpdateRichTextBody?: (blockId: string, htmlContent: string) => void
  renderAccountBlocks?: boolean
}

export function PagePreview({
  blocks,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  selectedBlock,
  onSelectBlock,
  onSelectSiteChrome,
  onUpdateRichTextBody,
  renderAccountBlocks = false,
}: PagePreviewProps) {
  const { editingBlockId, setEditingBlockId } = useInlinePreviewEditing({
    blocks,
    selectedBlock,
    editableType: "rich-text",
    editorShellSelector: '[data-page-inline-editor-shell="true"]',
  })
  const previewSite = createPreviewSite(blocks, site)
  const siteChrome = resolveSiteChrome(site?.settings)
  const hasRenderablePreview = blocks.length > 0 || !!siteChrome.navigation || !!siteChrome.footer
  const navigationBackgroundColor = siteChrome.navigation
    ? getHeroNavigationBackgroundColor(blocks)
    : undefined
  const canInlineEdit = Boolean(onUpdateRichTextBody && onSelectBlock)

  const getEditableBlock = (block: { id: string; type: string; content: Record<string, any> }): PageBlock => {
    const editableBlock = allBlocks?.find(item => item.id === block.id) ||
    blocks.find(item => item.id === block.id) || {
      id: block.id,
      type: block.type,
      content: block.content,
      display_order: 0,
    }

    return {
      ...editableBlock,
      display_order: typeof editableBlock.display_order === "number" ? editableBlock.display_order : 0,
    }
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your page preview"
      isEmpty={!hasRenderablePreview}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      onSelectSiteChrome={onSelectSiteChrome}
      navigationBackgroundColor={navigationBackgroundColor}
      site={site}
      showSiteChrome
    >
      <BlockRenderer
        site={previewSite}
        isPreview
        hideSiteChrome
        accountContext={renderAccountBlocks}
        renderRichTextBody={canInlineEdit ? (block) => {
          const content = normalizePageRichTextContent(block.content)
          const editorContent = {
            ...content,
            htmlContent: content.body,
          }

          return (
            <div
              data-page-inline-editor-shell="true"
              className="cursor-text"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setEditingBlockId(block.id)
              }}
            >
              <InlineRichTextEditor
                blockId={block.id}
                content={editorContent}
                onContentChange={(htmlContent) => onUpdateRichTextBody?.(block.id, htmlContent)}
                siteId={site?.id || ""}
                isActive={editingBlockId === block.id}
                editorPadding={0}
                variant="page"
              />
            </div>
          )
        } : undefined}
        renderBlockOverlay={onSelectBlock ? (block) => {
          if (block.type !== "rich-text") return null

          return (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={cn(
                "absolute right-3 top-3 z-20 h-8 w-8 rounded-full border bg-background/90 shadow-sm transition-opacity opacity-0 group-hover/page-preview-block:opacity-100",
                editingBlockId === block.id && "opacity-100",
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setEditingBlockId(null)
                onSelectBlock(getEditableBlock(block))
              }}
              title="Open block settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )
        } : undefined}
      />
    </BuilderPreviewShell>
  )
}
