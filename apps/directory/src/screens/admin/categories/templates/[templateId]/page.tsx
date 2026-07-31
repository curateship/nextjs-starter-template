"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "@/lib/navigation-client"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { BuilderSkeleton } from "@/components/admin/layout/skeletons"
import { useSaveStatus } from "@/components/admin/layout/builder/save-status"
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
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

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
      setBlockSaveError(null)
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setBlockSaveError(null)
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
    setBlockSaveError(null)
  }

  async function handleSaveBlockEditor() {
    if (!template || !selectedBlock) return

    setIsSavingBlock(true)
    setBlockSaveError(null)

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
        setBlockSaveError(saveError || "Failed to save block")
        return
      }

      setBlocks(parseCategoryBlocksFromJson(data.content_blocks || {}))
      setTemplate(data)
      setSaveStatus("saved")
      setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
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

  async function handleSave() {
    if (!template) return

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const contentBlocks = categoryBlocksToJson(blocks, template.content_blocks || {})
      const { data, error: saveError } = await updateCategoryTemplate({ data: { templateId: template.id, updates: {
        content_blocks: contentBlocks,
      } } })

      if (saveError) {
        setSaveStatus("error", saveError)
      } else if (data) {
        setTemplate(data)
        setBlocks(parseCategoryBlocksFromJson(data.content_blocks || {}))
        setSaveStatus("saved")
      }
    } catch (err) {
      setSaveStatus("error", err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  function handleSettingsSaved(updatedTemplate: CategoryTemplate) {
    setTemplate(updatedTemplate)
    setBlocks(parseCategoryBlocksFromJson(updatedTemplate.content_blocks || {}))
    setSaveStatus("saved")
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
        <BuilderSkeleton />
      </div>
    )
  }

  if (error && !template) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
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
            isSaving={isSaving}
            onSave={handleSave}
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
          error={blockSaveError}
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
