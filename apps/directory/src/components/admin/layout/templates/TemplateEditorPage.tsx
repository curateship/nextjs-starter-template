"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useRouter } from "@/lib/navigation-client"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminLoading } from "@/components/admin/layout/loading"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { TemplateSettingsModal } from "@/components/admin/layout/templates/TemplateSettingsModal"
import {
  BlockSelectionModal,
  type BlockSelection,
} from "@/components/admin/layout/builder/BlockSelectionModal"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

/**
 * The block-editing screen behind a category, event or directory template.
 *
 * These three screens were the same file three times over — the same state, the
 * same auto-save, the same chrome, with the entity name swapped. Everything
 * identical lives here; the parts that genuinely differ (the preview, the block
 * editor, the block list) come in as render props, so each screen still draws
 * its own markup and nothing on screen moved.
 *
 * Posts and products deliberately still have their own copies: their blocks
 * carry a display order and timestamps, and they normalize content on save.
 */

/** Every template action returns this same row shape. */
export interface TemplateEditorRecord {
  id: string
  site_id: string
  name: string
  content_blocks: Record<string, any>
  is_default: boolean
  created_at: string
  updated_at: string
}

interface PreviewSite {
  id: string
  name: string
  subdomain: string
  settings?: any
}

/** The least a block must have for this screen to drive it. */
export interface TemplateEditorBlock {
  id: string
  type: string
  content?: Record<string, any>
}

/** Everything a render prop is handed. */
export interface TemplateEditorSlotArgs<TBlock, TExtra> {
  blocks: TBlock[]
  previewBlocks: TBlock[]
  selectedBlock: TBlock | null
  onSelectBlock: (block: TBlock | null) => void
  template: TemplateEditorRecord | null
  site: PreviewSite | undefined
  siteId: string
  extra: TExtra
  loading: boolean
  draftContent: Record<string, any>
  onDraftChange: (field: string, value: any) => void
  onCloseBlockEditor: () => void
  onSaveBlockEditor: () => void
  savingBlock: boolean
  onDeleteBlock: (block: TBlock) => void
  onReorderBlocks: (blocks: TBlock[]) => void
  onAddBlock: () => void
}

type ActionResult<T> = { data: T | null; error: string | null }

export interface TemplateEditorPageProps<TBlock extends TemplateEditorBlock, TExtra = undefined> {
  templateId: string

  getTemplateById: (templateId: string) => Promise<ActionResult<TemplateEditorRecord>>
  updateTemplate: (
    templateId: string,
    updates: { name?: string; content_blocks?: Record<string, any> }
  ) => Promise<ActionResult<TemplateEditorRecord>>

  parseBlocks: (contentBlocks: Record<string, any>, extra: TExtra) => TBlock[]
  blocksToJson: (blocks: TBlock[], existing: Record<string, any>) => Record<string, any>

  /** Extra data fetched alongside the template — directory's custom blocks. */
  loadExtra?: (template: TemplateEditorRecord) => Promise<TExtra>
  /** Turn one pick from the "add block" dialog into blocks. */
  buildBlocks: (selection: BlockSelection, extra: TExtra) => TBlock[]
  /** Swap the template's blank fields for sample content in the preview. */
  withPreviewValues: (blocks: TBlock[], extra: TExtra) => TBlock[]
  /** What the "add block" dialog offers. */
  getSelectionProps: (extra: TExtra) => Record<string, any>

  routeBase: string
  createPlaceholder: string
  entityName: string
  enableDefaultCategoryParent?: boolean

  renderPreview: (args: TemplateEditorSlotArgs<TBlock, TExtra>) => ReactNode
  renderBlockEditor: (args: TemplateEditorSlotArgs<TBlock, TExtra>) => ReactNode
  renderBlockListPanel: (args: TemplateEditorSlotArgs<TBlock, TExtra>) => ReactNode
}

