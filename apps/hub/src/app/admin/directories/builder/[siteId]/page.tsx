"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useDirectoryData } from "@/components/admin/directory-builder/config/useDirectoryData"
import { useDirectoryBuilder } from "@/components/admin/directory-builder/config/useDirectoryBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getDirectoryAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { DirectorySettingsModal } from "@/components/admin/directory-builder/layout/DirectorySettingsModal"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { DIRECTORY_BLOCK_TYPES } from "@/components/admin/directory-builder/config/directory-block-types"
import { directoryBlocksToJson, orderDirectoryEditorBlocks } from "@/components/admin/directory-builder/config/directory-block-utils"
import { updateDirectoryAction, updateDirectoryBlocksAction } from "@/lib/actions/directories/directory-actions"
import type { Directory } from "@/lib/actions/directories/directory-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { Blocks } from "lucide-react"
import { getDirectoryCustomBlockSelectionType } from "@/lib/actions/directories/directory-custom-blocks/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DirectoryPreview } from "@/components/admin/directory-builder/layout/DirectoryPreview"
import { DirectoryBlockEditorModal } from "@/components/admin/directory-builder/layout/DirectoryBlockEditorModal"
import { DirectoryBlockListPanel } from "@/components/admin/directory-builder/layout/DirectoryBlockListPanel"

