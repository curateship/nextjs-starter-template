"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useDirectoryData } from "@/components/admin/directory-builder/config/useDirectoryData"
import { useDirectoryBuilder } from "@/components/admin/directory-builder/config/useDirectoryBuilder"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { getDirectoryAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { BuilderToolbar } from "@/components/admin/shared/BuilderToolbar"
import { DirectorySettingsModal } from "@/components/admin/directory-builder/layout/DirectorySettingsModal"
import { CreateDirectoryModal } from "@/components/admin/directory-builder/layout/CreateDirectoryModal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BlockPropertiesPanel } from "@/components/admin/directory-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { DIRECTORY_BLOCK_TYPES } from "@/components/admin/directory-builder/config/directory-block-types"
import { searchSiteDirectoriesAction } from "@/lib/actions/directories/directory-list-actions"
import { updateDirectoryAction } from "@/lib/actions/directories/directory-actions"
import type { Directory } from "@/lib/actions/directories/directory-actions"
import { Blocks, Search } from "lucide-react"
import { getDirectoryCustomBlockSelectionType } from "@/lib/actions/directories/directory-custom-blocks/utils"

export default function DirectoryBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteSwitcher()
  // Get initial directory from URL params or default to first directory
  const initialDirectory = searchParams.get('directory') || ''
  const [selectedDirectory, setSelectedDirectory] = useState(initialDirectory)
  const [directoryOptions, setDirectoryOptions] = useState<Array<Pick<Directory, 'id' | 'site_id' | 'title' | 'slug' | 'status'>>>(
    []
  )
  const [directorySearch, setDirectorySearch] = useState("")
  const [directoryOptionsLoading, setDirectoryOptionsLoading] = useState(false)
  const [directoryOptionsError, setDirectoryOptionsError] = useState<string | null>(null)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/directories/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load searchable directory picker options
  useEffect(() => {
    let cancelled = false

    async function loadDirectoryOptions() {
      try {
        setDirectoryOptionsLoading(true)
        setDirectoryOptionsError(null)
        const { data, error } = await searchSiteDirectoriesAction(siteId, {
          search: directorySearch,
          limit: 20,
        })

        if (error) {
          if (!cancelled) {
            setDirectoryOptionsError(error)
            setDirectoryOptions([])
          }
          return
        }

        if (!cancelled) {
          const options = (data || []).map((directory) => ({
            id: directory.id,
            site_id: directory.site_id,
            title: directory.title,
            slug: directory.slug,
            status: directory.status,
          }))
          setDirectoryOptions(options)

          if (!selectedDirectory && options.length > 0) {
            const firstDirectory = options[0]
            setSelectedDirectory(firstDirectory.slug)
            router.replace(`/admin/directories/builder/${siteId}?directory=${firstDirectory.slug}`)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setDirectoryOptionsError('Failed to load directories')
          setDirectoryOptions([])
        }
      } finally {
        if (!cancelled) {
          setDirectoryOptionsLoading(false)
        }
      }
    }

    loadDirectoryOptions()

    return () => {
      cancelled = true
    }
  }, [siteId, directorySearch, selectedDirectory, router])

  // Custom hooks for data and state management
  const { site, directory: currentDirectoryData, blocks, siteBlocks, customBlockTemplates, blocksLoading, siteError, reloadBlocks } = useDirectoryData(siteId, selectedDirectory)
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

  // Current directory data with staged deletions filtered out
  const currentDirectory = {
    slug: selectedDirectory,
    name: currentDirectoryData?.title || selectedDirectory,
    blocks: localBlocks[selectedDirectory] || []
  }

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

  // Handle directory change with URL update
  const handleDirectoryChange = (directorySlug: string) => {
    if (directorySlug !== selectedDirectory) {
      setSelectedDirectory(directorySlug)
      // Ensure blocks array exists for this directory
      setLocalBlocks(prev => ({
        ...prev,
        [directorySlug]: prev[directorySlug] || []
      }))
      router.replace(`/admin/directories/builder/${siteId}?directory=${directorySlug}`)
    }
  }

  // Handle directory creation
  const handleDirectoryCreated = async (newDirectory: Directory) => {
    setDirectoryOptions((prev) => {
      const next = [newDirectory, ...prev.filter((directory) => directory.id !== newDirectory.id)]
      return next.slice(0, 20)
    })
    setSelectedDirectory(newDirectory.slug)
    router.replace(`/admin/directories/builder/${siteId}?directory=${newDirectory.slug}`)
    await reloadBlocks()
  }

  // Handle directory updates
  const handleDirectoryUpdated = async (updatedDirectory: Directory) => {
    setDirectoryOptions((prev) => prev.map((directory) => directory.id === updatedDirectory.id ? updatedDirectory : directory))

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
      setSelectedDirectory(updatedDirectory.slug)
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

  const handleTitleChange = (title: string) => {
    void updateCurrentDirectory({ title })
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

  const toolbarItems = (() => {
    const items = currentDirectoryData
      ? [currentDirectoryData, ...directoryOptions.filter((directory) => directory.id !== currentDirectoryData.id)]
      : directoryOptions

    return items.slice(0, 20)
  })()


  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader navLinks={getDirectoryAdminTopNavLinks("directory")} />
      <BuilderToolbar
        className="top-16 z-40"
        showSidebarToggle={false}
        breadcrumbItems={[
          { href: "/admin/directories", label: "Directory" },
          { label: currentDirectoryData?.title || "", isPage: true }
        ]}
        items={toolbarItems}
        selectedItemSlug={selectedDirectory}
        onItemChange={handleDirectoryChange}
        entityName="Directory"
        getItemUrl={(item) => `${currentSite ? getSiteUrl(currentSite) : ''}/directories/${item.slug}`}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        onPublish={handlePublish}
        isPublishing={isPublishing}
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
        rightActions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={directorySearch}
                onChange={(event) => setDirectorySearch(event.target.value)}
                placeholder="Search directories"
                className="h-9 w-56 pl-8"
              />
            </div>
            {directoryOptionsLoading && (
              <span className="text-xs text-muted-foreground">Searching…</span>
            )}
            {directoryOptionsError && (
              <span className="text-xs text-red-600">{directoryOptionsError}</span>
            )}
          </div>
        }
        renderCreateModal={(show, setShow) => (
          <Dialog open={show} onOpenChange={setShow}>
            <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader>
                <DialogTitle>Create New Directory</DialogTitle>
                <DialogDescription>Add a new directory to your site. You can customize the content after creation.</DialogDescription>
              </DialogHeader>
              <CreateDirectoryModal
                onSuccess={(directory) => { handleDirectoryCreated(directory); setShow(false); }}
                onCancel={() => setShow(false)}
              />
            </DialogContent>
          </Dialog>
        )}
        renderSettingsModal={(show, setShow, currentItem) => (
          <DirectorySettingsModal
            open={show}
            onOpenChange={setShow}
            directory={(currentItem ? currentDirectoryData : null) || null}
            site={currentSite}
            onSuccess={handleDirectoryUpdated}
          />
        )}
      />
      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builderState.selectedBlock}
          updateBlockContent={builderState.updateBlockContent}
          siteId={siteId}
          currentDirectory={{
            ...currentDirectory,
            id: currentDirectoryData?.id,
            title: currentDirectoryData?.title,
            meta_description: currentDirectoryData?.meta_description || undefined,
            site_id: currentDirectoryData?.site_id,
            featured_image: currentDirectoryData?.featured_image,
            description: currentDirectoryData?.description
          }}
          site={{
            id: siteId,
            name: site?.name || 'Directory Site',
            subdomain: site?.subdomain || 'preview',
            settings: site?.settings
          }}
          siteBlocks={siteBlocks}
          customBlockTemplates={customBlockTemplates}
          blocksLoading={blocksLoading}
          onTitleChange={handleTitleChange}
          onSelectBlock={builderState.setSelectedBlock}
          onBack={() => builderState.setSelectedBlock(null)}
        />

        {blockListOpen && (
          <BlockListPanel
            blocks={currentDirectory.blocks}
            blockTypes={DIRECTORY_BLOCK_TYPES}
            entityName="directory"
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
