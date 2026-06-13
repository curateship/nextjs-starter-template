"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { TemplateSettingsModal } from "@/components/admin/layout/templates/TemplateSettingsModal"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { EVENT_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/event-builder/config/event-block-types"
import {
  eventBlocksToJson,
  parseEventBlocksFromJson,
  type EventEditorBlock,
} from "@/components/admin/event-builder/config/event-block-utils"
import { EventPreview } from "@/components/admin/event-builder/layout/EventPreview"
import { EventBlockEditorModal } from "@/components/admin/event-builder/layout/EventBlockEditorModal"
import {
  getEventTemplateById,
  updateEventTemplate,
  type EventTemplate,
} from "@/lib/actions/events/event-template-actions"
import {
  EVENT_TEMPLATE_PREVIEW_EVENT,
  withEventTemplatePreviewValues,
} from "@/lib/actions/events/event-template-inheritance"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

interface PageProps {
  params: Promise<{ templateId: string }>
}

interface BlockSelection {
  type: string
  quantity: number
}

export default function EventTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()

  const [template, setTemplate] = useState<EventTemplate | null>(null)
  const [blocks, setBlocks] = useState<EventEditorBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<EventEditorBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

  const loadTemplate = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await getEventTemplateById(templateId)
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }

    setTemplate(data)
    setBlocks(parseEventBlocksFromJson(data.content_blocks || {}))
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

  function handleDeleteBlock(block: EventEditorBlock) {
    setBlocks((prev) => prev.filter((item) => item.id !== block.id))

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  function handleReorderBlocks(reorderedBlocks: EventEditorBlock[]) {
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
      const contentBlocks = eventBlocksToJson(nextBlocks, template.content_blocks || {})
      const { data, error: saveError } = await updateEventTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError || !data) {
        setBlockSaveError(saveError || "Failed to save block")
        return
      }

      setBlocks(parseEventBlocksFromJson(data.content_blocks || {}))
      setTemplate(data)
      setSaveMessage("Saved!")
      setTimeout(() => setSaveMessage(""), 3000)
      setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  function handleAddBlocks(selections: BlockSelection[]) {
    const newBlocks: EventEditorBlock[] = []

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
    setSaveMessage("Saving...")

    try {
      const contentBlocks = eventBlocksToJson(blocks, template.content_blocks || {})
      const { data, error: saveError } = await updateEventTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else if (data) {
        setTemplate(data)
        setBlocks(parseEventBlocksFromJson(data.content_blocks || {}))
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  function handleSettingsSaved(updatedTemplate: EventTemplate) {
    setTemplate(updatedTemplate)
    setBlocks(parseEventBlocksFromJson(updatedTemplate.content_blocks || {}))
    setSaveMessage("Saved!")
    setTimeout(() => setSaveMessage(""), 3000)
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
  // Per-event values are empty in templates — substitute sample content
  const previewBlocks = withEventTemplatePreviewValues(blocks)

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto h-96 max-w-4xl rounded-lg bg-white shadow-sm animate-pulse" />
            </div>
          </div>
          <div className="w-[250px] p-2.5">
            <div className="space-y-1">
              {[1, 2, 3].map((item) => (
                <div key={item} className="p-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
            <Button onClick={() => router.push("/admin/events/templates")} variant="outline">
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
            saveMessage={saveMessage}
            isSaving={isSaving}
            onSave={handleSave}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            renderSettingsModal={(show, setShow) => (
              <TemplateSettingsModal
                contentBlocks={template ? eventBlocksToJson(blocks, template.content_blocks || {}) : undefined}
                createPlaceholder="e.g. Standard Event Layout"
                onError={setError}
                onOpenChange={setShow}
                onSaved={handleSettingsSaved}
                open={show}
                template={template}
                updateTemplate={updateEventTemplate}
              />
            )}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <EventPreview
              blocks={previewBlocks}
              event={{
                id: "preview",
                title: EVENT_TEMPLATE_PREVIEW_EVENT.title,
                slug: "preview",
                site_id: template?.site_id || currentSite?.id || "preview-site",
                featured_image: EVENT_TEMPLATE_PREVIEW_EVENT.featuredImage,
              }}
              site={previewSite}
              blocksLoading={loading}
              allBlocks={blocks}
              onSelectBlock={setSelectedBlock}
            />
          </ScrollArea>
        </div>

        <EventBlockEditorModal
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
            blockTypes={EVENT_BLOCK_TYPES}
            entityName="event template"
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
          blockTypes={EVENT_BLOCK_TYPES}
          entityName="event template"
        />
      </div>

    </div>
  )
}
