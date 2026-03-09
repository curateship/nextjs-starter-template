"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePageData } from "@/components/admin/page-builder/config/usePageData"
import { usePageBuilder } from "@/components/admin/page-builder/config/usePageBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { StickyHeader } from "@/components/admin/page-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/page-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/page-builder/layout/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/page-builder/layout/BlockSelectionModal"
import { getSitePagesAction } from "@/lib/actions/pages/page-actions"
import type { Page } from "@/lib/actions/pages/page-actions"

export default function PageBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [pages, setPages] = useState<Page[]>([])
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)
  
  // Get initial page from URL params or default to home
  const initialPage = searchParams.get('page') || 'home'
  const [selectedPage, setSelectedPage] = useState(initialPage)
  const [blockModalOpen, setBlockModalOpen] = useState(false)

  // Custom hooks for data and state management
  const { site, pages: dataPages, blocks, siteLoading, blocksLoading, siteError, reloadBlocks } = usePageData(siteId)

  // Redirect when site changes in sidebar (skip while loading or when editing a template)
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId && !siteLoading && !site?.is_template) {
      router.push(`/admin/pages/${currentSite.id}`)
    }
  }, [currentSite, siteId, router, siteLoading, site])

  // Load pages data
  useEffect(() => {
    async function loadPages() {
      try {
        setPagesLoading(true)
        setPagesError(null)
        const { data, error } = await getSitePagesAction(siteId)
        if (error) {
          setPagesError(error)
          return
        }
        setPages(data || [])

        // If initial page doesn't exist, redirect to homepage
        if (data && data.length > 0) {
          const pageExists = data.some(p => p.slug === initialPage)
          if (!pageExists) {
            const homepage = data.find(p => p.is_homepage) || data[0]
            setSelectedPage(homepage.slug)
            router.replace(`/admin/pages/${siteId}?page=${homepage.slug}`)
          }
        }
      } catch (err) {
        setPagesError('Failed to load pages')
      } finally {
        setPagesLoading(false)
      }
    }

    loadPages()
  }, [siteId, initialPage, router])
  const [localBlocks, setLocalBlocks] = useState(blocks)
  
  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])
  
  // Update pages from hook data when available
  useEffect(() => {
    if (dataPages && dataPages.length > 0 && !pagesLoading) {
      setPages(dataPages)
    }
  }, [dataPages, pagesLoading])
  
  const builderState = usePageBuilder({ 
    siteId, 
    pages: pages.length > 0 ? pages : dataPages || [],
    blocks: localBlocks, 
    setBlocks: setLocalBlocks, 
    selectedPage,
    reloadBlocks
  })
  
  // Current page data with staged deletions filtered out
  const currentPageData = pages.find(p => p.slug === selectedPage)
  const currentPage = {
    slug: selectedPage,
    name: currentPageData?.title || selectedPage,
    blocks: (localBlocks[selectedPage] || []).filter((block, index, self) => 
      index === self.findIndex(b => b.id === block.id)
    )
  }
  
  // Handle page change with URL update
  const handlePageChange = (pageSlug: string) => {
    if (pageSlug !== selectedPage) {
      setSelectedPage(pageSlug)
      // Ensure blocks array exists for this page
      setLocalBlocks(prev => ({
        ...prev,
        [pageSlug]: prev[pageSlug] || []
      }))
      router.replace(`/admin/pages/${siteId}?page=${pageSlug}`)
    }
  }

  // Handle page creation
  const handlePageCreated = (newPage: Page) => {
    setPages(prev => [...prev, newPage])
    // Initialize blocks array for the new page
    setLocalBlocks(prev => ({
      ...prev,
      [newPage.slug]: []
    }))
    // Switch to the newly created page
    setSelectedPage(newPage.slug)
    router.replace(`/admin/pages/${siteId}?page=${newPage.slug}`)
  }

  // Handle page updates
  const handlePageUpdated = (updatedPage: Page) => {
    setPages(prev => prev.map(p => p.id === updatedPage.id ? updatedPage : p))
    
    // If the slug changed, we need to update our local blocks and URL
    const currentPage = pages.find(p => p.id === updatedPage.id)
    if (currentPage && currentPage.slug !== updatedPage.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForPage = prev[currentPage.slug] || []
        const { [currentPage.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedPage.slug]: blocksForPage
        }
      })
      
      // Update selected page and URL
      setSelectedPage(updatedPage.slug)
      router.replace(`/admin/pages/${siteId}?page=${updatedPage.slug}`)
    }
  }

  // Only show error state for critical failures
  if ((siteError || pagesError) && !site && !siteLoading) {
    return (
      <AdminLayout noPadding>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{siteError || pagesError || 'Site not found'}</p>
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

  const isTemplate = site?.is_template === true

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isTemplate && (
        <div className="bg-violet-600 text-white text-center text-sm py-1.5 px-4">
          Editing Theme: {site?.name}
        </div>
      )}
      <StickyHeader
        breadcrumbItems={[
          { href: site ? `/admin/sites/${site.id}/dashboard` : `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { href: site ? `/admin/sites/${site.id}/pages` : `/admin/sites/${siteId}/pages`, label: "Pages" },
          { label: currentPageData?.title || "", isPage: true }
        ]}
        pages={pages}
        selectedPage={selectedPage}
        onPageChange={handlePageChange}
        onPageCreated={handlePageCreated}
        onPageUpdated={handlePageUpdated}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        onPreviewPage={() => builderState.setSelectedBlock(null)}
        onOpenBlockModal={() => setBlockModalOpen(true)}
        site={site}
      />
      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builderState.selectedBlock}
          updateBlockContent={builderState.updateBlockContent}
          siteId={siteId}
          currentPage={currentPage}
          site={site ? {
            id: site.id,
            name: site.name,
            subdomain: site.subdomain,
            settings: site.settings
          } : undefined}
          blocksLoading={blocksLoading}
          onBack={() => builderState.setSelectedBlock(null)}
        />

        <BlockListPanel
          currentPage={currentPage}
          selectedBlock={builderState.selectedBlock}
          onSelectBlock={builderState.setSelectedBlock}
          onDeleteBlock={builderState.handleDeleteBlock}
          onReorderBlocks={builderState.handleReorderBlocks}
          onPreviewPage={() => builderState.setSelectedBlock(null)}
          deleting={builderState.deleting}
          blocksLoading={blocksLoading}
        />

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentPage.blocks.map(b => b.type)}
        />
      </div>
    </div>
  )
}