export default function DirectoryBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteSwitcher()
  const directoryFromUrl = searchParams.get('directory') || ''
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const selectedDirectory = directoryFromUrl || ''

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/directories/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Custom hooks for data and state management
  const {
    site,
    directory: currentDirectoryData,
    directoryOptions,
    blocks,
    customBlockTemplates,
    blocksLoading,
    siteError,
    reloadBlocks,
  } = useDirectoryData(siteId, selectedDirectory)

  useEffect(() => {
    if (!directoryFromUrl && directoryOptions.length > 0) {
      router.replace(`/admin/directories/builder/${siteId}?directory=${directoryOptions[0].slug}`)
    }
  }, [directoryFromUrl, directoryOptions, router, siteId])

  const [localBlocks, setLocalBlocks] = useState(blocks)

  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks({ ...blocks })
  }, [blocks])

  const builderState = useDirectoryBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedDirectory,
    directoryId: currentDirectoryData?.id,
    customBlockTemplates,
    currentDirectory: currentDirectoryData || undefined
  })
  const selectedBlock = builderState.selectedBlock
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftDirectoryTitle, setDraftDirectoryTitle] = useState("")
  const [draftDirectoryFeaturedImage, setDraftDirectoryFeaturedImage] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

  // Current directory data with staged deletions filtered out
  const currentDirectory = {
    slug: selectedDirectory,
    name: currentDirectoryData?.title || selectedDirectory,
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
    setDraftDirectoryTitle(currentDirectoryData?.title || selectedDirectory)
    setDraftDirectoryFeaturedImage(currentDirectoryData?.featured_image || "")
    setBlockSaveError(null)
  }, [selectedBlock, currentDirectoryData?.featured_image, currentDirectoryData?.title, selectedDirectory])

  const customBlockDefinitions = customBlockTemplates.map(template => ({
    type: getDirectoryCustomBlockSelectionType(template.id),
    name: template.name,
    icon: Blocks,
    description: `${template.layout} • ${template.fields.length} field${template.fields.length === 1 ? '' : 's'}`,
    defaultContent: {
      templateId: template.id,
      values: {},
    },
  }))

  // Handle directory updates
  const handleDirectoryUpdated = async (updatedDirectory: Directory) => {
    if (currentDirectoryData && currentDirectoryData.slug !== updatedDirectory.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForDirectory = prev[currentDirectoryData.slug] || []
        const { [currentDirectoryData.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedDirectory.slug]: blocksForDirectory
        }
      })

      // Update selected directory and URL
      router.replace(`/admin/directories/builder/${siteId}?directory=${updatedDirectory.slug}`)
    }

    await reloadBlocks()
  }

  // Handle directory information updates
  const updateCurrentDirectory = async (updates: { title?: string; description?: string; featured_image?: string; status?: 'draft' | 'published' }) => {
    if (!currentDirectoryData?.id) return

    try {
      const { data, error } = await updateDirectoryAction(currentDirectoryData.id, updates)
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
    if (!currentDirectoryData?.id) return
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
    if (!selectedBlock || !currentDirectoryData?.id) return

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
      if (selectedBlock.type === "directory-content") {
        const nextTitle = draftDirectoryTitle.trim() || currentDirectoryData.title
        const nextFeaturedImage = draftDirectoryFeaturedImage.trim() || null
        const currentFeaturedImage = currentDirectoryData.featured_image || null
        const directoryUpdates: { title?: string; featured_image?: string | null } = {}

        if (nextTitle !== currentDirectoryData.title) {
          directoryUpdates.title = nextTitle
        }

        if (nextFeaturedImage !== currentFeaturedImage) {
          directoryUpdates.featured_image = nextFeaturedImage
        }

        if (Object.keys(directoryUpdates).length > 0) {
          const { data, error } = await updateDirectoryAction(currentDirectoryData.id, directoryUpdates)
          if (error || !data) {
            setBlockSaveError(error || "Failed to save directory details")
            return
          }
          updatedDirectory = data
        }
      }

      const contentBlocks = directoryBlocksToJson(nextBlocks, currentDirectoryData.content_blocks || {})
      const result = await updateDirectoryBlocksAction(currentDirectoryData.id, contentBlocks)
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

  // Only show loading state for critical errors (not during normal loading)
  if (!site && siteError) {
    return (
      <AdminLayout noPadding>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{siteError}</p>
            <p className="text-sm text-muted-foreground mb-4">
              Site ID: <code>{siteId}</code>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Please go to Sites page to get a valid site ID, or create a new site.
            </p>
            <div className="space-x-2">
              <Button asChild>
                <Link href="/admin/sites">Go to Sites</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/sites/new">Create New Site</Link>
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  const previewBlocks = selectedBlock
    ? orderDirectoryEditorBlocks(currentDirectory.blocks.map((block) => (
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      )))
    : currentDirectory.blocks

  const previewDirectoryTitle = selectedBlock?.type === "directory-content"
    ? draftDirectoryTitle.trim() || currentDirectoryData?.title || currentDirectory.name
    : currentDirectoryData?.title || currentDirectory.name

  const previewDirectoryFeaturedImage = selectedBlock?.type === "directory-content"
    ? draftDirectoryFeaturedImage.trim() || null
    : currentDirectoryData?.featured_image || null
  const viewPageHref = site && currentDirectoryData
    ? `${getSiteUrl(site)}/directories/${currentDirectoryData.slug}`
    : null


  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        navLinks={getDirectoryAdminTopNavLinks("directory")}
        rightActions={(
          <StickybarTopRightActions
            preActions={siteError ? <span className="text-xs text-red-600">{siteError}</span> : null}
            viewPageHref={viewPageHref}
            saveMessage={builderState.saveMessage}
            isSaving={builderState.isSaving}
            onSave={builderState.handleSaveAllBlocks}
            onPublish={handlePublish}
            isPublishing={isPublishing}
            isPublished={currentDirectoryData?.status === "published"}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentDirectoryData}
            renderSettingsModal={(show, setShow) => (
              show ? (
                <DirectorySettingsModal
                  open={show}
                  onOpenChange={setShow}
                  directory={currentDirectoryData || null}
                  site={currentSite}
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
              directory={currentDirectoryData ? {
                id: currentDirectoryData.id || 'preview',
                title: previewDirectoryTitle,
                slug: currentDirectoryData.slug,
                meta_description: currentDirectoryData.meta_description || undefined,
                site_id: currentDirectoryData.site_id,
                featured_image: previewDirectoryFeaturedImage,
                description: currentDirectoryData.description || null,
                status: currentDirectoryData.status || 'draft',
                updated_at: currentDirectoryData.updated_at,
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
              customBlockTemplates={customBlockTemplates}
              onSelectBlock={builderState.setSelectedBlock}
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
        />

        {blockListOpen && (
          <DirectoryBlockListPanel
            blocks={currentDirectory.blocks}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            onPreview={() => builderState.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            blocksLoading={blocksLoading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentDirectory.blocks.map(b => b.type)}
          sections={[
            { title: 'Built In', blockTypes: DIRECTORY_BLOCK_TYPES },
            { title: 'Custom', blockTypes: customBlockDefinitions },
          ]}
          entityName="directory"
        />
      </div>
    </div>
  )
}
