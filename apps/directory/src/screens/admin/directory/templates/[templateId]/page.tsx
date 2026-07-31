"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "@/lib/navigation-client"
import { Button } from "@/components/ui/button"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { BuilderSkeleton } from "@/components/admin/layout/skeletons"
import { useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { TemplateSettingsModal } from "@/components/admin/layout/templates/TemplateSettingsModal"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { DIRECTORY_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/directory-builder/config/directory-block-types"
import {
  directoryBlocksToJson,
  parseDirectoryBlocksFromJson,
  type DirectoryEditorBlock,
} from "@/components/admin/directory-builder/config/directory-block-utils"
import {
  getDirectoryTemplateById,
  updateDirectoryTemplate,
  type DirectoryTemplate,
} from "@/lib/actions/directories/directory-template-actions"
import {
  DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY,
  getDirectoryTemplatePreviewBreadcrumbs,
  withDirectoryTemplatePreviewValues,
} from "@/lib/actions/directories/directory-template-inheritance"
import { getDirectoryCustomBlocksBySite } from "@/lib/actions/directories/directory-custom-block-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import Blocks from "lucide-react/dist/esm/icons/blocks.js"
import {
  getDirectoryCustomBlockSelectionType,
  parseDirectoryCustomBlockSelectionType,
} from "@/lib/actions/directories/directory-custom-blocks/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DirectoryPreview } from "@/components/admin/directory-builder/layout/DirectoryPreview"
import { DirectoryBlockEditorModal } from "@/components/admin/directory-builder/layout/DirectoryBlockEditorModal"
import { DirectoryTemplateBlockListPanel } from "@/components/admin/directory-builder/layout/DirectoryTemplateBlockListPanel"

interface PageProps {
  params: Promise<{ templateId: string }>
}

interface BlockSelection {
  type: string
  quantity: number
}

export default function DirectoryTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()

  const [template, setTemplate] = useState<DirectoryTemplate | null>(null)
  const [customBlockTemplates, setCustomBlockTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [blocks, setBlocks] = useState<DirectoryEditorBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<DirectoryEditorBlock | null>(null)
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

    const { data, error: fetchError } = await getDirectoryTemplateById({ data: { templateId: templateId } })
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }

    const { data: customBlocksData } = await getDirectoryCustomBlocksBySite({ data: { siteId: data.site_id } })
    const loadedCustomBlocks = customBlocksData || []

    setTemplate(data)
    setCustomBlockTemplates(loadedCustomBlocks)
    setBlocks(parseDirectoryBlocksFromJson(data.content_blocks || {}, loadedCustomBlocks))
    setSelectedBlock(null)
    setLoading(false)
  }, [templateId])

  useEffect(() => {
    loadTemplate()
  }, [loadTemplate])

  useEffect(() => {
    if (!template || currentSite?.id === template.site_id) return

    const templateSite = sites.find((site) => site.id === template.site_id)
    if (templateSite) {
      setCurrentSite(templateSite)
    }
  }, [currentSite?.id, setCurrentSite, sites, template])

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

  function handleDeleteBlock(block: DirectoryEditorBlock) {
    setBlocks((prev) => prev.filter((item) => item.id !== block.id))

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  function handleReorderBlocks(reorderedBlocks: DirectoryEditorBlock[]) {
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
      const contentBlocks = directoryBlocksToJson(nextBlocks, template.content_blocks || {})
      const { data, error: saveError } = await updateDirectoryTemplate({ data: { templateId: template.id, updates: {
        content_blocks: contentBlocks,
      } } })

      if (saveError || !data) {
        setBlockSaveError(saveError || "Failed to save block")
        return
      }

      setBlocks(parseDirectoryBlocksFromJson(data.content_blocks || {}, customBlockTemplates))
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
    const newBlocks: DirectoryEditorBlock[] = []

    for (const selection of selections) {
      const customTemplateId = parseDirectoryCustomBlockSelectionType(selection.type)

      if (customTemplateId) {
        const customTemplate = customBlockTemplates.find((item) => item.id === customTemplateId)
        if (!customTemplate) continue

        for (let index = 0; index < selection.quantity; index += 1) {
          const timestamp = Date.now() + index
          newBlocks.push({
            id: `directory-custom-${timestamp}`,
            type: 'directory-custom',
            title: customTemplate.name,
            content: {
              templateId: customTemplate.id,
            },
          })
        }

        continue
      }

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
      const contentBlocks = directoryBlocksToJson(blocks, template.content_blocks || {})
      const { data, error: saveError } = await updateDirectoryTemplate({ data: { templateId: template.id, updates: {
        content_blocks: contentBlocks,
      } } })

      if (saveError) {
        setSaveStatus("error", saveError)
      } else if (data) {
        setTemplate(data)
        setBlocks(parseDirectoryBlocksFromJson(data.content_blocks || {}, customBlockTemplates))
        setSaveStatus("saved")
      }
    } catch (err) {
      setSaveStatus("error", err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  function handleSettingsSaved(updatedTemplate: DirectoryTemplate) {
    setTemplate(updatedTemplate)
    setBlocks(parseDirectoryBlocksFromJson(updatedTemplate.content_blocks || {}, customBlockTemplates))
    setSaveStatus("saved")
  }

  const customBlockDefinitions = customBlockTemplates.map((customTemplate) => ({
    type: getDirectoryCustomBlockSelectionType(customTemplate.id),
    name: customTemplate.name,
    icon: Blocks,
    description: `${customTemplate.layout} • ${customTemplate.fields.length} field${customTemplate.fields.length === 1 ? '' : 's'}`,
    defaultContent: {
      templateId: customTemplate.id,
    },
  }))

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
  const previewBlocks = withDirectoryTemplatePreviewValues(blocks, customBlockTemplates)
  const previewBreadcrumbs = getDirectoryTemplatePreviewBreadcrumbs(previewSite?.settings)

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
            <Button onClick={() => router.push("/admin/directory/templates")} variant="outline">
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
                contentBlocks={template ? directoryBlocksToJson(blocks, template.content_blocks || {}) : undefined}
                createPlaceholder="e.g. Featured Listing Layout"
                enableDefaultCategoryParent
                onOpenChange={setShow}
                onSaved={handleSettingsSaved}
                open={show}
                template={template}
                updateTemplate={((a0, a1) => updateDirectoryTemplate({ data: { templateId: a0, updates: a1 } }))}
              />
            )}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <DirectoryPreview
              blocks={previewBlocks}
              directory={{
                slug: 'preview-template',
                name: DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.title,
                title: DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.title,
                id: 'preview',
                site_id: template?.site_id || currentSite?.id || 'preview-site',
                featured_image: DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.featuredImage,
                status: 'draft',
              } as any}
              site={previewSite}
              customBlockTemplates={customBlockTemplates}
              blocksLoading={loading}
              allBlocks={blocks}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock as any}
              previewBreadcrumbs={previewBreadcrumbs}
            />
          </ScrollArea>
        </div>

        <DirectoryBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={template?.site_id || currentSite?.id || ''}
          directoryTitle={DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.title}
          onDirectoryTitleChange={() => {}}
          onContentChange={handleDraftChange}
          customBlockTemplates={customBlockTemplates}
          showDirectoryTitleField={false}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
          error={blockSaveError}
          mode="template"
        />

        {blockListOpen && (
          <DirectoryTemplateBlockListPanel
            blocks={blocks}
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
          sections={[
            { title: 'Built In', blockTypes: DIRECTORY_BLOCK_TYPES },
            { title: 'Custom', blockTypes: customBlockDefinitions },
          ]}
          entityName="directory template"
        />
      </div>

    </div>
  )
}
