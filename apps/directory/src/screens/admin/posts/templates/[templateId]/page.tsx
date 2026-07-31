"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useRouter } from "@/lib/navigation-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminLoading } from "@/components/admin/layout/loading"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { POST_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/post-builder/config/post-block-types"
import {
  orderPostBuilderBlocks,
  parsePostBlocksFromJson,
  postBlocksToJson,
} from "@/components/admin/post-builder/config/post-block-utils"
import {
  getPostTemplateById,
  updatePostTemplate,
  type PostTemplate,
} from "@/lib/actions/posts/post-template-actions"
import {
  POST_TEMPLATE_PREVIEW_POST,
  withPostTemplatePreviewValues,
} from "@/lib/actions/posts/post-template-inheritance"
import { normalizePostBlockContent } from "@/lib/actions/posts/post-layout"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import Check from "lucide-react/dist/esm/icons/check.js"
import Pencil from "lucide-react/dist/esm/icons/pencil.js"
import X from "lucide-react/dist/esm/icons/x.js"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PostPreview } from "@/components/admin/post-builder/layout/PostPreview"
import { PostBlockEditorModal } from "@/components/admin/post-builder/layout/PostBlockEditorModal"
import { PostBlockListPanel } from "@/components/admin/post-builder/layout/PostBlockListPanel"
import type { PostBlock } from "@/lib/actions/posts/post-actions"

interface PageProps {
  params: Promise<{ templateId: string }>
}

interface BlockSelection {
  type: string
  quantity: number
}

export default function PostTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const [template, setTemplate] = useState<PostTemplate | null>(null)
  const [blocks, setBlocks] = useState<PostBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<PostBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [previewTitle, setPreviewTitle] = useState("Preview Post")
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftPostTitle, setDraftPostTitle] = useState("Preview Post")
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  const loadTemplate = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await getPostTemplateById({ data: { templateId: templateId } })
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }

    setTemplate(data)
    setNameInput(data.name)
    setBlocks(parsePostBlocksFromJson(data.content_blocks || {}))
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
      setDraftPostTitle(previewTitle)
      dismissErrorToast()
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftPostTitle(previewTitle)
    dismissErrorToast()
  }, [selectedBlock, previewTitle])

  function handleDeleteBlock(block: PostBlock) {
    setBlocks((prev) => prev.filter((item) => item.id !== block.id))

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  function handleReorderBlocks(reorderedBlocks: PostBlock[]) {
    setBlocks(orderPostBuilderBlocks(reorderedBlocks))
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
      setPreviewTitle(draftPostTitle.trim() || "Preview Post")
      const nextBlocks = blocks.map((block) =>
        block.id === selectedBlock.id
          ? {
              ...block,
              content: normalizePostBlockContent(block.type, draftContent),
              updated_at: new Date().toISOString(),
            }
          : block
      )
      const orderedBlocks = orderPostBuilderBlocks(nextBlocks)
      const contentBlocks = postBlocksToJson(orderedBlocks, template.content_blocks || {})
      const { data, error: saveError } = await updatePostTemplate({ data: { templateId: template.id, updates: {
        content_blocks: contentBlocks,
      } } })

      if (saveError || !data) {
        showErrorToast(saveError || "Failed to save block")
        return
      }

      setBlocks(orderedBlocks)
      setTemplate(data)
      markBlocksSaved(orderedBlocks)
      setSelectedBlock(null)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  function handleAddBlocks(selections: BlockSelection[]) {
    const newBlocks: PostBlock[] = []
    let displayOrderCounter = blocks.length

    for (const selection of selections) {
      if (
        selection.type === 'table-of-contents' &&
        (blocks.some((block) => block.type === 'table-of-contents') ||
          newBlocks.some((block) => block.type === 'table-of-contents'))
      ) {
        continue
      }

      const blockDefinition = getBlockTypeDefinition(selection.type)
      if (!blockDefinition) continue

      const quantity = selection.type === 'table-of-contents' ? 1 : selection.quantity
      for (let index = 0; index < quantity; index += 1) {
        const timestamp = Date.now() + index
        const type = selection.type as PostBlock['type']
        newBlocks.push({
          id: `${selection.type}-${timestamp}`,
          type,
          display_order: ++displayOrderCounter,
          content: normalizePostBlockContent(type, { ...blockDefinition.defaultContent }),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    }

    if (!newBlocks.length) return

    const nextBlocks = orderPostBuilderBlocks([...blocks, ...newBlocks])
    setBlocks(nextBlocks)
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

      const contentBlocks = postBlocksToJson(nextBlocks, currentTemplate.content_blocks || {})
      const { data, error: saveError } = await updatePostTemplate({ data: { templateId: currentTemplate.id, updates: {
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

  async function handleSaveName() {
    if (!template || !nameInput.trim()) return

    const { data, error: saveError } = await updatePostTemplate({ data: { templateId: template.id, updates: { name: nameInput.trim() } } })
    if (!saveError && data) {
      setTemplate(data)
    }

    setEditingName(false)
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
  const previewBlocks = withPostTemplatePreviewValues(blocks)

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
            <Button onClick={() => router.push("/admin/posts/templates")} variant="outline">
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
            rightActions={(
              <div className="flex items-center gap-2">
                {editingName ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={nameInput}
                      onChange={(event) => setNameInput(event.target.value)}
                      className="h-8 w-48 text-sm"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveName()
                        if (event.key === 'Escape') {
                          setEditingName(false)
                          setNameInput(template?.name || "")
                        }
                      }}
                      autoFocus
                    />
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleSaveName}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setEditingName(false)
                        setNameInput(template?.name || "")
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setEditingName(true)} title="Rename template">
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Rename
                  </Button>
                )}
              </div>
            )}
            saveStatus={saveStatus}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <PostPreview
              blocks={previewBlocks as any}
              post={{
                id: 'preview',
                title: previewTitle || POST_TEMPLATE_PREVIEW_POST.title,
                slug: 'preview-template',
                meta_description: null,
                site_id: template?.site_id || currentSite?.id || 'preview-site',
                featured_image: null,
                show_featured_image: (template?.content_blocks as any)?.show_featured_image !== false,
                excerpt: null,
                is_published: false,
              }}
              site={previewSite}
              className="min-h-full"
              blocksLoading={loading}
              allBlocks={blocks as any}
              onSelectBlock={setSelectedBlock as any}
            />
          </ScrollArea>
        </div>

        <PostBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={template?.site_id || currentSite?.id || ''}
          postTitle={draftPostTitle}
          onPostTitleChange={setDraftPostTitle}
          onContentChange={handleDraftChange}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
          mode="template"
        />

        {blockListOpen && (
          <PostBlockListPanel
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
          blockTypes={POST_BLOCK_TYPES}
          entityName="post template"
        />
      </div>
    </div>
  )
}
