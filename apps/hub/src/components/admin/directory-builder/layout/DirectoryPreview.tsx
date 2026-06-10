"use client"

import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { useInlinePreviewEditing } from "@/components/admin/layout/builder/useInlinePreviewEditing"
import { DirectoryBlockRenderer } from "@/components/frontend/directories/DirectoryBlockRenderer"
import { Button } from "@/components/ui/button"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import { getContentBreadcrumbPreviewAction } from "@/lib/actions/categories/category-relationship-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { cn } from "@/lib/utils/tailwind"

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface Directory {
  id: string
  title: string
  slug: string
  meta_description?: string
  site_id: string
  featured_image?: string | null
  source_type?: string | null
  source_id?: string | null
  status?: "draft" | "published"
  updated_at?: string
}

interface DirectoryPreviewProps {
  blocks: DirectoryBlock[]
  directory?: Directory
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      navigation?: any
      footer?: any
      font_family?: string
      secondary_font_family?: string
      breadcrumbs?: Record<string, boolean>
    }
  }
  className?: string
  blocksLoading?: boolean
  allBlocks?: DirectoryBlock[]
  selectedBlock?: DirectoryBlock | null
  customBlockTemplates?: DirectoryCustomBlockTemplate[]
  onSelectBlock?: (block: DirectoryBlock) => void
  onUpdateRichTextBody?: (blockId: string, htmlContent: string) => void
  previewBreadcrumbs?: FrontendBreadcrumbItem[]
}

export function DirectoryPreview({
  blocks,
  directory,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  selectedBlock,
  customBlockTemplates = [],
  onSelectBlock,
  onUpdateRichTextBody,
  previewBreadcrumbs,
}: DirectoryPreviewProps) {
  const [breadcrumbs, setBreadcrumbs] = useState<FrontendBreadcrumbItem[]>([])
  const { editingBlockId, setEditingBlockId } = useInlinePreviewEditing({
    blocks,
    selectedBlock,
    editableType: "directory-rich-text",
    editorShellSelector: '[data-directory-inline-editor-shell="true"]',
  })
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)
  const templateMap = Object.fromEntries(customBlockTemplates.map(template => [template.id, template]))
  const canInlineEdit = Boolean(onUpdateRichTextBody && onSelectBlock)

  const getEditableBlock = (block: { id: string; type: string; content: Record<string, any> }) =>
    allBlocks?.find(item => item.id === block.id) ||
    blocks.find(item => item.id === block.id) || {
      id: block.id,
      type: block.type,
      title: block.type,
      content: block.content,
    }

  useEffect(() => {
    let cancelled = false

    if (previewBreadcrumbs !== undefined) {
      return
    }

    if (!directory?.id || directory.id === "preview") {
      setBreadcrumbs([])
      return
    }

    const breadcrumbPromise = site?.settings?.breadcrumbs?.directories === false
      ? Promise.resolve({ data: [] as FrontendBreadcrumbItem[], error: null })
      : getContentBreadcrumbPreviewAction(directory.id, 'directory')

    breadcrumbPromise.then((breadcrumbResult) => {
      if (cancelled) return

      setBreadcrumbs(breadcrumbResult.data || [])
    })

    return () => {
      cancelled = true
    }
  }, [directory?.id, directory?.updated_at, previewBreadcrumbs, site?.settings?.breadcrumbs?.directories])

  const previewDirectory = {
    id: directory?.id || "preview",
    title: directory?.title || "Preview Directory",
    slug: directory?.slug || "preview",
    featured_image: directory?.featured_image || null,
    source_type: directory?.source_type || null,
    source_id: directory?.source_id || null,
    blocks: createPreviewEntityBlocks(previewBlocks),
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your directory preview"
      isEmpty={blocks.length === 0}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      site={site}
      showSiteChrome
    >
      <DirectoryBlockRenderer
        site={previewSite}
        directory={previewDirectory}
        customBlockTemplates={templateMap}
        breadcrumbs={previewBreadcrumbs ?? breadcrumbs}
        isPreview
        hideSiteChrome
        renderRichTextBody={canInlineEdit ? (block) => {
          const editorContent = {
            ...block.content,
            htmlContent: block.content.body || "",
          }

          return (
            <div
              data-directory-inline-editor-shell="true"
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
                siteId={site?.id || directory?.site_id || ""}
                isActive={editingBlockId === block.id}
                editorPadding={0}
                variant="directory"
              />
            </div>
          )
        } : undefined}
        renderBlockOverlay={onSelectBlock ? (block) => {
          if (block.type !== "directory-rich-text") return null

          return (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={cn(
                "absolute right-3 top-3 z-20 h-8 w-8 rounded-full border bg-background/90 shadow-sm transition-opacity opacity-0 group-hover/directory-preview-block:opacity-100",
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
