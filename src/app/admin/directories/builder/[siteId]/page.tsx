"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useDirectoryData } from "@/hooks/useDirectoryData"
import { useDirectoryBuilder } from "@/hooks/useDirectoryBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { StickyHeader } from "@/components/admin/directory-builder/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/directory-builder/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/directory-builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/directory-builder/BlockSelectionModal"
import { getSiteDirectoriesAction, updateDirectoryAction } from "@/lib/actions/directories/directory-actions"
import type { Directory } from "@/lib/actions/directories/directory-actions"

export default function DirectoryBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [directories, setDirectories] = useState<Directory[]>([])
  const [directoriesLoading, setDirectoriesLoading] = useState(true)
  const [directoriesError, setDirectoriesError] = useState<string | null>(null)
  // Get initial directory from URL params or default to first directory
  const initialDirectory = searchParams.get('directory') || ''
  const [selectedDirectory, setSelectedDirectory] = useState(initialDirectory)
  const [blockModalOpen, setBlockModalOpen] = useState(false)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/directories/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load directories data
  useEffect(() => {
    async function loadDirectories() {
      try {
        setDirectoriesLoading(true)
        setDirectoriesError(null)
        const { data, error } = await getSiteDirectoriesAction(siteId)
        if (error) {
          setDirectoriesError(error)
          return
        }
        setDirectories(data || [])

        // If initial directory doesn't exist, redirect to first directory
        if (data && data.length > 0) {
          const directoryExists = data.some(d => d.slug === initialDirectory)
          if (!directoryExists) {
            const firstDirectory = data[0]
            setSelectedDirectory(firstDirectory.slug)
            router.replace(`/admin/directories/builder/${siteId}?directory=${firstDirectory.slug}`)
          }
        }
      } catch (err) {
        setDirectoriesError('Failed to load directories')
      } finally {
        setDirectoriesLoading(false)
      }
    }

    loadDirectories()
  }, [siteId, initialDirectory, router])

  // Custom hooks for data and state management
  const { site, blocks, siteBlocks, siteLoading, blocksLoading, siteError, reloadBlocks } = useDirectoryData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)

  // Update local blocks when server blocks change, auto-add directory-content if missing
  useEffect(() => {
    const updated = { ...blocks }
    for (const slug of Object.keys(updated)) {
      const hasContentBlock = updated[slug]?.some(b => b.type === 'directory-content')
      if (!hasContentBlock) {
        updated[slug] = [
          {
            id: `directory-content-${Date.now()}`,
            type: 'directory-content',
            title: 'Content',
            content: { showFeaturedImage: true, body: '', format: 'html' }
          },
          ...(updated[slug] || [])
        ]
      }
    }
    setLocalBlocks(updated)
  }, [blocks])

  const builderState = useDirectoryBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedDirectory,
    directoryId: directories.find(d => d.slug === selectedDirectory)?.id,
    currentDirectory: directories.find(d => d.slug === selectedDirectory)
  })

  // Current directory data with staged deletions filtered out
  const currentDirectoryData = directories.find(d => d.slug === selectedDirectory)
  const currentDirectory = {
    slug: selectedDirectory,
    name: currentDirectoryData?.title || selectedDirectory,
    blocks: localBlocks[selectedDirectory] || []
  }

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
  const handleDirectoryCreated = (newDirectory: Directory) => {
    setDirectories(prev => [...prev, newDirectory])
    // Initialize blocks array for the new directory
    setLocalBlocks(prev => ({
      ...prev,
      [newDirectory.slug]: []
    }))
    // Switch to the newly created directory
    setSelectedDirectory(newDirectory.slug)
    router.replace(`/admin/directories/builder/${siteId}?directory=${newDirectory.slug}`)
  }

  // Handle directory updates
  const handleDirectoryUpdated = (updatedDirectory: Directory) => {
    setDirectories(prev => prev.map(d => d.id === updatedDirectory.id ? updatedDirectory : d))

    // If the slug changed, we need to update our local blocks and URL
    const currentDirectory = directories.find(d => d.id === updatedDirectory.id)
    if (currentDirectory && currentDirectory.slug !== updatedDirectory.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForDirectory = prev[currentDirectory.slug] || []
        const { [currentDirectory.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedDirectory.slug]: blocksForDirectory
        }
      })

      // Update selected directory and URL
      setSelectedDirectory(updatedDirectory.slug)
      router.replace(`/admin/directories/builder/${siteId}?directory=${updatedDirectory.slug}`)
    }
  }

  // Handle directory information updates
  const updateCurrentDirectory = async (updates: { title?: string; description?: string; featured_image?: string; is_published?: boolean }) => {
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

  const handleTitleChange = (title: string) => {
    updateCurrentDirectory({ title })
  }

  const handleDescriptionChange = (description: string) => {
    updateCurrentDirectory({ description })
  }

  const handleFeaturedImageChange = (featured_image: string) => {
    updateCurrentDirectory({ featured_image })
  }

  const handleStatusChange = (status: string) => {
    updateCurrentDirectory({ is_published: status === 'published' })
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


  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/directories", label: "Directories" },
          { label: currentDirectoryData?.title || "", isPage: true }
        ]}
        directories={directories}
        selectedDirectory={selectedDirectory}
        onDirectoryChange={handleDirectoryChange}
        onDirectoryCreated={handleDirectoryCreated}
        onDirectoryUpdated={handleDirectoryUpdated}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        onOpenBlockModal={() => setBlockModalOpen(true)}
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
          blocksLoading={blocksLoading}
          onTitleChange={handleTitleChange}
          onDescriptionChange={handleDescriptionChange}
          onFeaturedImageChange={handleFeaturedImageChange}
          onStatusChange={handleStatusChange}
        />

        <BlockListPanel
          currentDirectory={currentDirectory}
          selectedBlock={builderState.selectedBlock}
          onSelectBlock={builderState.setSelectedBlock}
          onDeleteBlock={builderState.handleDeleteBlock}
          onReorderBlocks={builderState.handleReorderBlocks}
          onPreviewDirectory={() => builderState.setSelectedBlock(null)}
          deleting={null}
          blocksLoading={blocksLoading}
        />

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentDirectory.blocks.map(b => b.type)}
        />
      </div>
    </div>
  )
}