export function TemplateEditorPage<TBlock extends TemplateEditorBlock, TExtra = undefined>({
  templateId,
  getTemplateById,
  updateTemplate,
  parseBlocks,
  blocksToJson,
  loadExtra,
  buildBlocks,
  withPreviewValues,
  getSelectionProps,
  routeBase,
  createPlaceholder,
  entityName,
  enableDefaultCategoryParent,
  renderPreview,
  renderBlockEditor,
  renderBlockListPanel,
}: TemplateEditorPageProps<TBlock, TExtra>) {
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()

  const [template, setTemplate] = useState<TemplateEditorRecord | null>(null)
  const [extra, setExtra] = useState<TExtra>(undefined as TExtra)
  const [blocks, setBlocks] = useState<TBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<TBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  // The callers build these inline, so they change identity every render.
  // Holding them in refs keeps the load effect from re-firing forever.
  const configRef = useRef({ getTemplateById, loadExtra, parseBlocks, blocksToJson, updateTemplate })
  configRef.current = { getTemplateById, loadExtra, parseBlocks, blocksToJson, updateTemplate }

  const loadTemplate = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await configRef.current.getTemplateById(templateId)
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }

    const loadedExtra = configRef.current.loadExtra
      ? await configRef.current.loadExtra(data)
      : (undefined as TExtra)

    setTemplate(data)
    setExtra(loadedExtra)
    setBlocks(configRef.current.parseBlocks(data.content_blocks || {}, loadedExtra))
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

  function handleDeleteBlock(block: TBlock) {
    setBlocks((prev) => prev.filter((item) => item.id !== block.id))

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  function handleReorderBlocks(reorderedBlocks: TBlock[]) {
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
      const contentBlocks = blocksToJson(nextBlocks, template.content_blocks || {})
      const { data, error: saveError } = await updateTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError || !data) {
        showErrorToast(saveError || "Failed to save block")
        return
      }

      const savedBlocks = parseBlocks(data.content_blocks || {}, extra)
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
    const newBlocks: TBlock[] = []

    for (const selection of selections) {
      newBlocks.push(...buildBlocks(selection, extra))
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

      const contentBlocks = configRef.current.blocksToJson(nextBlocks, currentTemplate.content_blocks || {})
      const { data, error: saveError } = await configRef.current.updateTemplate(currentTemplate.id, {
        content_blocks: contentBlocks,
      })

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

  function handleSettingsSaved(updatedTemplate: TemplateEditorRecord) {
    const savedBlocks = parseBlocks(updatedTemplate.content_blocks || {}, extra)
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
  // Per-entity values are empty in templates — substitute sample content
  const previewBlocks = withPreviewValues(blocks, extra)

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
            <Button onClick={() => router.push(routeBase)} variant="outline">
              Back to Templates
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const slotArgs: TemplateEditorSlotArgs<TBlock, TExtra> = {
    blocks,
    previewBlocks,
    selectedBlock,
    onSelectBlock: setSelectedBlock,
    template,
    site: previewSite,
    siteId: template?.site_id || currentSite?.id || '',
    extra,
    loading,
    draftContent,
    onDraftChange: handleDraftChange,
    onCloseBlockEditor: handleCloseBlockEditor,
    onSaveBlockEditor: handleSaveBlockEditor,
    savingBlock: isSavingBlock,
    onDeleteBlock: handleDeleteBlock,
    onReorderBlocks: handleReorderBlocks,
    onAddBlock: () => setBlockModalOpen(true),
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
                contentBlocks={template ? blocksToJson(blocks, template.content_blocks || {}) : undefined}
                createPlaceholder={createPlaceholder}
                enableDefaultCategoryParent={enableDefaultCategoryParent}
                onOpenChange={setShow}
                onSaved={handleSettingsSaved}
                open={show}
                template={template}
                updateTemplate={updateTemplate}
              />
            )}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            {renderPreview(slotArgs)}
          </ScrollArea>
        </div>

        {renderBlockEditor(slotArgs)}

        {blockListOpen && renderBlockListPanel(slotArgs)}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={handleAddBlocks}
          existingBlockTypes={blocks.map((block) => block.type)}
          entityName={entityName}
          {...getSelectionProps(extra)}
        />
      </div>

    </div>
  )
}
