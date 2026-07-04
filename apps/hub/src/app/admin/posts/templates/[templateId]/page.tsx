"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { useSaveStatus } from "@/components/admin/layout/builder/save-status"
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
import { Check, Pencil, X } from "lucide-react"
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
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [previewTitle, setPreviewTitle] = useState("Preview Post")
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftPostTitle, setDraftPostTitle] = useState("Preview Post")
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

  const loadTemplate = useCallback(async () => {
    setLoading(true)

    const { data, error: fetchError } = await getPostTemplateById(templateId)
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
      setBlockSaveError(null)
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftPostTitle(previewTitle)
    setBlockSaveError(null)
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
    setBlockSaveError(null)
  }

  async function handleSaveBlockEditor() {
    if (!template || !selectedBlock) return

    setIsSavingBlock(true)
    setBlockSaveError(null)

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
      const { data, error: saveError } = await updatePostTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError || !data) {
        setBlockSaveError(saveError || "Failed to save block")
        return
      }

      setBlocks(orderedBlocks)
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

  async function handleSave() {
    if (!template) return

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const contentBlocks = postBlocksToJson(blocks, template.content_blocks || {})
      const { data, error: saveError } = await updatePostTemplate(template.id, {
        content_blocks: contentBlocks,
      })

      if (saveError) {
        setSaveStatus("error", saveError)
      } else if (data) {
        setTemplate(data)
        setBlocks(parsePostBlocksFromJson(data.content_blocks || {}))
        setSaveStatus("saved")
      }
    } catch (err) {
      setSaveStatus("error", err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveName() {
    if (!template || !nameInput.trim()) return

    const { data, error: saveError } = await updatePostTemplate(template.id, { name: nameInput.trim() })
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
            isSaving={isSaving}
            onSave={handleSave}
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
          error={blockSaveError}
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
