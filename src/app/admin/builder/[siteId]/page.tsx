"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePageData } from "@/hooks/usePageData"
import { usePageBuilder } from "@/hooks/usePageBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { PageBuilderHeader } from "@/components/admin/layout/page-builder/PageBuilderHeader"
import { BlockPropertiesPanel } from "@/components/admin/layout/page-builder/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/layout/page-builder/BlockListPanel"
import { BlockTypesPanel } from "@/components/admin/layout/page-builder/BlockTypesPanel"
import { getSitePagesAction } from "@/lib/actions/page-actions"
import type { Page } from "@/lib/actions/page-actions"

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
  
  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])
  
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
            router.replace(`/admin/builder/${siteId}?page=${homepage.slug}`)
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
  
  // Custom hooks for data and state management
  const { site, blocks, siteLoading, blocksLoading, siteError, reloadBlocks } = usePageData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)
  
  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])
  
  const builderState = usePageBuilder({ 
    siteId, 
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
    blocks: localBlocks[selectedPage] || []
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
      router.replace(`/admin/builder/${siteId}?page=${pageSlug}`)
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
    router.replace(`/admin/builder/${siteId}?page=${newPage.slug}`)
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
      router.replace(`/admin/builder/${siteId}?page=${updatedPage.slug}`)
    }
  }

  // Only show error state for critical failures
  if ((siteError || pagesError) && !site && !siteLoading) {
    return (
      <AdminLayout>
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

  return (
    <AdminLayout>
      <div className="flex flex-col -m-4 -mt-6 h-full">
        <PageBuilderHeader
          site={site}
          pages={pages}
          selectedPage={selectedPage}
          onPageChange={handlePageChange}
          onPageCreated={handlePageCreated}
          onPageUpdated={handlePageUpdated}
          saveMessage={builderState.saveMessage}
          isSaving={builderState.isSaving}
          onSave={builderState.handleSaveAllBlocks}
          onPreviewPage={() => builderState.setSelectedBlock(null)}
          pagesLoading={pagesLoading}
        />
        
        <div className="flex-1 flex">
          <BlockPropertiesPanel
            selectedBlock={builderState.selectedBlock}
            updateBlockContent={builderState.updateBlockContent}
            siteId={siteId}
            currentPage={currentPage}
            site={site}
            allBlocks={localBlocks}
            blocksLoading={blocksLoading}
          />
          
          <BlockListPanel
            currentPage={currentPage}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            deleting={builderState.deleting}
            blocksLoading={blocksLoading}
          />
          
          <BlockTypesPanel
            onAddHeroBlock={builderState.handleAddHeroBlock}
            onAddRichTextBlock={builderState.handleAddRichTextBlock}
            onAddFaqBlock={builderState.handleAddFaqBlock}
          />
        </div>
      </div>
    </AdminLayout>
  )
}