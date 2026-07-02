"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useDirectoryBuilderData } from "@/components/admin/directory-builder/config/useDirectoryBuilderData"
import { useDirectoryBuilder } from "@/components/admin/directory-builder/config/useDirectoryBuilder"
import {
  useBuilderRouteSiteSync,
  useSelectedBuilderSlug,
  useSyncedBuilderBlocks,
} from "@/components/admin/layout/builder/useBuilderRouteState"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { DirectorySettingsModal } from "@/components/admin/directory-builder/layout/DirectorySettingsModal"
import { orderDirectoryEditorBlocks } from "@/components/admin/directory-builder/config/directory-block-utils"
import { updateDirectoryAction, updateDirectoryBlockValuesAction } from "@/lib/actions/directories/directory-actions"
import { directoryBlocksToValueJson } from "@/lib/actions/directories/directory-template-inheritance"
import type { Directory } from "@/lib/actions/directories/directory-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DirectoryPreview } from "@/components/admin/directory-builder/layout/DirectoryPreview"
import { DirectoryBlockEditorModal } from "@/components/admin/directory-builder/layout/DirectoryBlockEditorModal"
import { DirectoryBlockListPanel } from "@/components/admin/directory-builder/layout/DirectoryBlockListPanel"

export default function DirectoryBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const directoryFromUrl = searchParams.get('directory') || ''
  const { currentSite } = useBuilderRouteSiteSync({
    builderPath: "/admin/directory/builder",
    queryParam: "directory",
    queryValue: directoryFromUrl,
    siteId,
  })
  const [blockListOpen, setBlockListOpen] = useState(false)
  const selectedDirectory = directoryFromUrl || ''

  // Custom hooks for data and state management
  const {
    site,
    directory: currentDirectoryRecord,
    directoryOptions,
    blocks,
    customBlockTemplates,
    blocksLoading,
    siteError,
    reloadBlocks,
  } = useDirectoryBuilderData(siteId, selectedDirectory)

  useSelectedBuilderSlug({
    builderPath: "/admin/directory/builder",
    items: directoryOptions,
    queryParam: "directory",
    siteId,
    slugFromUrl: directoryFromUrl,
  })

  const [localBlocks, setLocalBlocks] = useSyncedBuilderBlocks(blocks, { shallowCopy: true })

  const builderState = useDirectoryBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedDirectory,
    directoryId: currentDirectoryRecord?.id,
  })
  const selectedBlock = builderState.selectedBlock
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftDirectoryTitle, setDraftDirectoryTitle] = useState("")
  const [draftDirectoryFeaturedImage, setDraftDirectoryFeaturedImage] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

  // Current directory row with staged deletions filtered out
  const currentDirectory = {
    slug: selectedDirectory,
    name: currentDirectoryRecord?.title || selectedDirectory,
    blocks: localBlocks[selectedDirectory] || []
  }

  useEffect(() => {
    if (!selectedBlock) {
      setDraftContent({})
      setDraftDirectoryTitle("")
      setBlockSaveError(null)
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftDirectoryTitle(currentDirectoryRecord?.title || selectedDirectory)
    setDraftDirectoryFeaturedImage(currentDirectoryRecord?.featured_image || "")
    setBlockSaveError(null)
  }, [selectedBlock, currentDirectoryRecord?.featured_image, currentDirectoryRecord?.title, selectedDirectory])

  // Handle directory updates
  const handleDirectoryUpdated = async (updatedDirectory: Directory) => {
    if (currentDirectoryRecord && currentDirectoryRecord.slug !== updatedDirectory.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForDirectory = prev[currentDirectoryRecord.slug] || []
        const { [currentDirectoryRecord.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedDirectory.slug]: blocksForDirectory
        }
      })

      // Update selected directory and URL
      router.replace(`/admin/directory/builder/${siteId}?directory=${updatedDirectory.slug}`)
    }

    await reloadBlocks()
  }

  // Handle directory information updates
  const updateCurrentDirectory = async (updates: { title?: string; featured_image?: string; status?: 'draft' | 'published' }) => {
    if (!currentDirectoryRecord?.id) return

    try {
      const { data, error } = await updateDirectoryAction(currentDirectoryRecord.id, updates)
      if (error) {
        console.error('Failed to update directory:', error)
        return
      }
      if (data) {
        handleDirectoryUpdated(data)
      }
    } catch (error) {
      console.error('Failed to update directory:', error)
    }
  }

  const [isPublishing, setIsPublishing] = useState(false)
  const handlePublish = async () => {
    if (!currentDirectoryRecord?.id) return
    try {
      setIsPublishing(true)
      await updateCurrentDirectory({ status: 'published' })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleDraftFeaturedImageChange = (featuredImage: string) => {
    setDraftDirectoryFeaturedImage(featuredImage)
  }

  const handleCloseBlockEditor = () => {
    if (isSavingBlock) return
    builderState.setSelectedBlock(null)
    setBlockSaveError(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!selectedBlock || !currentDirectoryRecord?.id) return

    setIsSavingBlock(true)
    setBlockSaveError(null)

    try {
      const currentBlocks = localBlocks[selectedDirectory] || []
      const nextBlocks = orderDirectoryEditorBlocks(currentBlocks.map((block) =>
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      ))

      let updatedDirectory: Directory | null = null
      if (selectedBlock.type === DIRECTORY_CORE_BLOCK_TYPE) {
        const nextTitle = draftDirectoryTitle.trim() || currentDirectoryRecord.title
        const nextFeaturedImage = draftDirectoryFeaturedImage.trim() || null
        const currentFeaturedImage = currentDirectoryRecord.featured_image || null
        const directoryUpdates: { title?: string; featured_image?: string | null } = {}

        if (nextTitle !== currentDirectoryRecord.title) {
          directoryUpdates.title = nextTitle
        }

        if (nextFeaturedImage !== currentFeaturedImage) {
          directoryUpdates.featured_image = nextFeaturedImage
        }

        if (Object.keys(directoryUpdates).length > 0) {
          const { data, error } = await updateDirectoryAction(currentDirectoryRecord.id, directoryUpdates)
          if (error || !data) {
            setBlockSaveError(error || "Failed to save directory details")
            return
          }
          updatedDirectory = data
        }
      }

      const contentBlocks = directoryBlocksToValueJson(nextBlocks)
      const result = await updateDirectoryBlockValuesAction(currentDirectoryRecord.id, contentBlocks)
      if (!result.success) {
        setBlockSaveError(result.error || "Failed to save block")
        return
      }

      setLocalBlocks((current) => ({
        ...current,
        [selectedDirectory]: nextBlocks,
      }))
      if (updatedDirectory) {
        await handleDirectoryUpdated(updatedDirectory)
      }
      builderState.setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  const previewBlocks = selectedBlock
    ? orderDirectoryEditorBlocks(currentDirectory.blocks.map((block) => (
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      )))
    : currentDirectory.blocks

  const selectedBlockIsCore = selectedBlock?.type === DIRECTORY_CORE_BLOCK_TYPE
  const previewDirectoryTitle = selectedBlockIsCore
    ? draftDirectoryTitle.trim() || currentDirectoryRecord?.title || currentDirectory.name
    : currentDirectoryRecord?.title || currentDirectory.name

  const previewDirectoryFeaturedImage = selectedBlockIsCore
    ? draftDirectoryFeaturedImage.trim() || null
    : currentDirectoryRecord?.featured_image || null
  const viewPageHref = site && currentDirectoryRecord
    ? `${getSiteUrl(site)}/directory/${currentDirectoryRecord.slug}`
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            preActions={siteError ? <span className="text-xs text-red-600">{siteError}</span> : null}
            saveMessage={builderState.saveMessage}
            isSaving={builderState.isSaving}
            onSave={builderState.handleSaveAllBlocks}
            onPublish={handlePublish}
            isPublishing={isPublishing}
            isPublished={currentDirectoryRecord?.status === "published"}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentDirectoryRecord}
            renderSettingsModal={(show, setShow) => (
              show ? (
                <DirectorySettingsModal
                  open={show}
                  onOpenChange={setShow}
                  directory={currentDirectoryRecord || null}
                  site={currentSite}
                  blocks={currentDirectory.blocks}
                  onSuccess={handleDirectoryUpdated}
                />
              ) : null
            )}
          />
        )}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <DirectoryPreview
              blocks={previewBlocks}
              directory={currentDirectoryRecord ? {
                id: currentDirectoryRecord.id || 'preview',
                title: previewDirectoryTitle,
                slug: currentDirectoryRecord.slug,
                meta_description: currentDirectoryRecord.meta_description || undefined,
                site_id: currentDirectoryRecord.site_id,
                featured_image: previewDirectoryFeaturedImage,
                source_type: currentDirectoryRecord.source_type,
                source_id: currentDirectoryRecord.source_id,
                status: currentDirectoryRecord.status || 'draft',
                updated_at: currentDirectoryRecord.updated_at,
              } : undefined}
              site={{
                id: siteId,
                name: site?.name || 'Directory Site',
                subdomain: site?.subdomain || 'preview',
                settings: site?.settings
              }}
              className="min-h-full"
              blocksLoading={blocksLoading}
              allBlocks={currentDirectory.blocks}
              selectedBlock={selectedBlock}
              customBlockTemplates={customBlockTemplates}
              onSelectBlock={builderState.setSelectedBlock}
              onUpdateRichTextBody={(blockId, htmlContent) => {
                const block = currentDirectory.blocks.find((item) => item.id === blockId)
                if (!block) return

                builderState.handleUpdateBlock(blockId, {
                  content: {
                    ...block.content,
                    body: htmlContent,
                    format: "html",
                  },
                })
              }}
            />
          </ScrollArea>
        </div>

        <DirectoryBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={siteId}
          directoryTitle={draftDirectoryTitle}
          directoryFeaturedImage={draftDirectoryFeaturedImage}
          onDirectoryTitleChange={setDraftDirectoryTitle}
          onDirectoryFeaturedImageChange={handleDraftFeaturedImageChange}
          onContentChange={handleDraftChange}
          customBlockTemplates={customBlockTemplates}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
          error={blockSaveError}
          mode="listing"
        />

        {blockListOpen && (
          <DirectoryBlockListPanel
            blocks={currentDirectory.blocks}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            viewPageHref={viewPageHref}
            blocksLoading={blocksLoading}
          />
        )}

      </div>
    </div>
  )
}
