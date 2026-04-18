"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getPageAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePageData } from "@/components/admin/page-builder/config/usePageData"
import { usePageBuilder } from "@/components/admin/page-builder/config/usePageBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { PageSettingsModal } from "@/components/admin/page-builder/layout/PageSettingsModal"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { PAGE_BLOCK_TYPES } from "@/components/admin/page-builder/config/page-block-types"
import { PagePreview } from "@/components/admin/page-builder/layout/PagePreview"
import { PageBlockEditorDialog } from "@/components/admin/page-builder/layout/PageBlockEditorDialog"
import { getSitePagesAction } from "@/lib/actions/pages/page-actions"
import type { Page } from "@/lib/actions/pages/page-actions"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function PageBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteSwitcher()
  const [pages, setPages] = useState<Page[]>([])
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)
  
  // Get initial page from URL params or default to home
  const initialPage = searchParams.get('page') || 'home'
  const [selectedPage, setSelectedPage] = useState(initialPage)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)

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

  useEffect(() => {
    if (!builderState.selectedBlock) return
    setDraftContent(builderState.selectedBlock.content)
  }, [builderState.selectedBlock])
  
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

  const handleSelectSiteChrome = (type: 'navigation' | 'footer') => {
    const returnTo = encodeURIComponent(`/admin/pages/${siteId}?page=${selectedPage}`)
    router.push(`/admin/sites/${siteId}/structure/${type}?returnTo=${returnTo}`)
  }

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (!builderState.selectedBlock) return

    setDraftContent(builderState.selectedBlock.content)
    builderState.setSelectedBlock(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!builderState.selectedBlock) return

    setIsSavingBlock(true)
    const saved = await builderState.saveSelectedBlockContent(draftContent)
    setIsSavingBlock(false)

    if (saved) {
      builderState.setSelectedBlock(null)
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
      <DashboardStickyHeader
        navLinks={getPageAdminTopNavLinks(siteId, "pages")}
        rightActions={(
          <StickybarTopRightActions
            saveMessage={builderState.saveMessage}
            isSaving={builderState.isSaving}
            onSave={builderState.handleSaveAllBlocks}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentPageData}
            renderSettingsModal={(show, setShow) => (
              <PageSettingsModal
                open={show}
                onOpenChange={setShow}
                page={currentPageData || null}
                site={site}
                onSuccess={handlePageUpdated}
              />
            )}
          />
        )}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <PagePreview
              blocks={currentPage.blocks}
              site={site ? {
                id: site.id,
                name: site.name,
                subdomain: site.subdomain,
                settings: site.settings
              } : undefined}
              className="min-h-full"
              blocksLoading={blocksLoading}
              allBlocks={currentPage.blocks}
              onSelectBlock={builderState.setSelectedBlock}
              onSelectSiteChrome={handleSelectSiteChrome}
            />
          </ScrollArea>
        </div>

        <PageBlockEditorDialog
          selectedBlock={builderState.selectedBlock}
          draftContent={draftContent}
          siteId={siteId}
          isSaving={isSavingBlock}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseBlockEditor()
            }
          }}
          onContentChange={handleDraftChange}
          onSave={handleSaveBlockEditor}
        />

        {blockListOpen && (
          <BlockListPanel
            blocks={currentPage.blocks}
            blockTypes={PAGE_BLOCK_TYPES}
            entityName="page"
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            onPreview={() => builderState.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={builderState.deleting}
            blocksLoading={blocksLoading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentPage.blocks.map(b => b.type)}
          blockTypes={PAGE_BLOCK_TYPES}
          entityName="page"
        />
      </div>
    </div>
  )
}
