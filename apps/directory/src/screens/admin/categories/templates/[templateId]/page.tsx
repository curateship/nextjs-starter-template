"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useRouter } from "@/lib/navigation-client"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminLoading } from "@/components/admin/layout/loading"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { TemplateSettingsModal } from "@/components/admin/layout/templates/TemplateSettingsModal"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { CATEGORY_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/category-builder/config/category-block-types"
import {
  categoryBlocksToJson,
  parseCategoryBlocksFromJson,
  type CategoryEditorBlock,
} from "@/components/admin/category-builder/config/category-block-utils"
import { CategoryPreview } from "@/components/admin/category-builder/layout/CategoryPreview"
import { CategoryBlockEditorModal } from "@/components/admin/category-builder/layout/CategoryBlockEditorModal"
import {
  getCategoryTemplateById,
  updateCategoryTemplate,
  type CategoryTemplate,
} from "@/lib/actions/categories/category-template-actions"
import {
  CATEGORY_TEMPLATE_PREVIEW_CATEGORY,
  withCategoryTemplatePreviewValues,
} from "@/lib/actions/categories/category-template-inheritance"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

interface PageProps {
  params: Promise<{ templateId: string }>
}

interface BlockSelection {
  type: string
  quantity: number
}

export default function CategoryTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()

  const [template, setTemplate] = useState<CategoryTemplate | null>(null)
  const [blocks, setBlocks] = useState<CategoryEditorBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<CategoryEditorBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  const loadTemplate = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await getCategoryTemplateById({ data: { templateId: templateId } })
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }

    setTemplate(data)
    setBlocks(parseCategoryBlocksFromJson(data.content_blocks || {}))
    setSelectedBlock(null)
    setLoading(false)
  }, [templateId])

  useEffect(() => {
    loadTemplate()
  }, [loadTemplate])

  // Keep the site switcher aligned with the template's site
  useEffect(() => {
    if (!template || currentSite?.id === template.site_id) return

    const templateSite = sites.find((site) => site.id === template.site_id)
    if (templateSite) {
      setCurrentSite(templateSite)
    }
  }, [currentSite?.id, setCurrentSite, sites, template])

  // Draft block content edits stay local until saved
  useEffect(() => {
    if (!selectedBlock) {
      setDraftContent({})
      dismissErrorToast()
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    dismissErrorToast()
  }, [selectedBlock])

  function handleDeleteBlock(block: CategoryEditorBlock) {
    setBlocks((prev) => prev.filter((item) => item.id !== block.id))

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  function handleReorderBlocks(reorderedBlocks: CategoryEditorBlock[]) {
    setBlocks(reorderedBlocks)
  }

  function handleDraftChange(field: string, value: any) {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleCloseBlockEditor() {
    if (isSavingBlock) return
    setSelectedBlock(null)
    dismissErrorToast()
  }

  async function handleSaveBlockEditor() {
    if (!template || !selectedBlock) return

    setIsSavingBlock(true)
    dismissErrorToast()

    try {
      const nextBlocks = blocks.map((block) =>
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      )
      const contentBlocks = categoryBlocksToJson(nextBlocks, template.content_blocks || {})
      const { data, error: saveError } = await updateCategoryTemplate({ data: { templateId: template.id, updates: {
        content_blocks: contentBlocks,
      } } })

      if (saveError || !data) {
        showErrorToast(saveError || "Failed to save block")
        return
      }

      const savedBlocks = parseCategoryBlocksFromJson(data.content_blocks || {})
      setBlocks(savedBlocks)
      setTemplate(data)
      markBlocksSaved(savedBlocks)
      setSelectedBlock(null)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  function handleAddBlocks(selections: BlockSelection[]) {
    const newBlocks: CategoryEditorBlock[] = []

    for (const selection of selections) {
      const blockDefinition = getBlockTypeDefinition(selection.type)
      if (!blockDefinition) continue

      for (let index = 0; index < selection.quantity; index += 1) {
        const timestamp = Date.now() + index
        newBlocks.push({
          id: `${selection.type}-${timestamp}`,
          type: selection.type,
          title: blockDefinition.name,
          content: { ...blockDefinition.defaultContent },
        })
      }
    }

    if (!newBlocks.length) return

    setBlocks((prev) => [...prev, ...newBlocks])
  }

  // Auto-save: a change to the blocks is written once the edits stop.
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const templateRef = useRef(template)
  templateRef.current = template
  const lastSavedBlocksJsonRef = useRef<string | null>(null)

  const { saveStatus, setSaveStatus, scheduleSave } = useAutoSave<typeof blocks>({
    save: async (nextBlocks) => {
      const currentTemplate = templateRef.current
      if (!currentTemplate) return { saved: true }

      const contentBlocks = categoryBlocksToJson(nextBlocks, currentTemplate.content_blocks || {})
      const { data, error: saveError } = await updateCategoryTemplate({ data: { templateId: currentTemplate.id, updates: {
        content_blocks: contentBlocks,
      } } })

      if (saveError) return { saved: false, reason: saveError }
      // What is on screen is deliberately not replaced with the round trip:
      // re-reading it would look like another edit and save again, forever.
      if (data) setTemplate(data)
      return { saved: true }
    }
  })

  // A write that happened somewhere else (the block editor, the settings
  // dialog) has already stored these blocks — recording them here stops the
  // watcher below writing the same thing again a moment later.
  function markBlocksSaved(savedBlocks: typeof blocks) {
    lastSavedBlocksJsonRef.current = JSON.stringify(savedBlocks)
    setSaveStatus("saved")
  }

  const blocksJson = JSON.stringify(blocks)

  useEffect(() => {
    if (loading) {
      lastSavedBlocksJsonRef.current = null
      return
    }
    if (lastSavedBlocksJsonRef.current === null) {
      lastSavedBlocksJsonRef.current = blocksJson
      return
    }
    if (lastSavedBlocksJsonRef.current === blocksJson) return

    lastSavedBlocksJsonRef.current = blocksJson
    scheduleSave(blocksRef.current)
  }, [blocksJson, loading, scheduleSave])

  function handleSettingsSaved(updatedTemplate: CategoryTemplate) {
    const savedBlocks = parseCategoryBlocksFromJson(updatedTemplate.content_blocks || {})
    setTemplate(updatedTemplate)
    setBlocks(savedBlocks)
    markBlocksSaved(savedBlocks)
  }

  const templateSite = template
    ? sites.find((site) => site.id === template.site_id)
    : null
  const previewSiteSource = templateSite || (currentSite?.id === template?.site_id ? currentSite : null)
  const previewSite = previewSiteSource
    ? {
        id: previewSiteSource.id,
        name: previewSiteSource.name,
        subdomain: previewSiteSource.subdomain,
        settings: previewSiteSource.settings,
      }
    : undefined
  // Per-category values are empty in templates — substitute sample content
  const previewBlocks = withCategoryTemplatePreviewValues(blocks)

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <AdminLoading className="min-h-0 flex-1" />
      </div>
    )
  }

  if (error && !template) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => router.push("/admin/categories/templates")} variant="outline">
              Back to Templates
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            saveStatus={saveStatus}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            renderSettingsModal={(show, setShow) => (
              <TemplateSettingsModal
                contentBlocks={template ? categoryBlocksToJson(blocks, template.content_blocks || {}) : undefined}
                createPlaceholder="e.g. Standard Category Layout"
                onOpenChange={setShow}
                onSaved={handleSettingsSaved}
                open={show}
                template={template}
                updateTemplate={((a0, a1) => updateCategoryTemplate({ data: { templateId: a0, updates: a1 } }))}
              />
            )}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <CategoryPreview
              blocks={previewBlocks}
              category={{
                id: "preview",
                title: CATEGORY_TEMPLATE_PREVIEW_CATEGORY.title,
                slug: "preview",
                site_id: template?.site_id || currentSite?.id || "preview-site",
                featured_image: CATEGORY_TEMPLATE_PREVIEW_CATEGORY.featuredImage,
              }}
              site={previewSite}
              blocksLoading={loading}
              allBlocks={blocks}
              onSelectBlock={setSelectedBlock}
            />
          </ScrollArea>
        </div>

        <CategoryBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={template?.site_id || currentSite?.id || ''}
          onContentChange={handleDraftChange}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
          mode="template"
        />

        {blockListOpen && (
          <BlockListPanel
            blocks={blocks}
            blockTypes={CATEGORY_BLOCK_TYPES}
            entityName="category template"
            selectedBlock={selectedBlock}
            onSelectBlock={setSelectedBlock}
            onDeleteBlock={handleDeleteBlock}
            onReorderBlocks={handleReorderBlocks}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            blocksLoading={loading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={handleAddBlocks}
          existingBlockTypes={blocks.map((block) => block.type)}
          blockTypes={CATEGORY_BLOCK_TYPES}
          entityName="category template"
        />
      </div>

    </div>
  )
}
